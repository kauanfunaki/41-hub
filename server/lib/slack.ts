import { db } from "../db";
import { adminSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

export type SlackChannel = "SLACK_WEBHOOK_TECH" | "SLACK_WEBHOOK_GRUPO41";

export async function getSlackWebhookUrl(key: SlackChannel): Promise<string> {
  const [row] = await db.select().from(adminSettings).where(eq(adminSettings.key, key));
  return row?.value || "";
}

export async function sendSlack(webhookUrl: string, text: string): Promise<void> {
  if (!webhookUrl) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    // fire-and-forget — swallow errors
  }
}

export function isSlackDirectMessagesConfigured(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN);
}

let botIdentityCache: { token: string; teamId: string; expiresAt: number } | undefined;

/** The bot token determines the only workspace this single-workspace integration supports. */
export async function getSlackBotTeamId(): Promise<string> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("Slack bot is not configured");
  if (botIdentityCache?.token === token && botIdentityCache.expiresAt > Date.now()) {
    return botIdentityCache.teamId;
  }
  const response = await fetch("https://slack.com/api/auth.test", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  const result = await response.json() as { ok?: boolean; team_id?: string; bot_id?: string; error?: string };
  if (!response.ok || !result.ok || !result.team_id || !result.bot_id) {
    throw new Error(`Slack bot identity could not be verified: ${result.error || "invalid_bot"}`);
  }
  botIdentityCache = { token, teamId: result.team_id, expiresAt: Date.now() + 5 * 60 * 1000 };
  return result.team_id;
}

export function escapeSlackText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Sends an App Home/DM notification using the workspace bot. This intentionally
 * accepts a Slack member ID rather than an email: members opt in by linking
 * their account, so an email mismatch can never notify the wrong person.
 */
export async function sendSlackDirectMessage(slackUserId: string, text: string): Promise<boolean> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token || !slackUserId) return false;

  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel: slackUserId, text, unfurl_links: false }),
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.json() as { ok?: boolean; error?: string };
    if (!response.ok || !body.ok) {
      console.warn(`[slack] Direct notification was not sent: ${body.error || response.statusText}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[slack] Direct notification failed", error);
    return false;
  }
}
