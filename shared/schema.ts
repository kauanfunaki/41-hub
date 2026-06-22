import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, integer, jsonb, pgEnum, unique, numeric, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const roleEnum = pgEnum("role_type", ["Admin", "Coordenador", "Usuario"]);
export const resourceTypeEnum = pgEnum("resource_type", ["APP", "DASHBOARD"]);
export const embedModeEnum = pgEnum("embed_mode", ["LINK", "IFRAME", "POWERBI"]);
export const openBehaviorEnum = pgEnum("open_behavior", ["HUB_ONLY", "NEW_TAB_ONLY", "BOTH"]);
export const overrideEffectEnum = pgEnum("override_effect", ["ALLOW", "DENY"]);
export const healthStatusEnum = pgEnum("health_status", ["UP", "DEGRADED", "DOWN"]);
export const authProviderEnum = pgEnum("auth_provider", ["entra", "local"]);
export const ticketStatusEnum = pgEnum("ticket_status", ["ABERTO", "NA_FILA", "EM_ANDAMENTO", "AGUARDANDO_USUARIO", "AGUARDANDO_APROVACAO", "AGUARDANDO_REQUERENTE", "STANDBY", "RESOLVIDO", "CANCELADO"]);
export const ticketPriorityEnum = pgEnum("ticket_priority", ["BAIXA", "MEDIA", "ALTA", "URGENTE"]);
export const ticketEventTypeEnum = pgEnum("ticket_event_type", ["ticket_created", "status_changed", "assignees_changed", "comment_added", "attachment_added", "resolved", "reopened", "priority_changed", "category_changed", "approved", "rejected", "sla_deadline_changed"]);
export const notificationTypeEnum = pgEnum("notification_type", ["ticket_created", "ticket_comment", "ticket_status", "resource_updated", "alert"]);
export const alertSeverityEnum = pgEnum("alert_severity", ["info", "warning", "critical"]);

