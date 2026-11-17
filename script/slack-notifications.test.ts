import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import express from "express";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifySlackIdentity } from "../server/lib/slack-identity";
import { getOnboardingStep } from "../client/src/lib/onboarding";

// Deliberately do not read .env: every database operation and Slack request in
// this suite is intercepted, and no real user receives a message.
process.env.DATABASE_URL = "postgresql://unused:unused@invalid.invalid/test";
process.env.NODE_ENV = "development";
process.env.SESSION_SECRET = "test-only-session-secret";
process.env.SLACK_BOT_TOKEN = "xoxb-test-only";
process.env.SLACK_CLIENT_ID = "test-client";
process.env.SLACK_CLIENT_SECRET = "test-only-client-secret";
process.env.SLACK_REDIRECT_URI = "https://hub.example/api/users/me/slack/callback";

const { pool } = await import("../server/db");
const { storage } = await import("../server/storage");
const { notifyTicketParticipantsInSlack } = await import("../server/lib/ticket-slack-notifications");
const app = express();
const messages: { channel: string; text: string }[] = [];
const comments: string[] = [];
const changes: string[] = [];
const userIds = { actor: "actor", requester: "requester", assignee: "assignee", additional: "additional" };
const people = new Map<string, any>([
  ["actor", { id: "actor", name: "Admin", isAdmin: true, isActive: true, authProvider: "local", roles: [], slackUserId: "UACTOR", slackTeamId: "TTEST" }],
  ["requester", { id: "requester", name: "Solicitante", isActive: true, slackUserId: "UREQUESTER", slackTeamId: "TTEST" }],
  ["assignee", { id: "assignee", name: "Responsável", isActive: true, slackUserId: "UASSIGNEE", slackTeamId: "TTEST" }],
  ["additional", { id: "additional", name: "Adicional", isActive: true, slackUserId: "UADDITIONAL", slackTeamId: "TTEST" }],
  ["other-team", { id: "other-team", isActive: true, slackUserId: "UOTHER", slackTeamId: "TOTHER" }],
  ["inactive", { id: "inactive", isActive: false, slackUserId: "UINACTIVE", slackTeamId: "TTEST" }],
  ["unlinked", { id: "unlinked", isActive: true, slackUserId: null }],
]);
let ticket: any;
let assignees = [userIds.actor, userIds.assignee];
let additionalRequesters = [userIds.requester, userIds.additional, "other-team", "inactive", "unlinked"];
const session: any = { userId: "actor", save: (callback: (error?: unknown) => void) => callback(), destroy: () => {} };
const originalFetch = globalThis.fetch;
let identityToken = "";
let remoteKeys: any;

before(async () => {
  (pool as any).query = async (query: any) => {
    const text = typeof query === "string" ? query : query.text || "";
    if (text.includes("MAX(cycle_number)")) return { rows: [{ max_cycle: 1 }] };
    return { rows: [] };
  };
  storage.getUser = async (id) => people.get(id);
  storage.getUserWithRoles = async (id) => people.get(id);
  storage.getUserByEmail = async () => people.get("actor");
  storage.updateUser = async (id, update) => {
    const updated = { ...people.get(id), ...update };
    people.set(id, updated);
    return updated;
  };
  storage.getTicketDetail = async () => ticket;
  storage.getTicketAssigneeIds = async () => assignees;
  storage.getTicketAdditionalRequesterIds = async () => additionalRequesters;
  storage.adminUpdateTicket = async (_, patch) => {
    if (patch.status) changes.push(patch.status);
    ticket = { ...ticket, ...patch };
    return ticket;
  };
  storage.addTicketComment = async (_, __, comment) => {
    comments.push(comment.body);
    return { id: "comment", ...comment } as any;
  };
  storage.createAuditLog = async () => undefined as any;
  storage.isNotificationEnabled = async () => false;
  storage.listAllTicketCategories = async () => [{ id: "category" }] as any;
  storage.resolveApprovers = async () => ["actor"];
  storage.getLatestReopenRequest = async () => ({ id: "request", status: "PENDING", requestedBy: "requester" }) as any;
  storage.decideReopenRequest = async () => undefined as any;
  storage.createReopenRequest = async () => ({ id: "request" }) as any;
  storage.adminSetAssignees = async (_, ids) => { assignees = ids; };
  storage.getAdminUserIds = async () => ["actor", "assignee", "additional"];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "https://slack.com/api/auth.test") return Response.json({ ok: true, team_id: "TTEST", bot_id: "BTEST" });
    if (url === "https://slack.com/api/chat.postMessage") {
      messages.push(JSON.parse(String(init?.body)));
      return Response.json({ ok: true });
    }
    if (url === "https://slack.com/api/openid.connect.token") return Response.json({ ok: true, id_token: identityToken });
    if (url === "https://slack.com/openid/connect/keys") return Response.json(remoteKeys);
    throw new Error(`Unexpected network request: ${url}`);
  };
  const { registerRoutes } = await import("../server/routes");
  await registerRoutes(createServer(app), app);
});

