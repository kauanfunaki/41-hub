import type { TicketWithDetails } from "@shared/schema";

type TicketSlaInput = Pick<TicketWithDetails, "status" | "closedAt" | "currentCycle">;
type SlaStatus = { label: string; color: string; description?: string };

const green = "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
const red = "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";

export function getTicketSlaStatus(ticket: TicketSlaInput, now = Date.now()): SlaStatus | null {
  const cycle = ticket.currentCycle;
  if (ticket.status === "CANCELADO") return null;
  // Completion is a ticket state. A direct ABERTO -> RESOLVIDO transition
  // legitimately has no SLA cycle, since the timer starts in EM_ANDAMENTO.
  if (ticket.status === "RESOLVIDO") {
    const finishedAt = cycle?.resolvedAt || ticket.closedAt;
    const breached = cycle && (cycle.resolvedAt
      ? cycle.resolutionBreached
      : finishedAt && new Date(finishedAt).getTime() > new Date(cycle.resolutionDueAt).getTime());
    return {
      label: breached ? "Concluído · SLA estourado" : "Concluído",
      color: breached ? red : green,
      description: !cycle ? "Chamado resolvido sem ciclo de SLA iniciado."
        : breached ? "Chamado resolvido com o prazo de SLA estourado."
        : "Chamado resolvido dentro do prazo de SLA.",
    };
  }
  // A closed cycle belongs to a previous resolution after a ticket is reopened.
  if (!cycle || cycle.resolvedAt) return null;
  if (cycle.pausedAt) return {
    label: "Pausado",
    color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  const hoursLeft = (new Date(cycle.resolutionDueAt).getTime() - now) / 3_600_000;
  if (hoursLeft < 0) return { label: "Estourado", color: red };
  if (hoursLeft < 4) return {
    label: "Em risco",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  };
  return { label: "Em dia", color: green };
}
