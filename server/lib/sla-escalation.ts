import { db } from "../db";
import { tickets, ticketSlaCycles, ticketAlertsDedup, ticketAssignees, users, userSectorRoles, notifications, notificationSettings } from "@shared/schema";
import { eq, and, isNull, inArray, not } from "drizzle-orm";
import { log } from "../index";

const RISK_THRESHOLD_MINUTES = 4 * 60;

type AlertType = "FIRST_RISK" | "FIRST_BREACH" | "RES_RISK" | "RES_BREACH";

async function isNotificationTypeEnabled(type: string): Promise<boolean> {
  const [setting] = await db.select().from(notificationSettings).where(eq(notificationSettings.type, type as any));
  return setting ? setting.enabled : true;
}

async function getAdminUserIds(): Promise<string[]> {
  const rows = await db.select({ userId: userSectorRoles.userId })
    .from(userSectorRoles)
    .innerJoin(users, and(eq(userSectorRoles.userId, users.id), eq(users.isActive, true)))
    .where(eq(userSectorRoles.roleName, "Admin"));
  return [...new Set(rows.map(r => r.userId))];
}

async function getAssigneeIds(ticketId: string): Promise<string[]> {
  const rows = await db.select({ userId: ticketAssignees.userId })
    .from(ticketAssignees)
    .where(eq(ticketAssignees.ticketId, ticketId));
  return rows.map(r => r.userId);
}

async function tryInsertAlert(ticketId: string, cycleNumber: number, alertType: AlertType): Promise<boolean> {
  try {
    await db.insert(ticketAlertsDedup).values({ ticketId, cycleNumber, alertType });
    return true;
  } catch {
    return false;
  }
}

async function checkAndAlert() {
  const activeStatuses = ["ABERTO", "NA_FILA", "EM_ANDAMENTO", "AGUARDANDO_USUARIO", "AGUARDANDO_APROVACAO", "AGUARDANDO_REQUERENTE", "STANDBY"];

  const activeTickets = await db.select({
    ticket: tickets,
    cycle: ticketSlaCycles,
  })
    .from(tickets)
    .innerJoin(ticketSlaCycles, eq(tickets.id, ticketSlaCycles.ticketId))
    .where(and(
      inArray(tickets.status, activeStatuses),
      isNull(ticketSlaCycles.resolvedAt)
    ));

  const latestCycles = new Map<string, typeof activeTickets[0]>();
  for (const row of activeTickets) {
    const existing = latestCycles.get(row.ticket.id);
    if (!existing || row.cycle.cycleNumber > existing.cycle.cycleNumber) {
      latestCycles.set(row.ticket.id, row);
    }
  }

  const enabled = await isNotificationTypeEnabled("ticket_status");
  if (!enabled) return;

  const now = new Date();
  const riskMs = RISK_THRESHOLD_MINUTES * 60 * 1000;

  for (const [, row] of latestCycles) {
    const { ticket, cycle } = row;

    if (cycle.pausedAt) continue;

    const alerts: { type: AlertType; title: string; message: string }[] = [];

    if (!cycle.firstResponseAt) {
      const firstDue = new Date(cycle.firstResponseDueAt);
      if (now > firstDue) {
        alerts.push({
          type: "FIRST_BREACH",
          title: "SLA estourado — Primeira resposta",
          message: `Chamado "${ticket.title}" estourou o SLA de primeira resposta.`,
        });
      } else if (firstDue.getTime() - now.getTime() < riskMs) {
        alerts.push({
          type: "FIRST_RISK",
          title: "SLA em risco — Primeira resposta",
          message: `Chamado "${ticket.title}" está próximo do prazo de primeira resposta.`,
        });
      }
    }

    const resDue = new Date(cycle.resolutionDueAt);
    if (now > resDue) {
      alerts.push({
        type: "RES_BREACH",
        title: "SLA estourado — Resolução",
        message: `Chamado "${ticket.title}" estourou o SLA de resolução.`,
      });
    } else if (resDue.getTime() - now.getTime() < riskMs) {
      alerts.push({
        type: "RES_RISK",
        title: "SLA em risco — Resolução",
        message: `Chamado "${ticket.title}" está próximo do prazo de resolução.`,
      });
    }

    for (const alert of alerts) {
      const inserted = await tryInsertAlert(ticket.id, cycle.cycleNumber, alert.type);
      if (!inserted) continue;

      const assignees = await getAssigneeIds(ticket.id);
      const admins = await getAdminUserIds();
      const recipientSet = new Set([...assignees, ...admins]);
      const recipients = [...recipientSet];

      if (recipients.length === 0) continue;

      const values = recipients.map(userId => ({
        recipientUserId: userId,
        type: "ticket_status" as const,
        title: alert.title,
        message: alert.message,
        linkUrl: `/tickets/${ticket.id}`,
        data: { alertType: alert.type },
        isRead: false,
      }));

      await db.insert(notifications).values(values);
    }
  }
}

export function startSlaEscalationJob() {
  const INTERVAL = 5 * 60 * 1000;
  setInterval(async () => {
    try {
      await checkAndAlert();
    } catch (err) {
      console.error("SLA escalation job error:", err);
    }
  }, INTERVAL);
  log("SLA escalation job started (every 5 min)", "sla");
}
