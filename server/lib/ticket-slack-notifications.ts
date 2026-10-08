import type { UserWithRoles } from "@shared/schema";
import { storage } from "../storage";
import { escapeSlackText, getSlackBotTeamId, isSlackDirectMessagesConfigured, sendSlackDirectMessage } from "./slack";

type TicketNotification = {
  id: string;
  title: string;
  createdBy: string;
};

/** Sends a best-effort Slack DM to current ticket participants, never the actor. */
export async function notifyTicketParticipantsInSlack(
  ticket: TicketNotification,
  actor: Pick<UserWithRoles, "id" | "name">,
  change: string,
): Promise<void> {
  if (!isSlackDirectMessagesConfigured()) return;

  try {
    const botTeamId = await getSlackBotTeamId();
    const [assignees, additionalRequesters] = await Promise.all([
      storage.getTicketAssigneeIds(ticket.id),
      storage.getTicketAdditionalRequesterIds(ticket.id),
    ]);
    const participantIds = Array.from(new Set([ticket.createdBy, ...additionalRequesters, ...assignees]))
      .filter((id) => id !== actor.id);

    const participants = await Promise.all(participantIds.map((id) => storage.getUser(id)));
    const message = [
      `*Chamado atualizado:* ${escapeSlackText(ticket.title)}`,
      escapeSlackText(change),
      `Alterado por: ${escapeSlackText(actor.name)}`,
    ].join("\n");

    await Promise.allSettled(
      participants
        .filter((user): user is NonNullable<typeof user> => Boolean(user?.isActive && user.slackUserId && user.slackTeamId === botTeamId))
        .map((user) => sendSlackDirectMessage(user.slackUserId!, message)),
    );
  } catch (error) {
    // Ticket operations must not fail if Slack is unavailable.
    console.warn("[slack] Failed to dispatch ticket notifications", error);
  }
}
