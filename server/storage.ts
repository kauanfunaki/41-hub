import { eq, and, desc, sql, inArray, or, ilike, ne, asc } from "drizzle-orm";
import { db, pool } from "./db";
import {
  users,
  sectors,
  roles,
  userSectorRoles,
  resources,
  resourceOverrides,
  favorites,
  recentAccess,
  auditLogs,
  healthChecks,
  adminSettings,
  ticketCategories,
  ticketSlaPolicies,
  tickets,
  ticketAssignees,
  ticketComments,
  ticketAttachments,
  ticketSlaCycles,
  ticketEvents,
  notificationSettings,
  notifications,
  type User,
  type InsertUser,
  type Sector,
  type InsertSector,
  type Role,
  type Resource,
  type InsertResource,
  type UserSectorRole,
  type InsertUserSectorRole,
  type ResourceOverride,
  type InsertResourceOverride,
  type Favorite,
  type InsertFavorite,
  type AuditLog,
  type InsertAuditLog,
  type HealthCheck,
  type UserWithRoles,
  type ResourceWithHealth,
  type AdminSetting,
  type TicketCategory,
  type InsertTicketCategory,
  type TicketSlaPolicy,
  type InsertTicketSlaPolicy,
  type Ticket,
  type TicketWithDetails,
  type TicketComment,
  type TicketAttachment,
  type TicketSlaCycle,
  type TicketCategoryTree,
  type TicketAssignee,
  type NotificationSetting,
  type Notification,
  kbArticles,
  kbArticleViews,
  kbArticleFeedback,
  type KbArticle,
  type InsertKbArticle,
  type KbArticleFeedback as KbArticleFeedbackType,
  ticketChecklistItems,
  type TicketChecklistItem,
  ticketApprovals,
  type TicketApproval,
  ticketAlertsDedup,
  typingTexts,
  typingSessions,
  typingScores,
  type TypingText,
  type InsertTypingText,
  type TypingSession,
  type TypingScore,
  pushSubscriptions,
} from "@shared/schema";
import webpush from "web-push";
import { computeSlaDueDates, addBusinessMinutes, businessMinutesBetween } from "./lib/sla";

// ── Schema-mismatch resilience ─────────────────────────────────────────────
// New Drizzle schema columns (health_status_override, health_message, etc.)
// may not exist in the production database until migrations are applied.
// Postgres returns error code 42703 ("column does not exist") or 42P01
// ("relation does not exist") in that case. These helpers let us detect those
// errors and fall back to raw SQL using only the pre-migration columns.

function isPgSchemaMismatch(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: string }).code;
    return code === "42703" || code === "42P01";
  }
  return false;
}

/** Maps a raw pool.query row (snake_case) to ResourceWithHealth. */
function mapRawResourceRow(
  r: Record<string, any>,
  isFavorite: boolean
): ResourceWithHealth {
  return {
    id: r.id,
    name: r.name,
    type: r.type as "APP" | "DASHBOARD",
    sectorId: r.sector_id ?? null,
    icon: r.icon ?? "Layout",
    tags: r.tags ?? [],
    embedMode: (r.embed_mode ?? "LINK") as any,
    openBehavior: (r.open_behavior ?? "BOTH") as any,
    url: r.url ?? null,
    metadata: r.metadata ?? {},
    isActive: r.is_active,
    createdAt: r.created_at,
    // New columns not yet in prod DB — default to null
    healthStatusOverride: null,
    healthMessage: null,
    healthUpdatedAt: null,
    healthUpdatedBy: null,
    sectorName: r.sector_name || undefined,
    healthStatus: r.health_status as "UP" | "DEGRADED" | "DOWN" | undefined,
    isFavorite,
  };
}