after(async () => { globalThis.fetch = originalFetch; await pool.end(); });

async function dispatch(method: string, path: string, body: unknown = {}, query: unknown = {}) {
  const route = (app as any).router.stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method]);
  assert.ok(route, `Route ${method} ${path} must exist`);
  const req: any = { body, query, params: { id: "ticket" }, session, ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" } };
  const res: any = {
    statusCode: 200, body: undefined, location: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
    redirect(location: string) { this.statusCode = 302; this.location = location; return this; },
  };
  for (const layer of route.route.stack) {
    let nextCalled = false;
    await layer.handle(req, res, () => { nextCalled = true; });
    if (!nextCalled) break;
  }
  await new Promise<void>((resolve) => setImmediate(resolve));
  return res;
}

function resetTicket(status = "ABERTO") {
  ticket = { id: "ticket", title: "Teste <@UALL>", createdBy: "requester", categoryId: "category", status };
  messages.length = 0;
  comments.length = 0;
  changes.length = 0;
  session.userId = "actor";
}

function assertParticipants(fragment: RegExp) {
  assert.deepEqual(messages.map((m) => m.channel).sort(), ["UADDITIONAL", "UASSIGNEE", "UREQUESTER"]);
  assert.ok(messages.every((m) => fragment.test(m.text)));
  assert.ok(messages.every((m) => !m.text.includes("Abrir chamado:")));
  assert.ok(messages.every((m) => m.text.includes("&lt;@UALL&gt;")));
}

test("public changes notify each active linked participant once, excluding the actor and other workspaces", async () => {
  resetTicket();
  await notifyTicketParticipantsInSlack(ticket, people.get("actor"), "Atualização");
  assertParticipants(/Atualização/);
});

test("first access prioritizes password, then tutorial, then Slack; admins skip only the tutorial", () => {
  const user = { authProvider: "local" as const, mustChangePassword: true, isAdmin: false, tutorialCompleted: false };
  assert.equal(getOnboardingStep(null), "none");
  assert.equal(getOnboardingStep(user), "password");
  assert.equal(getOnboardingStep({ ...user, mustChangePassword: false }), "tutorial");
  assert.equal(getOnboardingStep({ ...user, mustChangePassword: false, tutorialCompleted: true }), "slack");
  assert.equal(getOnboardingStep({ ...user, isAdmin: true }), "password");
  assert.equal(getOnboardingStep({ ...user, mustChangePassword: false, isAdmin: true }), "slack");
  assert.equal(getOnboardingStep({ ...user, authProvider: "entra" }), "tutorial");
});

test("unchanged ticket fields do not send a misleading update notification", async () => {
  resetTicket();
  const result = await dispatch("patch", "/api/tickets/:id", { status: "ABERTO", title: ticket.title });
  assert.equal(result.statusCode, 200);
  assert.equal(messages.length, 0);
});

test("newly assigned users receive the assignment update", async () => {
  resetTicket();
  additionalRequesters = [];
  assignees = ["actor"];
  const result = await dispatch("put", "/api/tickets/:id/assignees", { assigneeIds: ["actor", "assignee"] });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(messages.map((message) => message.channel).sort(), ["UASSIGNEE", "UREQUESTER"]);
  assignees = ["actor", "assignee"];
  additionalRequesters = ["requester", "additional", "other-team", "inactive", "unlinked"];
});

test("internal comments do not notify Slack", async () => {
  resetTicket();
  const result = await dispatch("post", "/api/tickets/:id/comments", { body: "Nota interna", isInternal: true });
  assert.equal(result.statusCode, 201);
  assert.equal(messages.length, 0);
});

test("request-info sends one notification whether or not it changes the status", async () => {
  for (const markAwaiting of [true, false]) {
    resetTicket();
    const result = await dispatch("post", "/api/tickets/:id/request-info", { message: "Envie o comprovante", markAwaiting });
    assert.equal(result.statusCode, 200);
    assert.equal(comments.length, 1);
    assert.deepEqual(changes, markAwaiting ? ["AGUARDANDO_REQUERENTE"] : []);
    assertParticipants(/solicitadas informações/);
  }
});

test("approval and rejection notify participants with the resulting status", async () => {
  for (const [path, status, description] of [
    ["/api/tickets/:id/approve", "ABERTO", /aprovado/],
    ["/api/tickets/:id/reject", "CANCELADO", /rejeitado/],
  ] as const) {
    resetTicket("AGUARDANDO_APROVACAO");
    const result = await dispatch("post", path, { note: "Decisão de teste" });
    assert.equal(result.statusCode, 200);
    assert.deepEqual(changes, [status]);
    assertParticipants(description);
  }
});

test("both reopen decisions notify participants, including the requester", async () => {
  for (const action of ["accept", "reject"]) {
    resetTicket("RESOLVIDO");
    const result = await dispatch("post", "/api/tickets/:id/reopen-request/decision", { action, note: "Decisão de teste" });
    assert.equal(result.statusCode, 200);
    assert.deepEqual(changes, action === "accept" ? ["EM_ANDAMENTO"] : []);
    assertParticipants(action === "accept" ? /reabertura foi aceita/ : /reabertura foi recusada/);
  }
});

