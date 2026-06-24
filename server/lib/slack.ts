import { db } from "../db";
import { adminSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

export type SlackChannel = "SLACK_WEBHOOK_TECH" | "SLACK_WEBHOOK_GRUPO41";

export async function getSlackWebhookUrl(key: SlackChannel): Promise<string> {
  const [row] = await db.select().from(adminSettings).where(eq(adminSettings.key, key));
  return row?.value || "";
}

export async function sendSlack(
  webhookUrl: string,
  text: string,
  blocks?: object[]
): Promise<void> {
  if (!webhookUrl) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const body: Record<string, unknown> = { text };
    if (blocks?.length) body.blocks = blocks;
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    // fire-and-forget — swallow errors
  }
}