const SAFE_RESOURCE_COLS = `
  r.id, r.name, r.type, r.sector_id, r.icon, r.tags,
  r.embed_mode, r.open_behavior, r.url, r.metadata,
  r.is_active, r.created_at,
  s.name  AS sector_name,
  hc.status AS health_status
`;

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByEntraOid(oid: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getUserWithRoles(id: string): Promise<UserWithRoles | undefined>;
  getAllUsersWithRoles(): Promise<UserWithRoles[]>;

  // Sectors
  getSector(id: string): Promise<Sector | undefined>;
  createSector(sector: InsertSector): Promise<Sector>;
  updateSector(id: string, data: Partial<InsertSector>): Promise<Sector | undefined>;
  deleteSector(id: string): Promise<boolean>;
  getAllSectors(): Promise<Sector[]>;

  // Roles
  getRoleByName(name: string): Promise<Role | undefined>;
  getAllRoles(): Promise<Role[]>;

  // User-Sector-Roles
  addUserSectorRole(data: InsertUserSectorRole): Promise<UserSectorRole>;
  removeUserSectorRole(userId: string, sectorId: string): Promise<boolean>;
  getUserSectorRoles(userId: string): Promise<UserSectorRole[]>;

  // Resources
  getResource(id: string): Promise<Resource | undefined>;
  createResource(resource: InsertResource): Promise<Resource>;
  updateResource(id: string, data: Partial<InsertResource>): Promise<Resource | undefined>;
  deleteResource(id: string): Promise<boolean>;
  getAllResources(): Promise<Resource[]>;
  getResourcesForUser(userId: string): Promise<ResourceWithHealth[]>;
  getResourceWithHealth(id: string, userId?: string): Promise<ResourceWithHealth | undefined>;

  // Resource Overrides
  getResourceOverride(userId: string, resourceId: string): Promise<ResourceOverride | undefined>;
  setResourceOverride(data: InsertResourceOverride): Promise<ResourceOverride>;
  removeResourceOverride(userId: string, resourceId: string): Promise<boolean>;
  getResourceOverridesForUser(userId: string): Promise<ResourceOverride[]>;

  // Favorites
  getFavorite(userId: string, resourceId: string): Promise<Favorite | undefined>;
  addFavorite(data: InsertFavorite): Promise<Favorite>;
  removeFavorite(userId: string, resourceId: string): Promise<boolean>;
  getUserFavorites(userId: string): Promise<ResourceWithHealth[]>;

  // Recent Access
  recordAccess(userId: string, resourceId: string): Promise<void>;
  getRecentAccess(userId: string, limit?: number): Promise<ResourceWithHealth[]>;

  // Audit Logs
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(limit?: number): Promise<AuditLog[]>;
  getAuditLogsWithActors(limit?: number): Promise<(AuditLog & { actorName?: string; actorEmail?: string })[]>;

  // Health Checks
  getHealthCheck(resourceId: string): Promise<HealthCheck | undefined>;
  upsertHealthCheck(resourceId: string, status: "UP" | "DEGRADED" | "DOWN", responseTimeMs?: number): Promise<HealthCheck>;

  // Stats
  getAdminStats(): Promise<{ users: number; sectors: number; resources: number; auditLogs: number }>;

  // Team
  getTeamMembers(userId: string): Promise<Array<{
    id: string;
    name: string;
    email: string;
    whatsapp: string | null;
    photoUrl: string | null;
    roles: Array<{ sectorId: string; sectorName: string; roleName: "Admin" | "Coordenador" | "Usuario" }>;
  }>>;

  // Directory
  getDirectory(options: {
    userId: string;
    sectorId?: string;
    query?: string;
    showAll?: boolean;
  }): Promise<Array<{
    id: string;
    name: string;
    email: string;
    whatsapp: string | null;
    photoUrl: string | null;
    roles: Array<{ sectorId: string; sectorName: string; roleName: "Admin" | "Coordenador" | "Usuario" }>;
  }>>;

  // Admin Settings
  getSetting(key: string): Promise<AdminSetting | undefined>;
  setSetting(key: string, value: string): Promise<AdminSetting>;
  getAllSettings(): Promise<AdminSetting[]>;

  // Sectors by name
  getSectorByName(name: string): Promise<Sector | undefined>;

  // Ticket Categories
  listTicketCategoriesActive(): Promise<TicketCategoryTree[]>;
  listAllTicketCategories(): Promise<TicketCategory[]>;
  createTicketCategory(data: InsertTicketCategory): Promise<TicketCategory>;
  updateTicketCategory(id: string, data: Partial<InsertTicketCategory>): Promise<TicketCategory | undefined>;
  disableTicketCategory(id: string): Promise<boolean>;

  // Ticket SLA Policies
  listSlaPolicies(): Promise<TicketSlaPolicy[]>;
  createSlaPolicy(data: InsertTicketSlaPolicy): Promise<TicketSlaPolicy>;
  updateSlaPolicy(id: string, data: Partial<InsertTicketSlaPolicy>): Promise<TicketSlaPolicy | undefined>;

  // Tickets
  createTicket(data: {
    title: string;
    description: string;
    requesterSectorId: string;
    categoryId: string;
    priority?: "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";
    relatedResourceId?: string;
    tags?: string[];
    requestData?: Record<string, any>;
  }, actorUser: UserWithRoles): Promise<Ticket>;

  listTicketsForUser(user: UserWithRoles, filters: {
    status?: string;
    q?: string;
    includeClosed?: boolean;
  }): Promise<TicketWithDetails[]>;

  getTicketDetail(ticketId: string, user: UserWithRoles): Promise<TicketWithDetails | undefined>;

  adminUpdateTicket(ticketId: string, patch: Partial<{
    status: string;
    priority: string;
    categoryId: string;
    relatedResourceId: string | null;
    tags: string[];
    title: string;
    description: string;
  }>, actorUser: UserWithRoles): Promise<Ticket | undefined>;

  adminSetAssignees(ticketId: string, assigneeIds: string[], actorUser: UserWithRoles): Promise<void>;

  addTicketComment(ticketId: string, authorUser: UserWithRoles, data: {
    body: string;
    isInternal?: boolean;
  }): Promise<TicketComment>;

  addTicketAttachment(ticketId: string, authorUser: UserWithRoles, fileMeta: {
    originalName: string;
    storageName: string;
    mimeType: string;
    sizeBytes: number;
    attachmentKey?: string;
  }): Promise<TicketAttachment>;

  listTicketComments(ticketId: string, user: UserWithRoles): Promise<(TicketComment & { authorName?: string; authorEmail?: string })[]>;
  listTicketAttachments(ticketId: string, user: UserWithRoles): Promise<TicketAttachment[]>;
  listTicketEvents(ticketId: string): Promise<Array<import("@shared/schema").TicketEvent & { actorName?: string }>>;

  getTicketAttachmentRequirements(ticketId: string): Promise<Array<{ key: string; label: string; mime?: string[]; required?: boolean; satisfied: boolean }>>;

  listTicketChecklistItems(ticketId: string): Promise<import("@shared/schema").TicketChecklistItem[]>;
  updateChecklistItem(ticketId: string, itemId: string, isDone: boolean, userId: string): Promise<import("@shared/schema").TicketChecklistItem | undefined>;

  getAdminUserIds(): Promise<string[]>;
  updateSlaCycleDeadline(ticketId: string, data: { resolutionDueAt: Date; reason?: string; updatedBy: string }): Promise<void>;

  // Notifications
  getNotificationSettings(): Promise<import("@shared/schema").NotificationSetting[]>;
  setNotificationSetting(type: string, enabled: boolean): Promise<import("@shared/schema").NotificationSetting>;
  isNotificationEnabled(type: string): Promise<boolean>;
  createNotifications(recipients: string[], payload: { type: string; title: string; message: string; linkUrl?: string; data?: Record<string, unknown> }): Promise<void>;
  listUserNotifications(userId: string, opts: { limit?: number; offset?: number }): Promise<import("@shared/schema").Notification[]>;
  countUnreadNotifications(userId: string): Promise<number>;
  markNotificationRead(userId: string, notificationId: string): Promise<boolean>;
  markAllNotificationsRead(userId: string): Promise<void>;

  // Push subscriptions
  savePushSubscription(data: { userId: string; endpoint: string; p256dh: string; auth: string }): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<void>;

  // Notification helpers
  getTicketAssigneeIds(ticketId: string): Promise<string[]>;

  // Approvals
  getTicketApproval(ticketId: string, cycleNumber: number): Promise<TicketApproval | undefined>;
  resolveApprovers(ticket: Ticket, category: TicketCategory): Promise<string[]>;

  // Knowledge Base
  listKbArticles(filters: { categoryId?: string; q?: string; tags?: string[]; publishedOnly?: boolean }): Promise<(KbArticle & { categoryName?: string; authorName?: string; viewCount?: number; helpfulCount?: number; notHelpfulCount?: number })[]>;
  getKbArticle(id: string): Promise<(KbArticle & { categoryName?: string; authorName?: string; viewCount?: number; helpfulCount?: number; notHelpfulCount?: number }) | undefined>;
  createKbArticle(data: InsertKbArticle): Promise<KbArticle>;
  updateKbArticle(id: string, data: Partial<InsertKbArticle>): Promise<KbArticle | undefined>;
  deleteKbArticle(id: string): Promise<boolean>;
  logKbArticleView(articleId: string, userId: string): Promise<void>;
  submitKbArticleFeedback(articleId: string, userId: string, helpful: boolean): Promise<KbArticleFeedbackType>;

  // Typing Test
  listTypingTexts(activeOnly?: boolean): Promise<TypingText[]>;
  getTypingText(id: string): Promise<TypingText | undefined>;
  createTypingText(data: InsertTypingText): Promise<TypingText>;
  updateTypingText(id: string, data: Partial<InsertTypingText>): Promise<TypingText | undefined>;
  deleteTypingText(id: string): Promise<boolean>;
  createTypingSession(userId: string, textId: string, nonce: string, expiresAt: Date): Promise<TypingSession>;
  getTypingSession(id: string): Promise<TypingSession | undefined>;
  getTypingSessionByNonce(nonce: string): Promise<TypingSession | undefined>;
  submitTypingSession(sessionId: string, score: { wpm: number; accuracy: string; durationMs: number; userId: string; sectorId: string | null; monthKey: string; difficulty: number; level: string }): Promise<TypingScore>;
  getTypingLeaderboard(opts: { monthKey: string; sectorId?: string; level?: string; limit?: number }): Promise<Array<{ userId: string; userName: string; userPhoto: string | null; sectorName: string | null; wpm: number; accuracy: string; monthKey: string; level: string }>>;
  getUserBestTypingScore(userId: string, level?: string): Promise<TypingScore | undefined>;
  getTypingPodium(monthKey: string): Promise<Array<{ level: string; rank: number; userId: string; userName: string; userPhoto: string | null; wpm: number; accuracy: string }>>;

  // TI Dashboard
  getTiDashboard(range: '7d' | '30d'): Promise<{
    summary: { open: number; inProgress: number; waitingUser: number; resolved: number; cancelled: number; slaOk: number; slaRisk: number; slaBreached: number };
    queue: Array<{
      ticketId: string; title: string; status: string; priority: string;
      categoryName: string; categoryBranch: string;
      creatorName: string; createdAt: string;
      assignees: string[];
      slaState: 'OK' | 'RISK' | 'BREACHED';
      resolutionDueAt: string | null;
    }>;
    wipByAssignee: Array<{ userId: string; userName: string; count: number }>;
    throughput: Array<{ date: string; resolved: number; opened: number }>;
    backlogByCategory: Array<{ categoryName: string; categoryBranch: string; count: number }>;
  }>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByEntraOid(oid: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.entraOid, oid));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(users.name);
  }

  async getUserWithRoles(id: string): Promise<UserWithRoles | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;

    const userRoles = await db
      .select({
        sectorId: userSectorRoles.sectorId,
        sectorName: sectors.name,
        roleName: roles.name,
      })
      .from(userSectorRoles)
      .innerJoin(sectors, eq(userSectorRoles.sectorId, sectors.id))
      .innerJoin(roles, eq(userSectorRoles.roleId, roles.id))
      .where(eq(userSectorRoles.userId, id));

    const isAdmin = userRoles.some((r) => r.roleName === "Admin");

    return {
      ...user,
      roles: userRoles as Array<{ sectorId: string; sectorName: string; roleName: "Admin" | "Coordenador" | "Usuario" }>,
      isAdmin,
    };
  }

  async getAllUsersWithRoles(): Promise<UserWithRoles[]> {
    const allUsers = await this.getAllUsers();
    const results: UserWithRoles[] = [];

    for (const user of allUsers) {
      const userWithRoles = await this.getUserWithRoles(user.id);
      if (userWithRoles) {
        results.push(userWithRoles);
      }
    }

    return results;
  }

  // Sectors
  async getSector(id: string): Promise<Sector | undefined> {
    const [sector] = await db.select().from(sectors).where(eq(sectors.id, id));
    return sector;
  }

  async createSector(sector: InsertSector): Promise<Sector> {
    const [newSector] = await db.insert(sectors).values(sector).returning();
    return newSector;
  }

  async updateSector(id: string, data: Partial<InsertSector>): Promise<Sector | undefined> {
    const [updated] = await db.update(sectors).set(data).where(eq(sectors.id, id)).returning();
    return updated;
  }

  async deleteSector(id: string): Promise<boolean> {
    const result = await db.delete(sectors).where(eq(sectors.id, id));
    return true;
  }

  async getAllSectors(): Promise<Sector[]> {
    return db.select().from(sectors).orderBy(sectors.name);
  }

  // Roles
  async getRoleByName(name: string): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.name, name as any));
    return role;
  }

  async getAllRoles(): Promise<Role[]> {
    return db.select().from(roles);
  }

  // User-Sector-Roles
  async addUserSectorRole(data: InsertUserSectorRole): Promise<UserSectorRole> {
    const [newRole] = await db.insert(userSectorRoles).values(data).returning();
    return newRole;
  }

  async removeUserSectorRole(userId: string, sectorId: string): Promise<boolean> {
    await db
      .delete(userSectorRoles)
      .where(and(eq(userSectorRoles.userId, userId), eq(userSectorRoles.sectorId, sectorId)));
    return true;
  }

  async getUserSectorRoles(userId: string): Promise<UserSectorRole[]> {
    return db.select().from(userSectorRoles).where(eq(userSectorRoles.userId, userId));
  }

  // Resources
  async getResource(id: string): Promise<Resource | undefined> {
    const [resource] = await db.select().from(resources).where(eq(resources.id, id));
    return resource;
  }

  async createResource(resource: InsertResource): Promise<Resource> {
    const [newResource] = await db.insert(resources).values(resource).returning();
    return newResource;
  }

  async updateResource(id: string, data: Partial<InsertResource>): Promise<Resource | undefined> {
    const [updated] = await db.update(resources).set(data).where(eq(resources.id, id)).returning();
    return updated;
  }

  async deleteResource(id: string): Promise<boolean> {
    await db.delete(resources).where(eq(resources.id, id));
    return true;
  }

  async getAllResources(): Promise<Resource[]> {
    try {
      return await db.select().from(resources).orderBy(resources.name);
    } catch (err) {
      if (isPgSchemaMismatch(err)) {
        console.warn("[storage] Schema mismatch in getAllResources, falling back to safe query:", (err as any).message);
        const { rows } = await pool.query(
          `SELECT r.id, r.name, r.type, r.sector_id, r.icon, r.tags,
                  r.embed_mode, r.open_behavior, r.url, r.metadata,
                  r.is_active, r.created_at
           FROM resources r ORDER BY r.name`
        );
        return rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          type: r.type as "APP" | "DASHBOARD",
          sectorId: r.sector_id ?? null,
          icon: r.icon ?? "Layout",
          tags: r.tags ?? [],
          embedMode: (r.embed_mode ?? "LINK") as any,
          openBehavior: (r.open_behavior ?? "BOTH") as any,
          url: r.url ?? null,
          metadata: r.metadata ?? {},
          isActive: r.is_active,
          createdAt: r.created_at,
          healthStatusOverride: null,
          healthMessage: null,
          healthUpdatedAt: null,
          healthUpdatedBy: null,
        })) as Resource[];
      }
      throw err;
    }
  }

  async getResourcesForUser(userId: string): Promise<ResourceWithHealth[]> {
    const userWithRoles = await this.getUserWithRoles(userId);
    if (!userWithRoles) return [];

    // If admin, return all active resources
    if (userWithRoles.isAdmin) {
      let allResources: Array<{ resource: Resource; sectorName: string | null; healthStatus: string | null }>;
      try {
        allResources = await db
          .select({
            resource: resources,
            sectorName: sectors.name,
            healthStatus: healthChecks.status,
          })
          .from(resources)
          .leftJoin(sectors, eq(resources.sectorId, sectors.id))
          .leftJoin(healthChecks, eq(resources.id, healthChecks.resourceId))
          .where(eq(resources.isActive, true))
          .orderBy(resources.name);
      } catch (err) {
        if (isPgSchemaMismatch(err)) {
          console.warn("[storage] Schema mismatch in getResourcesForUser(admin), falling back to safe query:", (err as any).message);
          const { rows } = await pool.query(
            `SELECT ${SAFE_RESOURCE_COLS}
             FROM resources r
             LEFT JOIN sectors s ON r.sector_id = s.id
             LEFT JOIN health_checks hc ON r.id = hc.resource_id
             WHERE r.is_active = true ORDER BY r.name`
          );
          const favRows = await pool.query(
            `SELECT resource_id FROM favorites WHERE user_id = $1`, [userId]
          );
          const favoriteIds = new Set<string>(favRows.rows.map((f: any) => f.resource_id));
          return rows.map((r: any) => mapRawResourceRow(r, favoriteIds.has(r.id)));
        }
        throw err;
      }

      const userFavorites = await db.select().from(favorites).where(eq(favorites.userId, userId));
      const favoriteIds = new Set(userFavorites.map((f) => f.resourceId));

      return allResources.map((r) => ({
        ...r.resource,
        sectorName: r.sectorName || undefined,
        healthStatus: r.healthStatus as "UP" | "DEGRADED" | "DOWN" | undefined,
        isFavorite: favoriteIds.has(r.resource.id),
      }));
    }

    // Get user's sectors
    const userSectorIds = userWithRoles.roles.map((r) => r.sectorId);
    if (userSectorIds.length === 0) return [];

    // Get resources from user's sectors
    let sectorResources: Array<{ resource: Resource; sectorName: string | null; healthStatus: string | null }>;
    try {
      sectorResources = await db
        .select({
          resource: resources,
          sectorName: sectors.name,
          healthStatus: healthChecks.status,
        })
        .from(resources)
        .leftJoin(sectors, eq(resources.sectorId, sectors.id))
        .leftJoin(healthChecks, eq(resources.id, healthChecks.resourceId))
        .where(and(eq(resources.isActive, true), inArray(resources.sectorId, userSectorIds)))
        .orderBy(resources.name);
    } catch (err) {
      if (isPgSchemaMismatch(err)) {
        console.warn("[storage] Schema mismatch in getResourcesForUser(user), falling back to safe query:", (err as any).message);
        const placeholders = userSectorIds.map((_, i) => `$${i + 1}`).join(", ");
        const { rows } = await pool.query(
          `SELECT ${SAFE_RESOURCE_COLS}
           FROM resources r
           LEFT JOIN sectors s ON r.sector_id = s.id
           LEFT JOIN health_checks hc ON r.id = hc.resource_id
           WHERE r.is_active = true AND r.sector_id IN (${placeholders})
           ORDER BY r.name`,
          userSectorIds
        );
        const overrides = await this.getResourceOverridesForUser(userId);
        const denySet = new Set(overrides.filter((o) => o.effect === "DENY").map((o) => o.resourceId));
        const favRows = await pool.query(
          `SELECT resource_id FROM favorites WHERE user_id = $1`, [userId]
        );
        const favoriteIds = new Set<string>(favRows.rows.map((f: any) => f.resource_id));
        return rows
          .filter((r: any) => !denySet.has(r.id))
          .map((r: any) => mapRawResourceRow(r, favoriteIds.has(r.id)));
      }
      throw err;
    }

    // Get overrides for user
    const overrides = await this.getResourceOverridesForUser(userId);
    const denyOverrides = new Set(overrides.filter((o) => o.effect === "DENY").map((o) => o.resourceId));
    const allowOverrides = new Set(overrides.filter((o) => o.effect === "ALLOW").map((o) => o.resourceId));

    // Get user's favorites
    const userFavorites = await db.select().from(favorites).where(eq(favorites.userId, userId));
    const favoriteIds = new Set(userFavorites.map((f) => f.resourceId));

    // Filter resources based on overrides (DENY takes precedence)
    const filteredResources = sectorResources.filter((r) => {
      if (denyOverrides.has(r.resource.id)) return false;
      return true;
    });

    return filteredResources.map((r) => ({
      ...r.resource,
      sectorName: r.sectorName || undefined,
      healthStatus: r.healthStatus as "UP" | "DEGRADED" | "DOWN" | undefined,
      isFavorite: favoriteIds.has(r.resource.id),
    }));
  }

  async getResourceWithHealth(id: string, userId?: string): Promise<ResourceWithHealth | undefined> {
    let result: { resource: Resource; sectorName: string | null; healthStatus: string | null } | undefined;
    try {
      const [row] = await db
        .select({
          resource: resources,
          sectorName: sectors.name,
          healthStatus: healthChecks.status,
        })
        .from(resources)
        .leftJoin(sectors, eq(resources.sectorId, sectors.id))
        .leftJoin(healthChecks, eq(resources.id, healthChecks.resourceId))
        .where(eq(resources.id, id));
      result = row;
    } catch (err) {
      if (isPgSchemaMismatch(err)) {
        console.warn("[storage] Schema mismatch in getResourceWithHealth, falling back to safe query:", (err as any).message);
        const { rows } = await pool.query(
          `SELECT ${SAFE_RESOURCE_COLS}
           FROM resources r
           LEFT JOIN sectors s ON r.sector_id = s.id
           LEFT JOIN health_checks hc ON r.id = hc.resource_id
           WHERE r.id = $1`,
          [id]
        );
        if (rows.length === 0) return undefined;
        let isFav = false;
        if (userId) {
          const favCheck = await pool.query(
            `SELECT id FROM favorites WHERE user_id = $1 AND resource_id = $2 LIMIT 1`,
            [userId, id]
          );
          isFav = favCheck.rows.length > 0;
        }
        return mapRawResourceRow(rows[0], isFav);
      }
      throw err;
    }

    if (!result) return undefined;

    let isFavorite = false;
    if (userId) {
      const fav = await this.getFavorite(userId, id);
      isFavorite = !!fav;
    }

    return {
      ...result.resource,
      sectorName: result.sectorName || undefined,
      healthStatus: result.healthStatus as "UP" | "DEGRADED" | "DOWN" | undefined,
      isFavorite,
    };
  }

  // Resource Overrides
  async getResourceOverride(userId: string, resourceId: string): Promise<ResourceOverride | undefined> {
    const [override] = await db
      .select()
      .from(resourceOverrides)
      .where(and(eq(resourceOverrides.userId, userId), eq(resourceOverrides.resourceId, resourceId)));
    return override;
  }

  async setResourceOverride(data: InsertResourceOverride): Promise<ResourceOverride> {
    // Delete existing override if any
    await db
      .delete(resourceOverrides)
      .where(and(eq(resourceOverrides.userId, data.userId), eq(resourceOverrides.resourceId, data.resourceId)));

    const [newOverride] = await db.insert(resourceOverrides).values(data).returning();
    return newOverride;
  }

  async removeResourceOverride(userId: string, resourceId: string): Promise<boolean> {
    await db
      .delete(resourceOverrides)
      .where(and(eq(resourceOverrides.userId, userId), eq(resourceOverrides.resourceId, resourceId)));
    return true;
  }

  async getResourceOverridesForUser(userId: string): Promise<ResourceOverride[]> {
    return db.select().from(resourceOverrides).where(eq(resourceOverrides.userId, userId));
  }

  // Favorites
  async getFavorite(userId: string, resourceId: string): Promise<Favorite | undefined> {
    const [fav] = await db
      .select()
      .from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.resourceId, resourceId)));
    return fav;
  }

  async addFavorite(data: InsertFavorite): Promise<Favorite> {
    // Check if already exists
    const existing = await this.getFavorite(data.userId, data.resourceId);
    if (existing) return existing;

    const [newFav] = await db.insert(favorites).values(data).returning();
    return newFav;
  }

  async removeFavorite(userId: string, resourceId: string): Promise<boolean> {
    await db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.resourceId, resourceId)));
    return true;
  }

  async getUserFavorites(userId: string): Promise<ResourceWithHealth[]> {
    try {
      const favs = await db
        .select({
          resource: resources,
          sectorName: sectors.name,
          healthStatus: healthChecks.status,
        })
        .from(favorites)
        .innerJoin(resources, eq(favorites.resourceId, resources.id))
        .leftJoin(sectors, eq(resources.sectorId, sectors.id))
        .leftJoin(healthChecks, eq(resources.id, healthChecks.resourceId))
        .where(and(eq(favorites.userId, userId), eq(resources.isActive, true)))
        .orderBy(favorites.sortOrder);

      return favs.map((f) => ({
        ...f.resource,
        sectorName: f.sectorName || undefined,
        healthStatus: f.healthStatus as "UP" | "DEGRADED" | "DOWN" | undefined,
        isFavorite: true,
      }));
    } catch (err) {
      if (isPgSchemaMismatch(err)) {
        console.warn("[storage] Schema mismatch in getUserFavorites, falling back to safe query:", (err as any).message);
        const { rows } = await pool.query(
          `SELECT ${SAFE_RESOURCE_COLS}
           FROM favorites f
           INNER JOIN resources r ON f.resource_id = r.id
           LEFT JOIN sectors s ON r.sector_id = s.id
           LEFT JOIN health_checks hc ON r.id = hc.resource_id
           WHERE f.user_id = $1 AND r.is_active = true
           ORDER BY f.sort_order`,
          [userId]
        );
        return rows.map((r: any) => mapRawResourceRow(r, true));
      }
      throw err;
    }
  }

  // Recent Access
  async recordAccess(userId: string, resourceId: string): Promise<void> {
    const [existing] = await db
      .select()
      .from(recentAccess)
      .where(and(eq(recentAccess.userId, userId), eq(recentAccess.resourceId, resourceId)));

    if (existing) {
      await db
        .update(recentAccess)
        .set({ lastAccessAt: new Date() })
        .where(eq(recentAccess.id, existing.id));
    } else {
      await db.insert(recentAccess).values({ userId, resourceId });
    }
  }

  async getRecentAccess(userId: string, limit: number = 5): Promise<ResourceWithHealth[]> {
    try {
      const recent = await db
        .select({
          resource: resources,
          sectorName: sectors.name,
          healthStatus: healthChecks.status,
        })
        .from(recentAccess)
        .innerJoin(resources, eq(recentAccess.resourceId, resources.id))
        .leftJoin(sectors, eq(resources.sectorId, sectors.id))
        .leftJoin(healthChecks, eq(resources.id, healthChecks.resourceId))
        .where(and(eq(recentAccess.userId, userId), eq(resources.isActive, true)))
        .orderBy(desc(recentAccess.lastAccessAt))
        .limit(limit);

      const userFavorites = await db.select().from(favorites).where(eq(favorites.userId, userId));
      const favoriteIds = new Set(userFavorites.map((f) => f.resourceId));

      return recent.map((r) => ({
        ...r.resource,
        sectorName: r.sectorName || undefined,
        healthStatus: r.healthStatus as "UP" | "DEGRADED" | "DOWN" | undefined,
        isFavorite: favoriteIds.has(r.resource.id),
      }));
    } catch (err) {
      if (isPgSchemaMismatch(err)) {
        console.warn("[storage] Schema mismatch in getRecentAccess, falling back to safe query:", (err as any).message);
        const { rows } = await pool.query(
          `SELECT ${SAFE_RESOURCE_COLS}
           FROM recent_access ra
           INNER JOIN resources r ON ra.resource_id = r.id
           LEFT JOIN sectors s ON r.sector_id = s.id
           LEFT JOIN health_checks hc ON r.id = hc.resource_id
           WHERE ra.user_id = $1 AND r.is_active = true
           ORDER BY ra.last_access_at DESC
           LIMIT $2`,
          [userId, limit]
        );
        const favRows = await pool.query(
          `SELECT resource_id FROM favorites WHERE user_id = $1`, [userId]
        );
        const favoriteIds = new Set<string>(favRows.rows.map((f: any) => f.resource_id));
        return rows.map((r: any) => mapRawResourceRow(r, favoriteIds.has(r.id)));
      }
      throw err;
    }
  }

  // Audit Logs
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [newLog] = await db.insert(auditLogs).values(log).returning();
    return newLog;
  }

  async getAuditLogs(limit: number = 100): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
  }

  async getAuditLogsWithActors(limit: number = 100): Promise<(AuditLog & { actorName?: string; actorEmail?: string })[]> {
    const logs = await db
      .select({
        log: auditLogs,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    return logs.map((l) => ({
      ...l.log,
      actorName: l.actorName || undefined,
      actorEmail: l.actorEmail || undefined,
    }));
  }

  // Health Checks
  async getHealthCheck(resourceId: string): Promise<HealthCheck | undefined> {
    const [check] = await db.select().from(healthChecks).where(eq(healthChecks.resourceId, resourceId));
    return check;
  }

  async upsertHealthCheck(
    resourceId: string,
    status: "UP" | "DEGRADED" | "DOWN",
    responseTimeMs?: number
  ): Promise<HealthCheck> {
    const existing = await this.getHealthCheck(resourceId);

    if (existing) {
      const [updated] = await db
        .update(healthChecks)
        .set({ status, responseTimeMs, lastCheckAt: new Date() })
        .where(eq(healthChecks.resourceId, resourceId))
        .returning();
      return updated;
    }

    const [newCheck] = await db
      .insert(healthChecks)
      .values({ resourceId, status, responseTimeMs })
      .returning();
    return newCheck;
  }

  // Stats
  async getAdminStats(): Promise<{ users: number; sectors: number; resources: number; auditLogs: number }> {
    const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const [sectorCount] = await db.select({ count: sql<number>`count(*)` }).from(sectors);
    const [resourceCount] = await db.select({ count: sql<number>`count(*)` }).from(resources);
    const [logCount] = await db.select({ count: sql<number>`count(*)` }).from(auditLogs)
      .where(sql`${auditLogs.createdAt} >= NOW() - INTERVAL '30 days'`);

    return {
      users: Number(userCount.count),
      sectors: Number(sectorCount.count),
      resources: Number(resourceCount.count),
      auditLogs: Number(logCount.count),
    };
  }

  // Team
  async getTeamMembers(userId: string): Promise<Array<{
    id: string;
    name: string;
    email: string;
    whatsapp: string | null;
    photoUrl: string | null;
    roles: Array<{ sectorId: string; sectorName: string; roleName: "Admin" | "Coordenador" | "Usuario" }>;
  }>> {
    // Get the user's sectors
    const userSectorIds = await db
      .select({ sectorId: userSectorRoles.sectorId })
      .from(userSectorRoles)
      .where(eq(userSectorRoles.userId, userId));

    if (userSectorIds.length === 0) {
      return [];
    }

    const sectorIds = userSectorIds.map(s => s.sectorId);

    // Get all users in those sectors (excluding the current user)
    const teammateIds = await db
      .selectDistinct({ userId: userSectorRoles.userId })
      .from(userSectorRoles)
      .where(
        and(
          inArray(userSectorRoles.sectorId, sectorIds),
          sql`${userSectorRoles.userId} != ${userId}`
        )
      );

    if (teammateIds.length === 0) {
      return [];
    }

    const teammates: Array<{
      id: string;
      name: string;
      email: string;
      whatsapp: string | null;
      photoUrl: string | null;
      roles: Array<{ sectorId: string; sectorName: string; roleName: "Admin" | "Coordenador" | "Usuario" }>;
    }> = [];

    for (const { userId: tId } of teammateIds) {
      const [user] = await db.select().from(users).where(eq(users.id, tId));
      if (!user || !user.isActive) continue;

      const userRoles = await db
        .select({
          sectorId: userSectorRoles.sectorId,
          sectorName: sectors.name,
          roleName: roles.name,
        })
        .from(userSectorRoles)
        .innerJoin(sectors, eq(userSectorRoles.sectorId, sectors.id))
        .innerJoin(roles, eq(userSectorRoles.roleId, roles.id))
        .where(eq(userSectorRoles.userId, tId));

      teammates.push({
        id: user.id,
        name: user.name,
        email: user.email,
        whatsapp: user.whatsapp,
        photoUrl: user.photoUrl,
        roles: userRoles as Array<{ sectorId: string; sectorName: string; roleName: "Admin" | "Coordenador" | "Usuario" }>,
      });
    }

    return teammates.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getDirectory(options: {
    userId: string;
    sectorId?: string;
    query?: string;
    showAll?: boolean;
  }): Promise<Array<{
    id: string;
    name: string;
    email: string;
    whatsapp: string | null;
    photoUrl: string | null;
    roles: Array<{ sectorId: string; sectorName: string; roleName: "Admin" | "Coordenador" | "Usuario" }>;
  }>> {
    let targetSectorIds: string[] = [];

    if (options.showAll) {
      // Get all sectors
      const allSectors = await db.select({ id: sectors.id }).from(sectors);
      targetSectorIds = allSectors.map(s => s.id);
    } else if (options.sectorId) {
      // Use specific sector
      targetSectorIds = [options.sectorId];
    } else {
      // Get user's sectors
      const userSectorIds = await db
        .select({ sectorId: userSectorRoles.sectorId })
        .from(userSectorRoles)
        .where(eq(userSectorRoles.userId, options.userId));
      targetSectorIds = userSectorIds.map(s => s.sectorId);
    }

    if (targetSectorIds.length === 0) {
      return [];
    }

    // Get all users in target sectors
    const userIds = await db
      .selectDistinct({ userId: userSectorRoles.userId })
      .from(userSectorRoles)
      .where(inArray(userSectorRoles.sectorId, targetSectorIds));

    const result: Array<{
      id: string;
      name: string;
      email: string;
      whatsapp: string | null;
      photoUrl: string | null;
      roles: Array<{ sectorId: string; sectorName: string; roleName: "Admin" | "Coordenador" | "Usuario" }>;
    }> = [];

    const searchQuery = options.query?.toLowerCase().trim();

    for (const { userId } of userIds) {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user || !user.isActive) continue;

      // Apply search filter
      if (searchQuery) {
        const matchesName = user.name.toLowerCase().includes(searchQuery);
        const matchesEmail = user.email.toLowerCase().includes(searchQuery);
        const matchesWhatsapp = user.whatsapp?.toLowerCase().includes(searchQuery);
        if (!matchesName && !matchesEmail && !matchesWhatsapp) continue;
      }

      const userRoles = await db
        .select({
          sectorId: userSectorRoles.sectorId,
          sectorName: sectors.name,
          roleName: roles.name,
        })
        .from(userSectorRoles)
        .innerJoin(sectors, eq(userSectorRoles.sectorId, sectors.id))
        .innerJoin(roles, eq(userSectorRoles.roleId, roles.id))
        .where(eq(userSectorRoles.userId, userId));

      result.push({
        id: user.id,
        name: user.name,
        email: user.email,
        whatsapp: user.whatsapp,
        photoUrl: user.photoUrl,
        roles: userRoles as Array<{ sectorId: string; sectorName: string; roleName: "Admin" | "Coordenador" | "Usuario" }>,
      });
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Admin Settings
  async getSetting(key: string): Promise<AdminSetting | undefined> {
    const [setting] = await db.select().from(adminSettings).where(eq(adminSettings.key, key));
    return setting;
  }

  async setSetting(key: string, value: string): Promise<AdminSetting> {
    const existing = await this.getSetting(key);
    if (existing) {
      const [updated] = await db
        .update(adminSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(adminSettings.key, key))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(adminSettings)
      .values({ key, value })
      .returning();
    return created;
  }

  async getAllSettings(): Promise<AdminSetting[]> {
    return db.select().from(adminSettings);
  }

  // Sectors by name
  async getSectorByName(name: string): Promise<Sector | undefined> {
    const [sector] = await db.select().from(sectors).where(eq(sectors.name, name));
    return sector;
  }

  // Ticket Categories
  async listTicketCategoriesActive(): Promise<TicketCategoryTree[]> {
    const all = await db.select().from(ticketCategories)
      .where(eq(ticketCategories.isActive, true))
      .orderBy(ticketCategories.branch, ticketCategories.name);

    const activeRoots = all.filter(c => !c.parentId);
    const activeRootIds = new Set(activeRoots.map(r => r.id));
    return activeRoots.map(root => ({
      ...root,
      children: all.filter(c => c.parentId === root.id && activeRootIds.has(c.parentId)),
    }));
  }

  async listAllTicketCategories(): Promise<TicketCategory[]> {
    return db.select().from(ticketCategories).orderBy(ticketCategories.branch, ticketCategories.name);
  }

  async createTicketCategory(data: InsertTicketCategory): Promise<TicketCategory> {
    const [cat] = await db.insert(ticketCategories).values(data).returning();
    return cat;
  }

  async updateTicketCategory(id: string, data: Partial<InsertTicketCategory>): Promise<TicketCategory | undefined> {
    const [updated] = await db.update(ticketCategories).set(data).where(eq(ticketCategories.id, id)).returning();
    return updated;
  }

  async disableTicketCategory(id: string): Promise<boolean> {
    await db.update(ticketCategories).set({ isActive: false }).where(eq(ticketCategories.id, id));
    return true;
  }

  // Ticket SLA Policies
  async listSlaPolicies(): Promise<TicketSlaPolicy[]> {
    return db.select().from(ticketSlaPolicies).orderBy(ticketSlaPolicies.priority);
  }

  async createSlaPolicy(data: InsertTicketSlaPolicy): Promise<TicketSlaPolicy> {
    const [policy] = await db.insert(ticketSlaPolicies).values(data).returning();
    return policy;
  }

  async updateSlaPolicy(id: string, data: Partial<InsertTicketSlaPolicy>): Promise<TicketSlaPolicy | undefined> {
    const [updated] = await db.update(ticketSlaPolicies).set(data).where(eq(ticketSlaPolicies.id, id)).returning();
    return updated;
  }

  // Tickets
  async createTicket(data: {
    title: string;
    description: string;
    requesterSectorId: string;
    categoryId: string;
    priority?: "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";
    relatedResourceId?: string;
    tags?: string[];
    requestData?: Record<string, any>;
  }, actorUser: UserWithRoles): Promise<Ticket> {
    const targetSectorName = process.env.TICKETS_TARGET_SECTOR_NAME || "Tech";
    const targetSector = await this.getSectorByName(targetSectorName);
    if (!targetSector) throw new Error(`Target sector "${targetSectorName}" not found`);

    const priority = data.priority || "MEDIA";

    const allCatsForApproval = await this.listAllTicketCategories();
    const catForApproval = allCatsForApproval.find(c => c.id === data.categoryId);
    const needsApproval = (catForApproval as any)?.requiresApproval === true;
    const initialStatus = needsApproval ? "AGUARDANDO_APROVACAO" : "ABERTO";

    const [ticket] = await db.insert(tickets).values({
      title: data.title,
      description: data.description,
      status: initialStatus as any,
      priority,
      requesterSectorId: data.requesterSectorId,
      targetSectorId: targetSector.id,
      categoryId: data.categoryId,
      createdBy: actorUser.id,
      relatedResourceId: data.relatedResourceId || null,
      tags: data.tags || [],
      requestData: data.requestData || {},
    }).returning();

    const now = new Date();
    const dueDates = await computeSlaDueDates(now, priority);
    await db.insert(ticketSlaCycles).values({
      ticketId: ticket.id,
      cycleNumber: 1,
      openedAt: now,
      firstResponseDueAt: dueDates.firstResponseDueAt,
      resolutionDueAt: dueDates.resolutionDueAt,
      ...(needsApproval ? { pausedAt: now } : {}),
    });

    if (needsApproval) {
      await db.insert(ticketApprovals).values({
        ticketId: ticket.id,
        cycleNumber: 1,
        requestedBy: actorUser.id,
        requesterSectorId: data.requesterSectorId,
        status: "PENDING",
      });
    }

    await db.insert(ticketEvents).values({
      ticketId: ticket.id,
      actorUserId: actorUser.id,
      type: "ticket_created",
      data: { priority, categoryId: data.categoryId, needsApproval },
    });

    await this.createAuditLog({
      actorUserId: actorUser.id,
      action: "ticket_create",
      targetType: "ticket",
      targetId: ticket.id,
      metadata: { title: data.title },
    });

    const allCats = await this.listAllTicketCategories();
    const cat = allCats.find(c => c.id === data.categoryId);
    const checklistTemplate = (cat as any)?.checklistTemplate;
    if (checklistTemplate && Array.isArray(checklistTemplate) && checklistTemplate.length > 0) {
      for (const item of checklistTemplate) {
        await db.insert(ticketChecklistItems).values({
          ticketId: ticket.id,
          key: item.key,
          label: item.label,
        });
      }
    }

    return ticket;
  }

  private async enrichTickets(rawTickets: Ticket[]): Promise<TicketWithDetails[]> {
    if (rawTickets.length === 0) return [];

    const result: TicketWithDetails[] = [];
    for (const t of rawTickets) {
      const enriched = await this.enrichSingleTicket(t);
      result.push(enriched);
    }
    return result;
  }

  private async enrichSingleTicket(t: Ticket): Promise<TicketWithDetails> {
    const [reqSector] = await db.select({ name: sectors.name }).from(sectors).where(eq(sectors.id, t.requesterSectorId));
    const [tgtSector] = await db.select({ name: sectors.name }).from(sectors).where(eq(sectors.id, t.targetSectorId));
    const [cat] = await db.select().from(ticketCategories).where(eq(ticketCategories.id, t.categoryId));
    const [creator] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, t.createdBy));

    const assigneeRows = await db
      .select({ userId: ticketAssignees.userId, userName: users.name, userEmail: users.email })
      .from(ticketAssignees)
      .innerJoin(users, eq(ticketAssignees.userId, users.id))
      .where(eq(ticketAssignees.ticketId, t.id));

    const [currentCycle] = await db.select().from(ticketSlaCycles)
      .where(eq(ticketSlaCycles.ticketId, t.id))
      .orderBy(desc(ticketSlaCycles.cycleNumber))
      .limit(1);

    return {
      ...t,
      requesterSectorName: reqSector?.name,
      targetSectorName: tgtSector?.name,
      categoryName: cat?.name,
      categoryBranch: cat?.branch as "INFRA" | "DEV" | "SUPORTE" | undefined,
      creatorName: creator?.name,
      creatorEmail: creator?.email,
      assignees: assigneeRows,
      currentCycle: currentCycle || null,
    };
  }

  async listTicketsForUser(user: UserWithRoles, filters: {
    status?: string;
    q?: string;
    includeClosed?: boolean;
  }): Promise<TicketWithDetails[]> {
    const conditions: any[] = [];

    if (!user.isAdmin) {
      const userSectorIds = user.roles.map(r => r.sectorId);
      const isCoordinator = user.roles.some(r => r.roleName === "Coordenador");

      if (isCoordinator) {
        const coordSectorIds = user.roles.filter(r => r.roleName === "Coordenador").map(r => r.sectorId);
        conditions.push(or(
          inArray(tickets.requesterSectorId, coordSectorIds),
          eq(tickets.createdBy, user.id)
        ));
      } else {
        if (userSectorIds.length > 0) {
          conditions.push(inArray(tickets.requesterSectorId, userSectorIds));
        } else {
          conditions.push(eq(tickets.createdBy, user.id));
        }
      }
    }

    if (filters.status) {
      conditions.push(eq(tickets.status, filters.status as any));
    } else if (filters.includeClosed) {
      conditions.push(inArray(tickets.status, ["RESOLVIDO", "CANCELADO"]));
    } else {
      conditions.push(inArray(tickets.status, ["ABERTO", "EM_ANDAMENTO", "AGUARDANDO_USUARIO", "AGUARDANDO_APROVACAO"]));
    }

    if (filters.q) {
      conditions.push(or(
        ilike(tickets.title, `%${filters.q}%`),
        ilike(tickets.description, `%${filters.q}%`)
      ));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rawTickets = await db.select().from(tickets)
      .where(where)
      .orderBy(desc(tickets.createdAt))
      .limit(200);

    return this.enrichTickets(rawTickets);
  }

  async getTicketDetail(ticketId: string, user: UserWithRoles): Promise<TicketWithDetails | undefined> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
    if (!ticket) return undefined;

    if (!user.isAdmin) {
      const userSectorIds = user.roles.map(r => r.sectorId);
      const isCoordinator = user.roles.some(r => r.roleName === "Coordenador");

      if (isCoordinator) {
        const coordSectorIds = user.roles.filter(r => r.roleName === "Coordenador").map(r => r.sectorId);
        if (!coordSectorIds.includes(ticket.requesterSectorId) && ticket.createdBy !== user.id) {
          return undefined;
        }
      } else {
        if (!userSectorIds.includes(ticket.requesterSectorId)) {
          return undefined;
        }
      }
    }

    return this.enrichSingleTicket(ticket);
  }

  async adminUpdateTicket(ticketId: string, patch: Partial<{
    status: string;
    priority: string;
    categoryId: string;
    relatedResourceId: string | null;
    tags: string[];
    title: string;
    description: string;
  }>, actorUser: UserWithRoles): Promise<Ticket | undefined> {
    const [existing] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
    if (!existing) return undefined;

    const updateData: any = { updatedAt: new Date() };
    if (patch.title !== undefined) updateData.title = patch.title;
    if (patch.description !== undefined) updateData.description = patch.description;
    if (patch.categoryId !== undefined) updateData.categoryId = patch.categoryId;
    if (patch.relatedResourceId !== undefined) updateData.relatedResourceId = patch.relatedResourceId;
    if (patch.tags !== undefined) updateData.tags = patch.tags;
    if (patch.priority !== undefined) updateData.priority = patch.priority;
    if (patch.status !== undefined) updateData.status = patch.status;

    if (patch.status && patch.status !== existing.status) {
      if (existing.status === "AGUARDANDO_APROVACAO" && patch.status !== "CANCELADO" && patch.status !== "AGUARDANDO_APROVACAO") {
        const [cycle] = await db.select().from(ticketSlaCycles)
          .where(eq(ticketSlaCycles.ticketId, ticketId))
          .orderBy(desc(ticketSlaCycles.cycleNumber))
          .limit(1);
        const approval = cycle ? await this.getTicketApproval(ticketId, cycle.cycleNumber) : null;
        if (!approval || approval.status !== "APPROVED") {
          throw new Error("APPROVAL_REQUIRED");
        }
      }

      if (existing.status === "ABERTO" && patch.status !== "ABERTO") {
        const [cycle] = await db.select().from(ticketSlaCycles)
          .where(eq(ticketSlaCycles.ticketId, ticketId))
          .orderBy(desc(ticketSlaCycles.cycleNumber))
          .limit(1);
        if (cycle && !cycle.firstResponseAt) {
          const now = new Date();
          const breached = now > cycle.firstResponseDueAt;
          await db.update(ticketSlaCycles).set({
            firstResponseAt: now,
            firstResponseBreached: breached,
          }).where(eq(ticketSlaCycles.id, cycle.id));
        }
      }

      if (patch.status === "RESOLVIDO") {
        updateData.closedAt = new Date();
        const [cycle] = await db.select().from(ticketSlaCycles)
          .where(eq(ticketSlaCycles.ticketId, ticketId))
          .orderBy(desc(ticketSlaCycles.cycleNumber))
          .limit(1);
        if (cycle && !cycle.resolvedAt) {
          const now = new Date();
          const breached = now > cycle.resolutionDueAt;
          await db.update(ticketSlaCycles).set({
            resolvedAt: now,
            resolutionBreached: breached,
          }).where(eq(ticketSlaCycles.id, cycle.id));
        }
        await db.insert(ticketEvents).values({
          ticketId, actorUserId: actorUser.id, type: "resolved",
          data: { previousStatus: existing.status },
        });
      } else if (patch.status === "ABERTO" && (existing.status === "RESOLVIDO" || existing.status === "CANCELADO")) {
        updateData.closedAt = null;
        const [lastCycle] = await db.select().from(ticketSlaCycles)
          .where(eq(ticketSlaCycles.ticketId, ticketId))
          .orderBy(desc(ticketSlaCycles.cycleNumber))
          .limit(1);
        const newCycleNum = (lastCycle?.cycleNumber || 0) + 1;
        const priority = (patch.priority || existing.priority) as "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";
        const now = new Date();
        const dueDates = await computeSlaDueDates(now, priority);
        await db.insert(ticketSlaCycles).values({
          ticketId, cycleNumber: newCycleNum, openedAt: now,
          firstResponseDueAt: dueDates.firstResponseDueAt,
          resolutionDueAt: dueDates.resolutionDueAt,
        });
        await db.insert(ticketEvents).values({
          ticketId, actorUserId: actorUser.id, type: "reopened",
          data: { cycleNumber: newCycleNum },
        });
      } else {
        await db.insert(ticketEvents).values({
          ticketId, actorUserId: actorUser.id, type: "status_changed",
          data: { from: existing.status, to: patch.status },
        });
      }

      const [slaCycle] = await db.select().from(ticketSlaCycles)
        .where(eq(ticketSlaCycles.ticketId, ticketId))
        .orderBy(desc(ticketSlaCycles.cycleNumber))
        .limit(1);

      if (slaCycle) {
        const pauseStatuses = ["AGUARDANDO_USUARIO", "AGUARDANDO_APROVACAO"];
        if (pauseStatuses.includes(patch.status!) && !slaCycle.pausedAt) {
          await db.update(ticketSlaCycles).set({
            pausedAt: new Date(),
          }).where(eq(ticketSlaCycles.id, slaCycle.id));
        } else if (pauseStatuses.includes(existing.status) && !pauseStatuses.includes(patch.status!) && slaCycle.pausedAt) {
          const now = new Date();
          const pausedMinutes = businessMinutesBetween(slaCycle.pausedAt, now);
          const newTotal = slaCycle.pausedTotalBusinessMinutes + pausedMinutes;
          const updates: any = {
            pausedAt: null,
            pausedTotalBusinessMinutes: newTotal,
          };
          if (!slaCycle.resolutionDueAtManual) {
            updates.resolutionDueAt = addBusinessMinutes(slaCycle.resolutionDueAt, pausedMinutes);
          }
          if (!slaCycle.firstResponseAt) {
            updates.firstResponseDueAt = addBusinessMinutes(slaCycle.firstResponseDueAt, pausedMinutes);
          }
          await db.update(ticketSlaCycles).set(updates).where(eq(ticketSlaCycles.id, slaCycle.id));
        }
      }
    }

    if (patch.priority && patch.priority !== existing.priority) {
      await db.insert(ticketEvents).values({
        ticketId, actorUserId: actorUser.id, type: "priority_changed",
        data: { from: existing.priority, to: patch.priority },
      });
    }

    if (patch.categoryId && patch.categoryId !== existing.categoryId) {
      await db.insert(ticketEvents).values({
        ticketId, actorUserId: actorUser.id, type: "category_changed",
        data: { from: existing.categoryId, to: patch.categoryId },
      });
    }

    const [updated] = await db.update(tickets).set(updateData).where(eq(tickets.id, ticketId)).returning();

    await this.createAuditLog({
      actorUserId: actorUser.id,
      action: "ticket_update",
      targetType: "ticket",
      targetId: ticketId,
      metadata: patch,
    });

    return updated;
  }

  async adminSetAssignees(ticketId: string, assigneeIds: string[], actorUser: UserWithRoles): Promise<void> {
    const existing = await db.select().from(ticketAssignees).where(eq(ticketAssignees.ticketId, ticketId));
    const existingIds = existing.map(a => a.userId);

    const toRemove = existingIds.filter(id => !assigneeIds.includes(id));
    const toAdd = assigneeIds.filter(id => !existingIds.includes(id));

    for (const uid of toRemove) {
      await db.delete(ticketAssignees).where(
        and(eq(ticketAssignees.ticketId, ticketId), eq(ticketAssignees.userId, uid))
      );
    }

    for (const uid of toAdd) {
      await db.insert(ticketAssignees).values({
        ticketId, userId: uid, assignedBy: actorUser.id,
      });
    }

    await db.insert(ticketEvents).values({
      ticketId, actorUserId: actorUser.id, type: "assignees_changed",
      data: { assigneeIds, added: toAdd, removed: toRemove },
    });

    await this.createAuditLog({
      actorUserId: actorUser.id,
      action: "ticket_assignees",
      targetType: "ticket",
      targetId: ticketId,
      metadata: { assigneeIds },
    });
  }

  async addTicketComment(ticketId: string, authorUser: UserWithRoles, data: {
    body: string;
    isInternal?: boolean;
  }): Promise<TicketComment> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
    if (!ticket) throw new Error("Ticket not found");

    if (!authorUser.isAdmin) {
      if (ticket.status !== "AGUARDANDO_USUARIO") {
        throw new Error("Comentários só são permitidos quando o chamado está aguardando usuário");
      }
      if (data.isInternal) {
        throw new Error("Comentários internos são exclusivos para administradores");
      }
    }

    const [comment] = await db.insert(ticketComments).values({
      ticketId,
      authorId: authorUser.id,
      body: data.body,
      isInternal: authorUser.isAdmin ? (data.isInternal || false) : false,
    }).returning();

    if (authorUser.isAdmin && !comment.isInternal) {
      const [cycle] = await db.select().from(ticketSlaCycles)
        .where(eq(ticketSlaCycles.ticketId, ticketId))
        .orderBy(desc(ticketSlaCycles.cycleNumber))
        .limit(1);
      if (cycle && !cycle.firstResponseAt) {
        const now = new Date();
        const breached = now > cycle.firstResponseDueAt;
        await db.update(ticketSlaCycles).set({
          firstResponseAt: now,
          firstResponseBreached: breached,
        }).where(eq(ticketSlaCycles.id, cycle.id));
      }
    }

    await db.insert(ticketEvents).values({
      ticketId, actorUserId: authorUser.id, type: "comment_added",
      data: { commentId: comment.id, isInternal: comment.isInternal },
    });

    await this.createAuditLog({
      actorUserId: authorUser.id,
      action: "ticket_comment",
      targetType: "ticket",
      targetId: ticketId,
    });

    return comment;
  }

  async addTicketAttachment(ticketId: string, authorUser: UserWithRoles, fileMeta: {
    originalName: string;
    storageName: string;
    mimeType: string;
    sizeBytes: number;
    attachmentKey?: string;
  }): Promise<TicketAttachment> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
    if (!ticket) throw new Error("Ticket not found");

    // Admins: sem restrição
    // Criador do chamado: pode anexar a qualquer momento (ex: logo após abrir)
    // Outros: somente quando status for AGUARDANDO_USUARIO
    if (!authorUser.isAdmin && ticket.createdBy !== authorUser.id) {
      if (ticket.status !== "AGUARDANDO_USUARIO") {
        throw new Error("Anexos só são permitidos quando o chamado está aguardando usuário");
      }
    }

    const [attachment] = await db.insert(ticketAttachments).values({
      ticketId,
      uploadedBy: authorUser.id,
      originalName: fileMeta.originalName,
      storageName: fileMeta.storageName,
      mimeType: fileMeta.mimeType,
      sizeBytes: fileMeta.sizeBytes,
      attachmentKey: fileMeta.attachmentKey || null,
    }).returning();

    await db.insert(ticketEvents).values({
      ticketId, actorUserId: authorUser.id, type: "attachment_added",
      data: { attachmentId: attachment.id, originalName: fileMeta.originalName },
    });

    await this.createAuditLog({
      actorUserId: authorUser.id,
      action: "ticket_attachment",
      targetType: "ticket",
      targetId: ticketId,
      metadata: { originalName: fileMeta.originalName },
    });

    return attachment;
  }

  async listTicketComments(ticketId: string, user: UserWithRoles): Promise<(TicketComment & { authorName?: string; authorEmail?: string })[]> {
    let conditions: any = eq(ticketComments.ticketId, ticketId);
    if (!user.isAdmin) {
      conditions = and(conditions, eq(ticketComments.isInternal, false));
    }

    const comments = await db
      .select({
        comment: ticketComments,
        authorName: users.name,
        authorEmail: users.email,
      })
      .from(ticketComments)
      .leftJoin(users, eq(ticketComments.authorId, users.id))
      .where(conditions)
      .orderBy(asc(ticketComments.createdAt));

    return comments.map(c => ({
      ...c.comment,
      authorName: c.authorName || undefined,
      authorEmail: c.authorEmail || undefined,
    }));
  }

  async listTicketAttachments(ticketId: string, user: UserWithRoles): Promise<TicketAttachment[]> {
    return db.select().from(ticketAttachments)
      .where(eq(ticketAttachments.ticketId, ticketId))
      .orderBy(asc(ticketAttachments.createdAt));
  }

  async listTicketEvents(ticketId: string): Promise<Array<import("@shared/schema").TicketEvent & { actorName?: string }>> {
    const evs = await db
      .select({ event: ticketEvents, actorName: users.name })
      .from(ticketEvents)
      .leftJoin(users, eq(ticketEvents.actorUserId, users.id))
      .where(eq(ticketEvents.ticketId, ticketId))
      .orderBy(asc(ticketEvents.createdAt));
    return evs.map(e => ({ ...e.event, actorName: e.actorName || undefined }));
  }

  async getTicketAttachmentRequirements(ticketId: string): Promise<Array<{ key: string; label: string; mime?: string[]; required?: boolean; satisfied: boolean }>> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
    if (!ticket) return [];
    const allCats = await this.listAllTicketCategories();
    const category = allCats.find(c => c.id === ticket.categoryId);
    const reqAttachments = (category as any)?.requiredAttachments || [];
    if (!reqAttachments.length) return [];

    const existingAttachments = await db.select().from(ticketAttachments)
      .where(eq(ticketAttachments.ticketId, ticketId));
    const existingKeys = new Set(existingAttachments.map(a => a.attachmentKey).filter(Boolean));

    return reqAttachments.map((ra: any) => ({
      key: ra.key,
      label: ra.label,
      mime: ra.mime,
      required: ra.required,
      satisfied: existingKeys.has(ra.key),
    }));
  }

  async listTicketChecklistItems(ticketId: string): Promise<TicketChecklistItem[]> {
    return db.select().from(ticketChecklistItems)
      .where(eq(ticketChecklistItems.ticketId, ticketId))
      .orderBy(asc(ticketChecklistItems.createdAt));
  }

  async updateChecklistItem(ticketId: string, itemId: string, isDone: boolean, userId: string): Promise<TicketChecklistItem | undefined> {
    const [item] = await db.select().from(ticketChecklistItems)
      .where(and(eq(ticketChecklistItems.id, itemId), eq(ticketChecklistItems.ticketId, ticketId)));
    if (!item) return undefined;

    const [updated] = await db.update(ticketChecklistItems).set({
      isDone,
      doneBy: isDone ? userId : null,
      doneAt: isDone ? new Date() : null,
    }).where(eq(ticketChecklistItems.id, itemId)).returning();

    return updated;
  }

  async getAdminUserIds(): Promise<string[]> {
    const adminRole = await db.select().from(roles).where(eq(roles.name, "Admin")).limit(1);
    if (!adminRole.length) return [];
    const adminAssignments = await db.select({ userId: userSectorRoles.userId })
      .from(userSectorRoles)
      .where(eq(userSectorRoles.roleId, adminRole[0].id));
    return [...new Set(adminAssignments.map(a => a.userId))];
  }

  async updateSlaCycleDeadline(ticketId: string, data: { resolutionDueAt: Date; reason?: string; updatedBy: string }): Promise<void> {
    const [cycle] = await db.select().from(ticketSlaCycles)
      .where(eq(ticketSlaCycles.ticketId, ticketId))
      .orderBy(desc(ticketSlaCycles.cycleNumber))
      .limit(1);
    if (!cycle) throw new Error("SLA cycle not found");

    await db.update(ticketSlaCycles).set({
      resolutionDueAt: data.resolutionDueAt,
      resolutionDueAtManual: true,
      resolutionDueAtManualReason: data.reason || null,
      resolutionDueAtUpdatedBy: data.updatedBy,
      resolutionDueAtUpdatedAt: new Date(),
    }).where(eq(ticketSlaCycles.id, cycle.id));
  }

  // Notifications
  async getNotificationSettings(): Promise<NotificationSetting[]> {
    return db.select().from(notificationSettings).orderBy(notificationSettings.type);
  }

  async setNotificationSetting(type: string, enabled: boolean): Promise<NotificationSetting> {
    const [existing] = await db.select().from(notificationSettings)
      .where(eq(notificationSettings.type, type as any));
    if (existing) {
      const [updated] = await db.update(notificationSettings)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(notificationSettings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(notificationSettings)
      .values({ type: type as any, enabled })
      .returning();
    return created;
  }

  async isNotificationEnabled(type: string): Promise<boolean> {
    const [setting] = await db.select().from(notificationSettings)
      .where(eq(notificationSettings.type, type as any));
    return setting ? setting.enabled : true;
  }

  async createNotifications(recipients: string[], payload: { type: string; title: string; message: string; linkUrl?: string; data?: Record<string, unknown> }): Promise<void> {
    if (recipients.length === 0) return;
    const enabled = await this.isNotificationEnabled(payload.type);
    if (!enabled) return;
    const values = recipients.map(userId => ({
      recipientUserId: userId,
      type: payload.type as any,
      title: payload.title,
      message: payload.message,
      linkUrl: payload.linkUrl || null,
      data: payload.data || {},
      isRead: false,
    }));
    const inserted = await db.insert(notifications).values(values).returning({ id: notifications.id, userId: notifications.recipientUserId });

    // Disparar Web Push em background (não bloqueia a resposta HTTP)
    setImmediate(async () => {
      try {
        for (const notif of inserted) {
          const subs = await db.select().from(pushSubscriptions)
            .where(eq(pushSubscriptions.userId, notif.userId));
          for (const sub of subs) {
            try {
              await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                JSON.stringify({ id: notif.id, title: payload.title, message: payload.message, linkUrl: payload.linkUrl })
              );
            } catch (pushErr: any) {
              // 410 Gone = subscription expirada, limpar do banco
              if (pushErr.statusCode === 410) {
                await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
              }
            }
          }
        }
      } catch (err) {
        console.error("[push] Error sending web push:", err);
      }
    });
  }

  // ── Push subscription methods ─────────────────────────────────────────────

  async savePushSubscription(data: { userId: string; endpoint: string; p256dh: string; auth: string }): Promise<void> {
    await db.insert(pushSubscriptions)
      .values({ userId: data.userId, endpoint: data.endpoint, p256dh: data.p256dh, auth: data.auth })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: data.userId, p256dh: data.p256dh, auth: data.auth } });
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async listUserNotifications(userId: string, opts: { limit?: number; offset?: number }): Promise<Notification[]> {
    const limit = opts.limit || 20;
    const offset = opts.offset || 0;
    return db.select().from(notifications)
      .where(eq(notifications.recipientUserId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async countUnreadNotifications(userId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(
        eq(notifications.recipientUserId, userId),
        eq(notifications.isRead, false),
      ));
    return result?.count || 0;
  }

  async markNotificationRead(userId: string, notificationId: string): Promise<boolean> {
    const [updated] = await db.update(notifications)
      .set({ isRead: true })
      .where(and(
        eq(notifications.id, notificationId),
        eq(notifications.recipientUserId, userId),
      ))
      .returning();
    return !!updated;
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(and(
        eq(notifications.recipientUserId, userId),
        eq(notifications.isRead, false),
      ));
  }

  async getTicketAssigneeIds(ticketId: string): Promise<string[]> {
    const rows = await db.select({ userId: ticketAssignees.userId })
      .from(ticketAssignees)
      .where(eq(ticketAssignees.ticketId, ticketId));
    return rows.map(r => r.userId);
  }

  async getTicketApproval(ticketId: string, cycleNumber: number): Promise<TicketApproval | undefined> {
    const [row] = await db.select().from(ticketApprovals)
      .where(and(eq(ticketApprovals.ticketId, ticketId), eq(ticketApprovals.cycleNumber, cycleNumber)));
    return row;
  }

  async resolveApprovers(ticket: Ticket, category: TicketCategory): Promise<string[]> {
    const mode = (category as any).approvalMode || "REQUESTER_COORDINATOR";
    if (mode === "SPECIFIC_USERS") {
      const ids = (category as any).approvalUserIds || [];
      return Array.isArray(ids) ? ids : [];
    }
    if (mode === "TI_ADMIN") {
      const rows = await db.select({ userId: userSectorRoles.userId })
        .from(userSectorRoles)
        .innerJoin(users, and(eq(userSectorRoles.userId, users.id), eq(users.isActive, true)))
        .where(and(
          eq(userSectorRoles.sectorId, ticket.targetSectorId),
          eq(userSectorRoles.roleName, "Admin"),
        ));
      return [...new Set(rows.map(r => r.userId))];
    }
    const rows = await db.select({ userId: userSectorRoles.userId })
      .from(userSectorRoles)
      .innerJoin(users, and(eq(userSectorRoles.userId, users.id), eq(users.isActive, true)))
      .where(and(
        eq(userSectorRoles.sectorId, ticket.requesterSectorId),
        eq(userSectorRoles.roleName, "Coordenador"),
      ));
    return [...new Set(rows.map(r => r.userId))];
  }

  async listKbArticles(filters: { categoryId?: string; q?: string; tags?: string[]; publishedOnly?: boolean }): Promise<(KbArticle & { categoryName?: string; authorName?: string; viewCount?: number; helpfulCount?: number; notHelpfulCount?: number })[]> {
    const conditions: any[] = [];
    if (filters.publishedOnly) {
      conditions.push(eq(kbArticles.isPublished, true));
    }
    if (filters.categoryId && !filters.tags?.length) {
      conditions.push(eq(kbArticles.categoryId, filters.categoryId));
    }
    if (filters.tags?.length && filters.categoryId) {
      const allCats = await this.listAllTicketCategories();
      const matchingCatIds = allCats
        .filter(c => {
          const catTags = (c as any)?.kbTags as string[] | undefined;
          if (!catTags?.length) return false;
          return filters.tags!.some(t => catTags.includes(t));
        })
        .map(c => c.id);
      const allIds = [...new Set([filters.categoryId, ...matchingCatIds])];
      conditions.push(inArray(kbArticles.categoryId, allIds));
    }
    if (filters.q) {
      conditions.push(or(
        ilike(kbArticles.title, `%${filters.q}%`),
        ilike(kbArticles.body, `%${filters.q}%`)
      ));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db
      .select({
        article: kbArticles,
        categoryName: ticketCategories.name,
        authorName: users.name,
      })
      .from(kbArticles)
      .leftJoin(ticketCategories, eq(kbArticles.categoryId, ticketCategories.id))
      .leftJoin(users, eq(kbArticles.createdBy, users.id))
      .where(where)
      .orderBy(desc(kbArticles.updatedAt));

    const articleIds = rows.map(r => r.article.id);
    if (articleIds.length === 0) return [];

    const viewCounts = await db
      .select({ articleId: kbArticleViews.articleId, count: sql<number>`count(*)::int` })
      .from(kbArticleViews)
      .where(inArray(kbArticleViews.articleId, articleIds))
      .groupBy(kbArticleViews.articleId);

    const helpfulCounts = await db
      .select({
        articleId: kbArticleFeedback.articleId,
        helpful: kbArticleFeedback.helpful,
        count: sql<number>`count(*)::int`,
      })
      .from(kbArticleFeedback)
      .where(inArray(kbArticleFeedback.articleId, articleIds))
      .groupBy(kbArticleFeedback.articleId, kbArticleFeedback.helpful);

    const viewMap = new Map(viewCounts.map(v => [v.articleId, v.count]));
    const helpfulMap = new Map<string, { helpful: number; notHelpful: number }>();
    for (const h of helpfulCounts) {
      const entry = helpfulMap.get(h.articleId) || { helpful: 0, notHelpful: 0 };
      if (h.helpful) entry.helpful = h.count;
      else entry.notHelpful = h.count;
      helpfulMap.set(h.articleId, entry);
    }

    return rows.map(r => ({
      ...r.article,
      categoryName: r.categoryName || undefined,
      authorName: r.authorName || undefined,
      viewCount: viewMap.get(r.article.id) || 0,
      helpfulCount: helpfulMap.get(r.article.id)?.helpful || 0,
      notHelpfulCount: helpfulMap.get(r.article.id)?.notHelpful || 0,
    }));
  }

  async getKbArticle(id: string): Promise<(KbArticle & { categoryName?: string; authorName?: string; viewCount?: number; helpfulCount?: number; notHelpfulCount?: number }) | undefined> {
    const [row] = await db
      .select({
        article: kbArticles,
        categoryName: ticketCategories.name,
        authorName: users.name,
      })
      .from(kbArticles)
      .leftJoin(ticketCategories, eq(kbArticles.categoryId, ticketCategories.id))
      .leftJoin(users, eq(kbArticles.createdBy, users.id))
      .where(eq(kbArticles.id, id));

    if (!row) return undefined;

    const [viewCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(kbArticleViews)
      .where(eq(kbArticleViews.articleId, id));

    const feedbackCounts = await db
      .select({
        helpful: kbArticleFeedback.helpful,
        count: sql<number>`count(*)::int`,
      })
      .from(kbArticleFeedback)
      .where(eq(kbArticleFeedback.articleId, id))
      .groupBy(kbArticleFeedback.helpful);

    let helpfulCount = 0;
    let notHelpfulCount = 0;
    for (const f of feedbackCounts) {
      if (f.helpful) helpfulCount = f.count;
      else notHelpfulCount = f.count;
    }

    return {
      ...row.article,
      categoryName: row.categoryName || undefined,
      authorName: row.authorName || undefined,
      viewCount: viewCount?.count || 0,
      helpfulCount,
      notHelpfulCount,
    };
  }

  async createKbArticle(data: InsertKbArticle): Promise<KbArticle> {
    const [article] = await db.insert(kbArticles).values(data).returning();
    return article;
  }

  async updateKbArticle(id: string, data: Partial<InsertKbArticle>): Promise<KbArticle | undefined> {
    const [updated] = await db.update(kbArticles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(kbArticles.id, id))
      .returning();
    return updated;
  }

  async deleteKbArticle(id: string): Promise<boolean> {
    await db.delete(kbArticles).where(eq(kbArticles.id, id));
    return true;
  }

  async logKbArticleView(articleId: string, userId: string): Promise<void> {
    await db.insert(kbArticleViews).values({ articleId, userId });
  }

  async submitKbArticleFeedback(articleId: string, userId: string, helpful: boolean): Promise<KbArticleFeedbackType> {
    const [existing] = await db.select().from(kbArticleFeedback)
      .where(and(eq(kbArticleFeedback.articleId, articleId), eq(kbArticleFeedback.userId, userId)));
    if (existing) {
      const [updated] = await db.update(kbArticleFeedback)
        .set({ helpful })
        .where(eq(kbArticleFeedback.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(kbArticleFeedback)
      .values({ articleId, userId, helpful })
      .returning();
    return created;
  }

  async getTiDashboard(range: '7d' | '30d') {
    const now = new Date();
    const daysBack = range === '7d' ? 7 : 30;
    const rangeStart = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

    const activeStatuses = ['ABERTO', 'EM_ANDAMENTO', 'AGUARDANDO_USUARIO'] as const;
    const allActiveTickets = await db.select().from(tickets)
      .where(inArray(tickets.status, [...activeStatuses]));

    const openCount = allActiveTickets.filter(t => t.status === 'ABERTO').length;
    const inProgressCount = allActiveTickets.filter(t => t.status === 'EM_ANDAMENTO').length;
    const waitingUserCount = allActiveTickets.filter(t => t.status === 'AGUARDANDO_USUARIO').length;

    const resolvedInRange = await db.select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(and(eq(tickets.status, 'RESOLVIDO'), sql`${tickets.closedAt} >= ${rangeStart}`));
    const resolvedCount = resolvedInRange[0]?.count || 0;

    const cancelledInRange = await db.select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(and(eq(tickets.status, 'CANCELADO'), sql`${tickets.closedAt} >= ${rangeStart}`));
    const cancelledCount = cancelledInRange[0]?.count || 0;

    const activeCycles = await db.select()
      .from(ticketSlaCycles)
      .where(inArray(ticketSlaCycles.ticketId, allActiveTickets.map(t => t.id).length > 0 ? allActiveTickets.map(t => t.id) : ['__none__']));

    const cycleByTicket = new Map<string, typeof activeCycles[0]>();
    for (const c of activeCycles) {
      const existing = cycleByTicket.get(c.ticketId);
      if (!existing || c.cycleNumber > existing.cycleNumber) {
        cycleByTicket.set(c.ticketId, c);
      }
    }

    function computeSlaState(cycle: typeof activeCycles[0] | undefined): 'OK' | 'RISK' | 'BREACHED' {
      if (!cycle) return 'OK';
      const dueAt = cycle.resolutionDueAt.getTime();
      const nowMs = now.getTime();
      if (nowMs > dueAt) return 'BREACHED';
      const totalDuration = dueAt - cycle.openedAt.getTime();
      const riskThreshold = Math.min(totalDuration * 0.2, 60 * 60 * 1000);
      if ((dueAt - nowMs) <= riskThreshold) return 'RISK';
      return 'OK';
    }

    let slaOk = 0, slaRisk = 0, slaBreached = 0;
    for (const t of allActiveTickets) {
      const state = computeSlaState(cycleByTicket.get(t.id));
      if (state === 'OK') slaOk++;
      else if (state === 'RISK') slaRisk++;
      else slaBreached++;
    }

    const allCategories = await db.select().from(ticketCategories);
    const catMap = new Map(allCategories.map(c => [c.id, c]));
    const allUsers = await db.select({ id: users.id, name: users.name }).from(users);
    const userMap = new Map(allUsers.map(u => [u.id, u.name]));

    const allAssignees = allActiveTickets.length > 0
      ? await db.select().from(ticketAssignees)
          .where(inArray(ticketAssignees.ticketId, allActiveTickets.map(t => t.id)))
      : [];
    const assigneesByTicket = new Map<string, string[]>();
    for (const a of allAssignees) {
      const arr = assigneesByTicket.get(a.ticketId) || [];
      arr.push(userMap.get(a.userId) || a.userId);
      assigneesByTicket.set(a.ticketId, arr);
    }

    const queue = allActiveTickets.map(t => {
      const cat = catMap.get(t.categoryId);
      const cycle = cycleByTicket.get(t.id);
      return {
        ticketId: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        categoryName: cat?.name || '',
        categoryBranch: cat?.branch || '',
        creatorName: userMap.get(t.createdBy) || '',
        createdAt: t.createdAt.toISOString(),
        assignees: assigneesByTicket.get(t.id) || [],
        slaState: computeSlaState(cycle),
        resolutionDueAt: cycle?.resolutionDueAt?.toISOString() || null,
      };
    });

    const wipMap = new Map<string, number>();
    for (const a of allAssignees) {
      const ticket = allActiveTickets.find(t => t.id === a.ticketId);
      if (ticket && (ticket.status === 'EM_ANDAMENTO' || ticket.status === 'ABERTO')) {
        wipMap.set(a.userId, (wipMap.get(a.userId) || 0) + 1);
      }
    }
    const wipByAssignee = Array.from(wipMap.entries()).map(([userId, count]) => ({
      userId,
      userName: userMap.get(userId) || userId,
      count,
    })).sort((a, b) => b.count - a.count);

    const throughputDays: Array<{ date: string; resolved: number; opened: number }> = [];
    for (let i = daysBack - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayStr = d.toISOString().slice(0, 10);
      throughputDays.push({ date: dayStr, resolved: 0, opened: 0 });
    }

    const ticketsInRange = await db.select().from(tickets)
      .where(sql`${tickets.createdAt} >= ${rangeStart}`);

    const resolvedTicketsInRange = await db.select().from(tickets)
      .where(and(
        eq(tickets.status, 'RESOLVIDO'),
        sql`${tickets.closedAt} >= ${rangeStart}`,
      ));

    for (const t of ticketsInRange) {
      const dayStr = t.createdAt.toISOString().slice(0, 10);
      const entry = throughputDays.find(d => d.date === dayStr);
      if (entry) entry.opened++;
    }
    for (const t of resolvedTicketsInRange) {
      if (t.closedAt) {
        const dayStr = t.closedAt.toISOString().slice(0, 10);
        const entry = throughputDays.find(d => d.date === dayStr);
        if (entry) entry.resolved++;
      }
    }

    const backlogMap = new Map<string, number>();
    for (const t of allActiveTickets) {
      backlogMap.set(t.categoryId, (backlogMap.get(t.categoryId) || 0) + 1);
    }
    const backlogByCategory = Array.from(backlogMap.entries()).map(([catId, count]) => {
      const cat = catMap.get(catId);
      return {
        categoryName: cat?.name || 'Sem categoria',
        categoryBranch: cat?.branch || '',
        count,
      };
    }).sort((a, b) => b.count - a.count);

    return {
      summary: {
        open: openCount,
        inProgress: inProgressCount,
        waitingUser: waitingUserCount,
        resolved: resolvedCount,
        cancelled: cancelledCount,
        slaOk,
        slaRisk,
        slaBreached,
      },
      queue,
      wipByAssignee,
      throughput: throughputDays,
      backlogByCategory,
    };
  }

  async listTypingTexts(activeOnly?: boolean): Promise<TypingText[]> {
    if (activeOnly) {
      return db.select().from(typingTexts).where(eq(typingTexts.isActive, true)).orderBy(typingTexts.createdAt);
    }
    return db.select().from(typingTexts).orderBy(typingTexts.createdAt);
  }

  async getTypingText(id: string): Promise<TypingText | undefined> {
    const [row] = await db.select().from(typingTexts).where(eq(typingTexts.id, id));
    return row;
  }

  async createTypingText(data: InsertTypingText): Promise<TypingText> {
    const [row] = await db.insert(typingTexts).values(data).returning();
    return row;
  }

  async updateTypingText(id: string, data: Partial<InsertTypingText>): Promise<TypingText | undefined> {
    const [row] = await db.update(typingTexts).set(data).where(eq(typingTexts.id, id)).returning();
    return row;
  }

  async deleteTypingText(id: string): Promise<boolean> {
    await db.delete(typingTexts).where(eq(typingTexts.id, id));
    return true;
  }

  async createTypingSession(userId: string, textId: string, nonce: string, expiresAt: Date): Promise<TypingSession> {
    const [row] = await db.insert(typingSessions).values({
      userId,
      textId,
      nonce,
      startedAt: new Date(),
      expiresAt,
    }).returning();
    return row;
  }

  async getTypingSession(id: string): Promise<TypingSession | undefined> {
    const [row] = await db.select().from(typingSessions).where(eq(typingSessions.id, id));
    return row;
  }

  async getTypingSessionByNonce(nonce: string): Promise<TypingSession | undefined> {
    const [row] = await db.select().from(typingSessions).where(eq(typingSessions.nonce, nonce));
    return row;
  }

  async submitTypingSession(sessionId: string, score: { wpm: number; accuracy: string; durationMs: number; userId: string; sectorId: string | null; monthKey: string; difficulty: number; level: string }): Promise<TypingScore> {
    await db.update(typingSessions).set({ submittedAt: new Date() }).where(eq(typingSessions.id, sessionId));
    const [row] = await db.insert(typingScores).values({
      userId: score.userId,
      sectorId: score.sectorId,
      monthKey: score.monthKey,
      wpm: score.wpm,
      accuracy: score.accuracy,
      durationMs: score.durationMs,
      difficulty: score.difficulty,
      level: score.level,
    }).returning();
    return row;
  }

  async getTypingLeaderboard(opts: { monthKey: string; sectorId?: string; level?: string; limit?: number }): Promise<Array<{ userId: string; userName: string; userPhoto: string | null; sectorName: string | null; wpm: number; accuracy: string; monthKey: string; level: string }>> {
    const conditions: any[] = [eq(typingScores.monthKey, opts.monthKey)];
    if (opts.sectorId) {
      conditions.push(eq(typingScores.sectorId, opts.sectorId));
    }
    if (opts.level) {
      conditions.push(eq(typingScores.level, opts.level));
    }

    const rows = await db
      .select({
        id: typingScores.id,
        userId: typingScores.userId,
        userName: users.name,
        userPhoto: users.photoUrl,
        sectorName: sectors.name,
        wpm: typingScores.wpm,
        accuracy: typingScores.accuracy,
        monthKey: typingScores.monthKey,
        level: typingScores.level,
      })
      .from(typingScores)
      .innerJoin(users, eq(typingScores.userId, users.id))
      .leftJoin(sectors, eq(typingScores.sectorId, sectors.id))
      .where(and(...conditions))
      .orderBy(desc(typingScores.wpm))
      .limit((opts.limit || 20) * 10); // fetch extra rows to deduplicate per user

    const bestByUser = new Map<string, typeof rows[0]>();
    for (const row of rows) {
      const existing = bestByUser.get(row.userId);
      if (!existing || row.wpm > existing.wpm) {
        bestByUser.set(row.userId, row);
      }
    }

    return Array.from(bestByUser.values())
      .sort((a, b) => b.wpm - a.wpm)
      .slice(0, opts.limit || 20)
      .map(r => ({
        userId: r.userId,
        userName: r.userName,
        userPhoto: r.userPhoto,
        sectorName: r.sectorName || null,
        wpm: r.wpm,
        accuracy: r.accuracy,
        monthKey: r.monthKey,
        level: r.level,
      }));
  }

  async getUserBestTypingScore(userId: string, level?: string): Promise<TypingScore | undefined> {
    const conditions: any[] = [eq(typingScores.userId, userId)];
    if (level) {
      conditions.push(eq(typingScores.level, level));
    }
    const [row] = await db.select().from(typingScores)
      .where(and(...conditions))
      .orderBy(desc(typingScores.wpm))
      .limit(1);
    return row;
  }

  async getTypingPodium(monthKey: string): Promise<Array<{ level: string; rank: number; userId: string; userName: string; userPhoto: string | null; wpm: number; accuracy: string }>> {
    const result: Array<{ level: string; rank: number; userId: string; userName: string; userPhoto: string | null; wpm: number; accuracy: string }> = [];

    for (const level of ["easy", "medium", "hard"] as const) {
      const rows = await db
        .select({
          userId: typingScores.userId,
          userName: users.name,
          userPhoto: users.photoUrl,
          wpm: typingScores.wpm,
          accuracy: typingScores.accuracy,
        })
        .from(typingScores)
        .innerJoin(users, eq(typingScores.userId, users.id))
        .where(and(eq(typingScores.monthKey, monthKey), eq(typingScores.level, level)))
        .orderBy(desc(typingScores.wpm))
        .limit(100);

      // Deduplicate by user, keep best wpm
      const bestByUser = new Map<string, typeof rows[0]>();
      for (const row of rows) {
        if (!bestByUser.has(row.userId) || row.wpm > bestByUser.get(row.userId)!.wpm) {
          bestByUser.set(row.userId, row);
        }
      }

      Array.from(bestByUser.values())
        .sort((a, b) => b.wpm - a.wpm)
        .slice(0, 3)
        .forEach((r, i) => {
          result.push({
            level,
            rank: i + 1,
            userId: r.userId,
            userName: r.userName,
            userPhoto: r.userPhoto,
            wpm: r.wpm,
            accuracy: r.accuracy,
          });
        });
    }

    return result;
  }
}

export const storage = new DatabaseStorage();
