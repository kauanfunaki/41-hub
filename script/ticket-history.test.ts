import assert from "node:assert/strict";
import { after, test } from "node:test";
import { ticketHistoryQuerySchema } from "../shared/ticket-history";
import { getTicketSlaStatus } from "../client/src/lib/ticket-sla-status";
import type { TicketWithDetails, TicketSlaCycle, UserWithRoles } from "../shared/schema";

// No .env, real database, customer data, or external integrations.
process.env.DATABASE_URL = "postgresql://unused:unused@invalid.invalid/test";
const { pool } = await import("../server/db");
const { storage } = await import("../server/storage");
after(async () => { await pool.end(); });

const now = Date.parse("2026-10-30T15:00:00Z");
const cycle = {
  resolutionDueAt: new Date(now + 8 * 3_600_000), resolvedAt: null,
  resolutionBreached: false, pausedAt: null,
} as TicketSlaCycle;
const ticket = (status: string, currentCycle: TicketSlaCycle | null = null) =>
  ({ status, currentCycle, closedAt: new Date(now) }) as TicketWithDetails;

test("direct resolution shows completion without inventing an SLA cycle", () => {
  const badge = getTicketSlaStatus(ticket("RESOLVIDO"), now);
  assert.equal(badge?.label, "Concluído");
  assert.match(badge!.description!, /sem ciclo/);
});

test("late resolution remains completed and retains the SLA breach", () => {
  const badge = getTicketSlaStatus(ticket("RESOLVIDO", {
    ...cycle, resolvedAt: new Date(now), resolutionBreached: true,
  }), now);
  assert.equal(badge?.label, "Concluído · SLA estourado");
});

test("cancelled and reopened tickets do not display completion from an old cycle", () => {
  assert.equal(getTicketSlaStatus(ticket("CANCELADO", cycle), now), null);
  assert.equal(getTicketSlaStatus(ticket("ABERTO", { ...cycle, resolvedAt: new Date(now) }), now), null);
  assert.equal(getTicketSlaStatus(ticket("EM_ANDAMENTO", cycle), now)?.label, "Em dia");
  assert.equal(getTicketSlaStatus(ticket("STANDBY", { ...cycle, pausedAt: new Date(now) }), now)?.label, "Pausado");
});

test("legacy resolved cycle uses the closure time instead of continuing to age", () => {
  assert.equal(getTicketSlaStatus(ticket("RESOLVIDO", cycle), now + 24 * 3_600_000)?.label, "Concluído");
});

test("history rejects invalid, unbounded and repeated pagination parameters", () => {
  for (const query of [{ page: "0" }, { page: "1.5" }, { page: "abc" }, { pageSize: "101" }, { pageSize: "0" }, { page: ["1", "2"] }, { priority: "invalid" }]) {
    assert.equal(ticketHistoryQuerySchema.safeParse(query).success, false);
  }
  assert.deepEqual(ticketHistoryQuerySchema.parse({}), { page: 1, pageSize: 25 });
});

test("history counts beyond 200 and applies a stable paginated query with the same visibility filters", async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  (pool as any).query = async (query: any, params: unknown[]) => {
    const text = typeof query === "string" ? query : query.text;
    queries.push({ text, values: params });
    // Return no item rows so enrichment does not obscure the pagination SQL.
    return /count\(\*\)/.test(text) ? { rows: [[237, 62]] } : { rows: [] };
  };
  const user = { id: "requester", isAdmin: false, roles: [{ roleName: "Coordenador", sectorId: "accounting" }] } as UserWithRoles;
  const result = await storage.listTicketHistoryForUser(user, {
    page: 2, pageSize: 25, q: "synthetic", assignedToMe: true, priority: "ALTA",
  });
  assert.equal(result.total, 237);
  assert.equal(result.filteredTotal, 62);
  assert.equal(result.totalPages, 3);
  assert.equal(result.page, 2);
  assert.equal(queries.length, 2);
  for (const query of queries) {
    for (const value of ["accounting", "requester", "RESOLVIDO", "CANCELADO", "%synthetic%", "ALTA"]) {
      assert.ok(query.values.includes(value), `Missing visibility/filter parameter ${value}`);
    }
    assert.match(query.text, /ticket_additional_requesters/);
    assert.match(query.text, /ticket_assignees/);
  }
  assert.match(queries[1].text, /order by "tickets"\."created_at" desc, "tickets"\."id" desc limit \$\d+ offset \$\d+/);
  assert.deepEqual(queries[1].values.slice(-2), [25, 25]);

  queries.length = 0;
  const clamped = await storage.listTicketHistoryForUser(user, { page: 999, pageSize: 25 });
  assert.equal(clamped.page, 3);
  assert.deepEqual(queries[1].values.slice(-2), [25, 50]);
});