// Users table
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  entraOid: varchar("entra_oid", { length: 255 }).unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  authProvider: authProviderEnum("auth_provider").notNull().default("entra"),
  passwordHash: varchar("password_hash", { length: 255 }),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  passwordUpdatedAt: timestamp("password_updated_at"),
  themePref: varchar("theme_pref", { length: 10 }).default("light"),
  whatsapp: varchar("whatsapp", { length: 20 }),
  photoUrl: varchar("photo_url", { length: 500 }),
  tutorialCompleted: boolean("tutorial_completed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Admin settings table (for default password, etc.)
export const adminSettings = pgTable("admin_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Sectors table
export const sectors = pgTable("sectors", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Roles table
export const roles = pgTable("roles", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: roleEnum("name").notNull().unique(),
});

// User-Sector-Roles junction table
export const userSectorRoles = pgTable("user_sector_roles", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  sectorId: varchar("sector_id", { length: 36 }).notNull().references(() => sectors.id, { onDelete: "cascade" }),
  roleId: varchar("role_id", { length: 36 }).notNull().references(() => roles.id, { onDelete: "cascade" }),
});

// Resources table
export const resources = pgTable("resources", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  type: resourceTypeEnum("type").notNull(),
  sectorId: varchar("sector_id", { length: 36 }).references(() => sectors.id, { onDelete: "set null" }),
  icon: varchar("icon", { length: 100 }).default("Layout"),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  embedMode: embedModeEnum("embed_mode").notNull().default("LINK"),
  openBehavior: openBehaviorEnum("open_behavior").notNull().default("BOTH"),
  url: text("url"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  isActive: boolean("is_active").notNull().default(true),
  healthStatusOverride: healthStatusEnum("health_status_override").default("UP"),
  healthMessage: text("health_message"),
  healthUpdatedAt: timestamp("health_updated_at"),
  healthUpdatedBy: varchar("health_updated_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Resource overrides (allow/deny per user)
export const resourceOverrides = pgTable("resource_overrides", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  resourceId: varchar("resource_id", { length: 36 }).notNull().references(() => resources.id, { onDelete: "cascade" }),
  effect: overrideEffectEnum("effect").notNull(),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Favorites
export const favorites = pgTable("favorites", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  resourceId: varchar("resource_id", { length: 36 }).notNull().references(() => resources.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Recent access
export const recentAccess = pgTable("recent_access", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  resourceId: varchar("resource_id", { length: 36 }).notNull().references(() => resources.id, { onDelete: "cascade" }),
  lastAccessAt: timestamp("last_access_at").notNull().defaultNow(),
});

// Audit logs
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  actorUserId: varchar("actor_user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(),
  targetType: varchar("target_type", { length: 50 }),
  targetId: varchar("target_id", { length: 36 }),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  ip: varchar("ip", { length: 45 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Health checks
export const healthChecks = pgTable("health_checks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  resourceId: varchar("resource_id", { length: 36 }).notNull().references(() => resources.id, { onDelete: "cascade" }),
  status: healthStatusEnum("status").notNull().default("UP"),
  lastCheckAt: timestamp("last_check_at").notNull().defaultNow(),
  responseTimeMs: integer("response_time_ms"),
  details: jsonb("details").$type<Record<string, any>>().default({}),
});

// Ticket categories (hierarchical: parent=branch root, child=service)
export const ticketCategories = pgTable("ticket_categories", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  branch: varchar("branch", { length: 120 }).notNull(),
  parentId: varchar("parent_id", { length: 36 }).references((): any => ticketCategories.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  descriptionTemplate: text("description_template"),
  formSchema: jsonb("form_schema").$type<Array<{
    key: string; label: string; type: string; required?: boolean; options?: string[];
    placeholder?: string; helpText?: string;
    rules?: { regex?: string; minLen?: number; maxLen?: number; min?: number; max?: number };
  }>>(),
  templateApplyMode: varchar("template_apply_mode", { length: 30 }).notNull().default("replace_if_empty"),
  requiredAttachments: jsonb("required_attachments").$type<Array<{ key: string; label: string; mime?: string[]; required?: boolean }>>().default([]),
  checklistTemplate: jsonb("checklist_template").$type<Array<{ key: string; label: string }>>().default([]),
  kbTags: text("kb_tags").array().default(sql`ARRAY[]::text[]`),
  autoAwaitOnMissing: boolean("auto_await_on_missing").notNull().default(false),
  requiresApproval: boolean("requires_approval").notNull().default(false),
  approvalMode: varchar("approval_mode", { length: 32 }).notNull().default("REQUESTER_COORDINATOR"),
  approvalUserIds: text("approval_user_ids").array().default(sql`ARRAY[]::text[]`),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Ticket SLA policies
export const ticketSlaPolicies = pgTable("ticket_sla_policies", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 120 }).notNull().unique(),
  priority: ticketPriorityEnum("priority").notNull(),
  firstResponseMinutes: integer("first_response_minutes").notNull(),
  resolutionMinutes: integer("resolution_minutes").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Tickets
export const tickets = pgTable("tickets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  status: ticketStatusEnum("status").notNull().default("ABERTO"),
  priority: ticketPriorityEnum("priority").notNull().default("MEDIA"),
  requesterSectorId: varchar("requester_sector_id", { length: 36 }).notNull().references(() => sectors.id),
  targetSectorId: varchar("target_sector_id", { length: 36 }).notNull().references(() => sectors.id),
  categoryId: varchar("category_id", { length: 36 }).notNull().references(() => ticketCategories.id),
  createdBy: varchar("created_by", { length: 36 }).notNull().references(() => users.id),
  relatedResourceId: varchar("related_resource_id", { length: 36 }).references(() => resources.id, { onDelete: "set null" }),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  requestData: jsonb("request_data").$type<Record<string, any>>().default({}),
  requestDataVersion: integer("request_data_version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
  queueOrder: integer("queue_order"),
});

// Ticket assignees (N per ticket)
export const ticketAssignees = pgTable("ticket_assignees", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id", { length: 36 }).notNull().references(() => tickets.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  assignedBy: varchar("assigned_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
}, (t) => [
  unique().on(t.ticketId, t.userId),
]);

// Ticket comments
export const ticketComments = pgTable("ticket_comments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id", { length: 36 }).notNull().references(() => tickets.id, { onDelete: "cascade" }),
  authorId: varchar("author_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  isInternal: boolean("is_internal").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Ticket attachments
export const ticketAttachments = pgTable("ticket_attachments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id", { length: 36 }).notNull().references(() => tickets.id, { onDelete: "cascade" }),
  uploadedBy: varchar("uploaded_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  storageName: varchar("storage_name", { length: 255 }).notNull().unique(),
  mimeType: varchar("mime_type", { length: 120 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  attachmentKey: varchar("attachment_key", { length: 80 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Ticket checklist items (auto-created from category template)
export const ticketChecklistItems = pgTable("ticket_checklist_items", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id", { length: 36 }).notNull().references(() => tickets.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 80 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  isDone: boolean("is_done").notNull().default(false),
  doneBy: varchar("done_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  doneAt: timestamp("done_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  unique().on(t.ticketId, t.key),
]);

// Ticket SLA cycles (reopening = new cycle)
export const ticketSlaCycles = pgTable("ticket_sla_cycles", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id", { length: 36 }).notNull().references(() => tickets.id, { onDelete: "cascade" }),
  cycleNumber: integer("cycle_number").notNull(),
  openedAt: timestamp("opened_at").notNull(),
  firstResponseDueAt: timestamp("first_response_due_at").notNull(),
  resolutionDueAt: timestamp("resolution_due_at").notNull(),
  firstResponseAt: timestamp("first_response_at"),
  resolvedAt: timestamp("resolved_at"),
  firstResponseBreached: boolean("first_response_breached").notNull().default(false),
  resolutionBreached: boolean("resolution_breached").notNull().default(false),
  resolutionDueAtManual: boolean("resolution_due_at_manual").notNull().default(false),
  resolutionDueAtManualReason: text("resolution_due_at_manual_reason"),
  resolutionDueAtUpdatedBy: varchar("resolution_due_at_updated_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  resolutionDueAtUpdatedAt: timestamp("resolution_due_at_updated_at"),
  pausedAt: timestamp("paused_at"),
  pausedTotalBusinessMinutes: integer("paused_total_business_minutes").notNull().default(0),
});

// Ticket events (for metrics/history)
export const ticketEvents = pgTable("ticket_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id", { length: 36 }).notNull().references(() => tickets.id, { onDelete: "cascade" }),
  actorUserId: varchar("actor_user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  type: ticketEventTypeEnum("type").notNull(),
  data: jsonb("data").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Ticket approvals
export const ticketApprovals = pgTable("ticket_approvals", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id", { length: 36 }).notNull().references(() => tickets.id, { onDelete: "cascade" }),
  cycleNumber: integer("cycle_number").notNull(),
  requestedBy: varchar("requested_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  requesterSectorId: varchar("requester_sector_id", { length: 36 }).references(() => sectors.id, { onDelete: "set null" }),
  status: varchar("status", { length: 16 }).notNull().default("PENDING"),
  approverUserId: varchar("approver_user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  decisionNote: text("decision_note"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  decidedAt: timestamp("decided_at"),
}, (t) => [
  unique().on(t.ticketId, t.cycleNumber),
]);

// Ticket SLA alert dedup
export const ticketAlertsDedup = pgTable("ticket_alerts_dedup", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id", { length: 36 }).notNull().references(() => tickets.id, { onDelete: "cascade" }),
  cycleNumber: integer("cycle_number").notNull(),
  alertType: varchar("alert_type", { length: 24 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  unique().on(t.ticketId, t.cycleNumber, t.alertType),
]);

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertSectorSchema = createInsertSchema(sectors).omit({
  id: true,
  createdAt: true,
});

export const insertResourceSchema = createInsertSchema(resources).omit({
  id: true,
  createdAt: true,
});

export const insertUserSectorRoleSchema = createInsertSchema(userSectorRoles).omit({
  id: true,
});

export const insertResourceOverrideSchema = createInsertSchema(resourceOverrides).omit({
  id: true,
  createdAt: true,
});

export const insertFavoriteSchema = createInsertSchema(favorites).omit({
  id: true,
  createdAt: true,
});

// Notification settings (admin toggle per type)
export const notificationSettings = pgTable("notification_settings", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  type: notificationTypeEnum("type").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Notifications (per-user inbox)
export const notifications = pgTable("notifications", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  recipientUserId: varchar("recipient_user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  message: text("message").notNull(),
  linkUrl: varchar("link_url", { length: 255 }),
  data: jsonb("data").default({}),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Push subscriptions (Web Push API — notificações em segundo plano)
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export const insertAdminSettingSchema = createInsertSchema(adminSettings).omit({
  updatedAt: true,
});

export const insertNotificationSettingSchema = createInsertSchema(notificationSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertTicketCategorySchema = createInsertSchema(ticketCategories).omit({
  id: true,
  createdAt: true,
});

export const insertTicketSlaPolicySchema = createInsertSchema(ticketSlaPolicies).omit({
  id: true,
  createdAt: true,
});

export const insertTicketSchema = createInsertSchema(tickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  closedAt: true,
});

export const insertTicketApprovalSchema = createInsertSchema(ticketApprovals).omit({
  id: true,
  requestedAt: true,
  decidedAt: true,
});

export const insertTicketCommentSchema = createInsertSchema(ticketComments).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Sector = typeof sectors.$inferSelect;
export type InsertSector = z.infer<typeof insertSectorSchema>;

export type Role = typeof roles.$inferSelect;

export type UserSectorRole = typeof userSectorRoles.$inferSelect;
export type InsertUserSectorRole = z.infer<typeof insertUserSectorRoleSchema>;

export type Resource = typeof resources.$inferSelect;
export type InsertResource = z.infer<typeof insertResourceSchema>;

export type ResourceOverride = typeof resourceOverrides.$inferSelect;
export type InsertResourceOverride = z.infer<typeof insertResourceOverrideSchema>;

export type Favorite = typeof favorites.$inferSelect;
export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;

export type RecentAccess = typeof recentAccess.$inferSelect;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

export type HealthCheck = typeof healthChecks.$inferSelect;

export type AdminSetting = typeof adminSettings.$inferSelect;
export type InsertAdminSetting = z.infer<typeof insertAdminSettingSchema>;

export type TicketCategory = typeof ticketCategories.$inferSelect;
export type InsertTicketCategory = z.infer<typeof insertTicketCategorySchema>;

export type TicketSlaPolicy = typeof ticketSlaPolicies.$inferSelect;
export type InsertTicketSlaPolicy = z.infer<typeof insertTicketSlaPolicySchema>;

export type Ticket = typeof tickets.$inferSelect;
export type InsertTicket = z.infer<typeof insertTicketSchema>;

export type TicketAssignee = typeof ticketAssignees.$inferSelect;

export type TicketComment = typeof ticketComments.$inferSelect;
export type InsertTicketComment = z.infer<typeof insertTicketCommentSchema>;

export type TicketAttachment = typeof ticketAttachments.$inferSelect;

export type TicketChecklistItem = typeof ticketChecklistItems.$inferSelect;

export type TicketSlaCycle = typeof ticketSlaCycles.$inferSelect;

export type TicketEvent = typeof ticketEvents.$inferSelect;

export type TicketApproval = typeof ticketApprovals.$inferSelect;
export type InsertTicketApproval = z.infer<typeof insertTicketApprovalSchema>;

export type TicketAlertDedup = typeof ticketAlertsDedup.$inferSelect;

export type NotificationSetting = typeof notificationSettings.$inferSelect;
export type InsertNotificationSetting = z.infer<typeof insertNotificationSettingSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// ============ Knowledge Base ============

export const kbArticles = pgTable("kb_articles", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  categoryId: varchar("category_id", { length: 36 }).references(() => ticketCategories.id, { onDelete: "set null" }),
  isPublished: boolean("is_published").notNull().default(true),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  updatedBy: varchar("updated_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const kbArticleViews = pgTable("kb_article_views", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id", { length: 36 }).notNull().references(() => kbArticles.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  viewedAt: timestamp("viewed_at").notNull().defaultNow(),
});

export const kbArticleFeedback = pgTable("kb_article_feedback", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id", { length: 36 }).notNull().references(() => kbArticles.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  helpful: boolean("helpful").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique().on(t.articleId, t.userId)]);

export const insertKbArticleSchema = createInsertSchema(kbArticles).omit({ id: true, createdAt: true, updatedAt: true });
export const insertKbArticleFeedbackSchema = createInsertSchema(kbArticleFeedback).omit({ id: true, createdAt: true });

export type KbArticle = typeof kbArticles.$inferSelect;
export type InsertKbArticle = z.infer<typeof insertKbArticleSchema>;
export type KbArticleFeedback = typeof kbArticleFeedback.$inferSelect;
export type KbArticleView = typeof kbArticleViews.$inferSelect;

// ============ Typing Test ============

export const typingTexts = pgTable("typing_texts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  language: varchar("language", { length: 10 }).notNull().default("pt"),
  content: text("content").notNull(),
  difficulty: integer("difficulty").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const typingSessions = pgTable("typing_sessions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  textId: varchar("text_id", { length: 36 }).references(() => typingTexts.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  nonce: varchar("nonce", { length: 32 }).notNull().unique(),
  submittedAt: timestamp("submitted_at"),
});

export const typingScores = pgTable("typing_scores", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  sectorId: varchar("sector_id", { length: 36 }).references(() => sectors.id, { onDelete: "set null" }),
  monthKey: varchar("month_key", { length: 7 }).notNull(),
  wpm: integer("wpm").notNull(),
  accuracy: numeric("accuracy", { precision: 5, scale: 2 }).notNull(),
  durationMs: integer("duration_ms").notNull(),
  difficulty: integer("difficulty").notNull().default(1),
  // Human-readable level derived from difficulty range: "easy"(1-2) | "medium"(3) | "hard"(4-5)
  level: varchar("level", { length: 10 }).notNull().default("medium"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTypingTextSchema = createInsertSchema(typingTexts).omit({ id: true, createdAt: true });
export const insertTypingSessionSchema = createInsertSchema(typingSessions).omit({ id: true });
export const insertTypingScoreSchema = createInsertSchema(typingScores).omit({ id: true, createdAt: true });

export type TypingText = typeof typingTexts.$inferSelect;
export type InsertTypingText = z.infer<typeof insertTypingTextSchema>;
export type TypingSession = typeof typingSessions.$inferSelect;
export type TypingScore = typeof typingScores.$inferSelect;
export type InsertTypingScore = z.infer<typeof insertTypingScoreSchema>;

// System Alerts
export const systemAlerts = pgTable("system_alerts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  severity: alertSeverityEnum("severity").notNull().default("info"),
  isActive: boolean("is_active").notNull().default(true),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const systemAlertReads = pgTable("system_alert_reads", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  alertId: varchar("alert_id", { length: 36 }).notNull().references(() => systemAlerts.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at").notNull().defaultNow(),
}, (t) => [unique().on(t.alertId, t.userId)]);

// API Tokens (for integrations)
export const apiTokens = pgTable("api_tokens", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 120 }).notNull(),
  tokenHash: varchar("token_hash", { length: 255 }).notNull(),
  scopes: text("scopes").array().default(sql`ARRAY[]::text[]`),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  revokedAt: timestamp("revoked_at"),
});

export const insertSystemAlertSchema = createInsertSchema(systemAlerts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertApiTokenSchema = createInsertSchema(apiTokens).omit({ id: true, createdAt: true });

// ============ Platform Feedback ============

export const feedbackTypeEnum = pgEnum("feedback_type", ["BUG", "SUGESTAO", "MELHORIA", "OUTRO"]);

export const platformFeedback = pgTable("platform_feedback", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  type: feedbackTypeEnum("type").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPlatformFeedbackSchema = createInsertSchema(platformFeedback).omit({ id: true, createdAt: true, isRead: true });
export type PlatformFeedback = typeof platformFeedback.$inferSelect;
export type InsertPlatformFeedback = z.infer<typeof insertPlatformFeedbackSchema>;

export type SystemAlert = typeof systemAlerts.$inferSelect;
export type InsertSystemAlert = z.infer<typeof insertSystemAlertSchema>;
export type SystemAlertRead = typeof systemAlertReads.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;

// Extended types for frontend
export type ResourceWithHealth = Resource & {
  healthStatus?: "UP" | "DEGRADED" | "DOWN";
  sectorName?: string;
  isFavorite?: boolean;
  hasActiveAlert?: boolean;
};

// Effective health = admin override (if set) else auto-detected
export function effectiveHealth(r: ResourceWithHealth): "UP" | "DEGRADED" | "DOWN" {
  return r.healthStatusOverride ?? r.healthStatus ?? "UP";
}

export type UserWithRoles = User & {
  roles: Array<{
    sectorId: string;
    sectorName: string;
    roleName: "Admin" | "Coordenador" | "Usuario";
  }>;
  isAdmin: boolean;
};

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  whatsapp: string | null;
  photoUrl: string | null;
  roles: Array<{
    sectorId: string;
    sectorName: string;
    roleName: "Admin" | "Coordenador" | "Usuario";
  }>;
};

export type TicketWithDetails = Ticket & {
  requesterSectorName?: string;
  targetSectorName?: string;
  categoryName?: string;
  categoryBranch?: "INFRA" | "DEV" | "SUPORTE";
  creatorName?: string;
  creatorEmail?: string;
  assignees?: Array<{ userId: string; userName: string; userEmail: string }>;
  currentCycle?: TicketSlaCycle | null;
  queuePosition?: number | null;
  queueTotal?: number | null;
  categoryFormSchema?: Array<{ key: string; label: string; type: string; required?: boolean }> | null;
};

export type TicketCategoryTree = TicketCategory & {
  children?: TicketCategory[];
};

// ============ 41 Ops Center ============

export const opsEventStatusEnum = pgEnum("ops_event_status", ["SUCCESS", "ERROR", "WARNING"]);

export const opsWatchers = pgTable("ops_watchers", {
  slug: varchar("slug", { length: 60 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  client: varchar("client", { length: 80 }),
  folder: text("folder"),          // pasta de entrada (input)
  folderOutput: text("folder_output"), // pasta de saída (output)
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const opsEvents = pgTable("ops_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  watcherSlug: varchar("watcher_slug", { length: 60 }).notNull().references(() => opsWatchers.slug),
  filename: varchar("filename", { length: 500 }).notNull(),
  filenameRenamed: varchar("filename_renamed", { length: 500 }),
  status: opsEventStatusEnum("status").notNull(),
  errorMessage: text("error_message"),
  client: varchar("client", { length: 80 }),
  n8nExecutionId: varchar("n8n_execution_id", { length: 120 }),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  processedAt: timestamp("processed_at").notNull().defaultNow(),
});

export const insertOpsEventSchema = createInsertSchema(opsEvents).omit({ id: true });

// Watcher ↔ Sector M2M — controls who can see each watcher in Ops Center.
// Non-admin users (including Coordinators) see only watchers that have at least
// one sector matching the user's own sector memberships (user_sector_roles).
export const opsWatcherSectors = pgTable("ops_watcher_sectors", {
  watcherSlug: varchar("watcher_slug", { length: 60 }).notNull().references(() => opsWatchers.slug, { onDelete: "cascade" }),
  sectorId:    varchar("sector_id",    { length: 36 }).notNull().references(() => sectors.id,       { onDelete: "cascade" }),
}, (t) => ({ pk: primaryKey({ columns: [t.watcherSlug, t.sectorId] }) }));

export type OpsWatcher = typeof opsWatchers.$inferSelect;
export type OpsEvent = typeof opsEvents.$inferSelect;
export type InsertOpsEvent = z.infer<typeof insertOpsEventSchema>;
export type OpsWatcherSector = typeof opsWatcherSectors.$inferSelect;