test("temporary dismissal persists through subsequent requests and resets on the next login", async () => {
  delete session.slackReminderDismissedForUserId;
  people.get("actor").slackConnectReminderDismissed = false;
  let result = await dispatch("patch", "/api/users/me/slack/reminder", { dismissed: false });
  assert.equal(result.statusCode, 200);
  result = await dispatch("get", "/api/users/me/slack");
  assert.equal(result.body.sessionDismissed, true);
  assert.equal(result.body.reminderDismissed, false);
  await dispatch("get", "/api/auth/login");
  result = await dispatch("get", "/api/users/me/slack");
  assert.equal(result.body.sessionDismissed, false);
});

test("permanent dismissal survives a new login and stays isolated to the account", async () => {
  await dispatch("patch", "/api/users/me/slack/reminder", { dismissed: true });
  await dispatch("get", "/api/auth/login");
  const result = await dispatch("get", "/api/users/me/slack");
  assert.equal(result.body.reminderDismissed, true);
  session.userId = "requester";
  const other = await dispatch("get", "/api/users/me/slack");
  assert.equal(other.body.sessionDismissed, false);
  assert.notEqual(other.body.reminderDismissed, true);
  session.userId = "actor";
});

test("OAuth pins the bot workspace and rejects cancelled or mismatched callbacks without changing the identity", async () => {
  const connect = await dispatch("get", "/api/users/me/slack/connect");
  assert.equal(new URL(connect.location).searchParams.get("team"), "TTEST");
  assert.equal(session.slackOauthUserId, "actor");
  const result = await dispatch("get", "/api/users/me/slack/callback", {}, { code: "bad", state: "wrong" });
  assert.equal(result.location, "/profile?slack=cancelled");
  assert.equal(session.slackOauthState, undefined);
  assert.equal(people.get("actor").slackUserId, "UACTOR");
});

test("OAuth callback verifies a signed response before linking, rejects other workspaces and prevents replay", async () => {
  const pair = await generateKeyPair("RS256");
  remoteKeys = { keys: [{ ...await exportJWK(pair.publicKey), kid: "oauth" }] };
  const sign = (teamId: string) => new SignJWT({
    sub: "UOAUTH", nonce: session.slackOauthNonce, "https://slack.com/team_id": teamId,
  }).setProtectedHeader({ alg: "RS256", kid: "oauth" }).setIssuer("https://slack.com")
    .setAudience("test-client").setIssuedAt().setExpirationTime("2m").sign(pair.privateKey);
  await dispatch("get", "/api/users/me/slack/connect");
  const state = session.slackOauthState;
  identityToken = await sign("TTEST");
  let result = await dispatch("get", "/api/users/me/slack/callback", {}, { code: "good", state });
  assert.equal(result.location, "/profile?slack=connected");
  assert.equal(people.get("actor").slackUserId, "UOAUTH");
  assert.equal(people.get("actor").slackTeamId, "TTEST");
  result = await dispatch("get", "/api/users/me/slack/callback", {}, { code: "good", state });
  assert.equal(result.location, "/profile?slack=cancelled");
  await dispatch("get", "/api/users/me/slack/connect");
  identityToken = await sign("TOTHER");
  result = await dispatch("get", "/api/users/me/slack/callback", {}, { code: "good", state: session.slackOauthState });
  assert.equal(result.location, "/profile?slack=wrong_workspace");
  assert.equal(people.get("actor").slackTeamId, "TTEST");
  people.get("actor").slackUserId = "UACTOR";
});

test("signed Slack identities validate signature, expiry, audience, nonce and workspace", async () => {
  const pair = await generateKeyPair("RS256");
  const jwk = await exportJWK(pair.publicKey);
  const keys = createLocalJWKSet({ keys: [{ ...jwk, kid: "test" }] });
  const expected = { nonce: "test-nonce", clientId: "test-client", teamId: "TTEST" };
  const sign = (overrides: Record<string, unknown> = {}) => new SignJWT({
    sub: "UTEST", iss: "https://slack.com", aud: "test-client", nonce: "test-nonce",
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 120,
    "https://slack.com/team_id": "TTEST", ...overrides,
  }).setProtectedHeader({ alg: "RS256", kid: "test" }).sign(pair.privateKey);
  assert.deepEqual(await verifySlackIdentity(await sign(), expected, keys), { userId: "UTEST", teamId: "TTEST" });
  for (const bad of [
    { exp: 1 }, { aud: "other-client" }, { nonce: "wrong" },
    { "https://slack.com/team_id": "TOTHER" }, { sub: "invalid" },
  ]) await assert.rejects(verifySlackIdentity(await sign(bad), expected, keys));
  const otherPair = await generateKeyPair("RS256");
  const forged = await new SignJWT({ sub: "UTEST" }).setProtectedHeader({ alg: "RS256", kid: "test" }).sign(otherPair.privateKey);
  await assert.rejects(verifySlackIdentity(forged, expected, keys));
});
