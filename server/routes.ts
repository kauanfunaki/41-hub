import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import bcrypt from "bcrypt";
import webpush from "web-push";
import { storage } from "./storage";
import { pool } from "./db";
import type { UserWithRoles } from "@shared/schema";
import { emitEvent } from "./lib/webhooks";
import { isEntraConfigured, getMsalClient } from "./lib/entra";

// ── Web Push (VAPID) setup ──────────────────────────────────────────────────
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || "mailto:admin@41tech.com.br",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const SALT_ROUNDS = 12;
const DEFAULT_PASSWORD = "41Tech@2026";
const DEFAULT_PASSWORD_SETTING_KEY = "DEFAULT_LOCAL_PASSWORD";

// Password validation: min 10 chars, 1 upper, 1 lower, 1 number, 1 special
const passwordSchema = z.string()
  .min(10, "Senha deve ter no mínimo 10 caracteres")
  .regex(/[A-Z]/, "Senha deve conter pelo menos uma letra maiúscula")
  .regex(/[a-z]/, "Senha deve conter pelo menos uma letra minúscula")
  .regex(/[0-9]/, "Senha deve conter pelo menos um número")
  .regex(/[!@#$%^&*(),.?":{}|<>]/, "Senha deve conter pelo menos um caractere especial");

// Rate limiting store (simple in-memory for now)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

// Configure multer for photo uploads
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${req.user?.id || "unknown"}-${Date.now()}${ext}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage: photoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG and PNG images are allowed"));
    }
  },
});

const ticketUploadDir = path.join(uploadDir, "tickets");
if (!fs.existsSync(ticketUploadDir)) {
  fs.mkdirSync(ticketUploadDir, { recursive: true });
}

const ticketAttachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ticketUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const rand = crypto.randomBytes(8).toString("hex");
    const filename = `${req.params.id}-${Date.now()}-${rand}${ext}`;
    cb(null, filename);
  },
});

const TICKET_MAX_FILE_MB = 100;
const ticketUpload = multer({
  storage: ticketAttachmentStorage,
  limits: { fileSize: TICKET_MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg", "image/png", "application/pdf", "video/mp4",
      "application/zip", "application/x-zip-compressed",
      "application/x-7z-compressed",
      "application/vnd.rar", "application/x-rar-compressed",
      "application/x-rar",
      "application/octet-stream", // some browsers send this for .zip
      // Office documents (used by some ticket-category attachment configs)
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain", "text/csv",
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = [".jpg", ".jpeg", ".png", ".pdf", ".mp4", ".zip", ".7z", ".rar", ".docx", ".xlsx", ".txt", ".csv"];
    if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Tipo de arquivo não permitido. Formatos aceitos: JPEG, PNG, PDF, MP4, ZIP, RAR, 7Z, DOCX, XLSX, TXT, CSV"));
    }
  },
});

// Validation schemas
const createSectorSchema = z.object({
  name: z.string().min(1).max(255),
  color: z.string().max(20).optional(),
});

const updateSectorSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  color: z.string().max(20).optional(),
});

const createUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(255),
  sectorId: z.string().uuid().optional(),
  sectorIds: z.array(z.string().uuid()).optional(),
  roleName: z.enum(["Admin", "Coordenador", "Usuario"]).optional(),
  authProvider: z.enum(["entra", "local"]).optional().default("entra"),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
  themePref: z.enum(["light", "dark"]).optional(),
  sectorIds: z.array(z.string().uuid()).optional(),
  roleName: z.enum(["Admin", "Coordenador", "Usuario"]).optional(),
});

const createResourceSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["APP", "DASHBOARD"]),
  sectorId: z.string().uuid().nullable().optional(),
  embedMode: z.enum(["LINK", "IFRAME", "POWERBI"]).optional(),
  openBehavior: z.enum(["HUB_ONLY", "NEW_TAB_ONLY", "BOTH"]).optional(),
  url: z.string().url().nullable().optional(),
  tags: z.array(z.string()).optional(),
  icon: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
});

const updateResourceSchema = createResourceSchema.partial();

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: UserWithRoles;
    }
  }
}

// Session configuration
declare module "express-session" {
  interface SessionData {
    userId?: string;
    entraState?: string;
  }
}

// Auth middleware
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = await storage.getUserWithRoles(req.session.userId);
  if (!user || !user.isActive) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.user = user;
  next();
}

// Admin middleware - only full admins can access all admin routes
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: "Forbidden - Admin access required" });
  }
  next();
}

// Coordinator or Admin middleware - coordinators can manage their sectors
async function requireAdminOrCoordinator(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) {
    const isCoordinator = req.user?.roles?.some(r => r.roleName === "Coordenador");
    if (!isCoordinator) {
      return res.status(403).json({ error: "Forbidden - Admin or Coordinator access required" });
    }
  }
  next();
}

// Token-based auth for n8n → Ops Center integration (requires "ops" scope)
async function requireOpsToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Bearer token" });
  }
  const rawToken = authHeader.slice(7);
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  try {
    const result = await pool.query(
      `SELECT id, scopes FROM api_tokens WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash]
    );
    if (!result.rows.length) {
      return res.status(401).json({ error: "Invalid or revoked token" });
    }
    const scopes: string[] = result.rows[0].scopes ?? [];
    if (!scopes.includes("ops")) {
      return res.status(403).json({ error: "Token does not have 'ops' scope" });
    }
    next();
  } catch (err) {
    console.error("[requireOpsToken] error:", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

// Helper to check if coordinator can manage a sector
function canCoordinatorManageSector(user: UserWithRoles, sectorId: string): boolean {
  if (user.isAdmin) return true;
  return user.roles?.some(r => r.roleName === "Coordenador" && r.sectorId === sectorId) || false;
}

// Ticket access: deny for plain "Usuario" role (Admin and Coordenador can access)
async function requireTicketAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return next();
  const roles = req.user.roles?.map((r: any) => r.roleName) ?? [];
  const hasTicketAccess = req.user.isAdmin || roles.includes("Coordenador");
  if (!hasTicketAccess) {
    return res.status(403).json({
      error: "Acesso negado: role Usuario não tem acesso a chamados",
      code: "TICKET_ACCESS_DENIED",
    });
  }
  next();
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ── Startup diagnostics log ──────────────────────────────────────────────
  try {
    const dbRes = await pool.query("SELECT current_database() AS db, version() AS ver");
    const dbName = dbRes.rows[0]?.db ?? "unknown";
    const rawUrl = process.env.DATABASE_URL ?? "";
    // Strip password from URL before logging
    const safeUrl = rawUrl.replace(/:\/\/[^:]+:[^@]+@/, "://<credentials>@");
    console.info(`[startup] DB connected — database="${dbName}"  url="${safeUrl}"  pg="${dbRes.rows[0]?.ver?.split(" ")[1] ?? "?"}"`);
  } catch (e) {
    console.error("[startup] Failed to connect to DB:", e);
  }

  // ── Idempotent schema bootstrap (safe for prod without full migrations) ──
  try {
    // Ensure pg enums exist before tables that use them
    await pool.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_severity') THEN
        CREATE TYPE alert_severity AS ENUM ('info','warning','critical');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'health_status') THEN
        CREATE TYPE health_status AS ENUM ('UP','DEGRADED','DOWN');
      END IF;
    END $$`);

    // system_alerts table
    await pool.query(`CREATE TABLE IF NOT EXISTS system_alerts (
      id          VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      title       VARCHAR(200) NOT NULL,
      message     TEXT NOT NULL,
      severity    alert_severity NOT NULL DEFAULT 'info',
      is_active   BOOLEAN NOT NULL DEFAULT true,
      starts_at   TIMESTAMPTZ,
      ends_at     TIMESTAMPTZ,
      created_by  VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    // system_alert_reads table
    await pool.query(`CREATE TABLE IF NOT EXISTS system_alert_reads (
      id        VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      alert_id  VARCHAR(36) NOT NULL REFERENCES system_alerts(id) ON DELETE CASCADE,
      user_id   VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(alert_id, user_id)
    )`);

    // health columns on resources (added post-initial schema)
    await pool.query(`ALTER TABLE resources
      ADD COLUMN IF NOT EXISTS health_status_override health_status DEFAULT 'UP',
      ADD COLUMN IF NOT EXISTS health_message TEXT,
      ADD COLUMN IF NOT EXISTS health_updated_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS health_updated_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL`);

    // api_tokens table for integration token management
    await pool.query(`CREATE TABLE IF NOT EXISTS api_tokens (
      id            VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      name          VARCHAR(120) NOT NULL,
      token_hash    VARCHAR(255) NOT NULL,
      scopes        TEXT[] NOT NULL DEFAULT ARRAY['read']::text[],
      created_by    VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at    TIMESTAMPTZ
    )`);

    // typing_scores.level column (added after initial schema)
    await pool.query(`ALTER TABLE typing_scores ADD COLUMN IF NOT EXISTS level VARCHAR(10) NOT NULL DEFAULT 'medium'`);

    // ── 41 Ops Center ────────────────────────────────────────────────────────
    await pool.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ops_event_status') THEN
        CREATE TYPE ops_event_status AS ENUM ('SUCCESS', 'ERROR', 'WARNING');
      END IF;
    END $$`);

    await pool.query(`CREATE TABLE IF NOT EXISTS ops_watchers (
      slug        VARCHAR(60) PRIMARY KEY,
      name        VARCHAR(120) NOT NULL,
      description TEXT,
      client      VARCHAR(80),
      folder      TEXT,
      is_active   BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS ops_events (
      id                VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      watcher_slug      VARCHAR(60) NOT NULL REFERENCES ops_watchers(slug),
      filename          VARCHAR(500) NOT NULL,
      filename_renamed  VARCHAR(500),
      status            ops_event_status NOT NULL,
      error_message     TEXT,
      client            VARCHAR(80),
      n8n_execution_id  VARCHAR(120),
      metadata          JSONB DEFAULT '{}',
      processed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ops_events_watcher_slug ON ops_events(watcher_slug)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ops_events_processed_at ON ops_events(processed_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ops_events_status ON ops_events(status)`);

    // Heartbeat + folder columns (added after initial schema)
    await pool.query(`ALTER TABLE ops_watchers ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE ops_watchers ADD COLUMN IF NOT EXISTS folder_output TEXT`);

    // filename_renamed column (added after initial ops_events schema)
    await pool.query(`ALTER TABLE ops_events ADD COLUMN IF NOT EXISTS filename_renamed VARCHAR(500)`);

    // Watcher ↔ Sector M2M visibility table (replaces old user_watcher_clients)
    // DROP old broken table if it exists (had integer user_id but users are VARCHAR UUIDs)
    try { await pool.query(`DROP TABLE IF EXISTS user_watcher_clients`); } catch (_) {}
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ops_watcher_sectors (
        watcher_slug VARCHAR(60) NOT NULL REFERENCES ops_watchers(slug) ON DELETE CASCADE,
        sector_id    VARCHAR(36) NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
        PRIMARY KEY (watcher_slug, sector_id)
      )
    `);

    // Seed watchers (n8n + local)
    await pool.query(`INSERT INTO ops_watchers (slug, name, description, client, folder) VALUES
      ('watcher-bld',           'Watcher BLD',           'Notas fiscais BLD empresa 1',          'BLD',  '\\\\192.168.140.249\\Publico\\DOCS BLD\\NOTAS - BLD'),
      ('watcher-bld-2',         'Watcher BLD 2',         'Notas fiscais BLD empresa 2',          'BLD',  '\\\\192.168.140.249\\Publico\\DOCS BLD\\NOTAS - BLD 2'),
      ('watcher-bpo-contratos', 'Watcher BPO Contratos', 'Contratos de aluguel BPO',             'BPO',  '\\\\192.168.140.249\\Publico\\DOCS BPO\\VALIDADOR CONTRATOS'),
      ('watcher-bpo-recibos',   'Watcher BPO Recibos',   'Contratos e recibos RPA BPO',          'BPO',  '\\\\192.168.140.249\\Publico\\DOCS BPO\\VALIDADOR RECIBOS'),
      ('watcher-bpo-folha',     'Watcher BPO Folha',     'Folhas de pagamento BPO',              'BPO',  '\\\\192.168.140.249\\Publico\\DOCS BPO\\VALIDADOR FOLHA'),
      ('watcher-irriga',        'Watcher Irriga',        'Renomeador de NFs Irriga Four',        'BPO',  '\\\\192.168.140.249\\Publico\\DOCS BPO\\IRRIGA FOUR\\08-RENOMEADOR NOTAS'),
      ('watcher-er-dias',       'Watcher ER Dias',       'Renomeador de NFs Elio Rubens',        'BPO',  '\\\\192.168.140.249\\Publico\\DOCS BPO\\ELIO RUBENS\\08-RENOMEADOR NOTAS'),
      ('watcher-separador',     'Watcher Separador',     'Organiza arquivos em pastas de mês',   'BLD',  '\\\\192.168.140.249\\Publico\\DOCS BLD\\00 OLD\\2025\\0. ORGANIZADOR DE PASTAS')
    ON CONFLICT (slug) DO NOTHING`);

    // Seed folder_output for known local watchers
    await pool.query(`
      UPDATE ops_watchers SET folder_output = '\\\\192.168.140.249\\Publico\\DOCS BPO\\IRRIGA FOUR\\09-DESTINO NOTAS'
      WHERE slug = 'watcher-irriga' AND folder_output IS NULL
    `);
    await pool.query(`
      UPDATE ops_watchers SET folder_output = '\\\\192.168.140.249\\Publico\\DOCS BPO\\ELIO RUBENS\\09-DESTINO NOTAS'
      WHERE slug = 'watcher-er-dias' AND folder_output IS NULL
    `);

    // sector color column
    await pool.query(`ALTER TABLE sectors ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#6366f1'`);

    // platform_feedback table
    await pool.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'feedback_type') THEN
        CREATE TYPE feedback_type AS ENUM ('BUG','SUGESTAO','MELHORIA','OUTRO');
      END IF;
    END $$`);
    await pool.query(`CREATE TABLE IF NOT EXISTS platform_feedback (
      id         VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      type       feedback_type NOT NULL,
      title      VARCHAR(200) NOT NULL,
      message    TEXT NOT NULL,
      is_read    BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    // ticket_reopen_requests table
    await pool.query(`CREATE TABLE IF NOT EXISTS ticket_reopen_requests (
      id            VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id     VARCHAR(36) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      requested_by  VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      reason        TEXT NOT NULL,
      status        VARCHAR(16) NOT NULL DEFAULT 'PENDING',
      decided_by    VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
      decision_note TEXT,
      requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decided_at    TIMESTAMPTZ
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reopen_requests_ticket ON ticket_reopen_requests(ticket_id)`);

    console.info("[startup] Schema bootstrap OK");
  } catch (e: any) {
    console.error("[startup] Schema bootstrap error (non-fatal):", e?.message ?? e);
  }

  // Session secret validation - required in production
  const sessionSecret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && !sessionSecret) {
    throw new Error("SESSION_SECRET environment variable is required in production");
  }

  const PgSession = connectPgSimple(session);

  app.use(
    session({
      name: "hub.sid",
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: new PgSession({ pool, createTableIfMissing: true }),
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    })
  );

  // ==================== AUTH ROUTES ====================

  // Get current user
  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = await storage.getUserWithRoles(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "User not found" });
    }

    res.json(user);
  });

  app.get("/api/auth/login", async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      if (isEntraConfigured()) {
        return res.redirect("/api/auth/entra/login");
      }
      return res.status(501).json({
        error: "Microsoft Entra ID authentication not configured",
        message: "Configure AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID, and AZURE_REDIRECT_URI",
      });
    }

    // Development: auto-login as first admin user
    let adminUser = await storage.getUserByEmail(process.env.ENTRA_ADMIN_EMAIL || "admin@41tech.com.br");

    if (!adminUser) {
      const allUsers = await storage.getAllUsers();
      if (allUsers.length > 0) {
        adminUser = allUsers[0];
      }
    }

    if (!adminUser) {
      return res.status(500).json({ error: "No users available. Run seed script first." });
    }

    req.session.userId = adminUser.id;

    await storage.createAuditLog({
      actorUserId: adminUser.id,
      action: "login",
      ip: req.ip || req.socket.remoteAddress,
    });

    res.redirect("/");
  });

  // Entra ID OAuth2/OIDC login
  app.get("/api/auth/entra/login", async (req, res) => {
    if (!isEntraConfigured()) {
      return res.status(501).json({ error: "Entra ID not configured" });
    }

    try {
      const state = crypto.randomBytes(16).toString("hex");
      req.session.entraState = state;

      const msalClient = getMsalClient();
      const authCodeUrl = await msalClient.getAuthCodeUrl({
        scopes: ["openid", "profile", "email"],
        redirectUri: process.env.AZURE_REDIRECT_URI!,
        state,
        prompt: "select_account",
      });

      // ✅ Garante que o state foi persistido no store (Postgres) antes do redirect
      return req.session.save((err) => {
        if (err) {
          console.error("session save failed:", err);
          return res.status(500).json({ error: "session_save_failed" });
        }
        return res.redirect(authCodeUrl);
      });
    } catch (error) {
      console.error("Entra login error:", error);
      return res.status(500).json({ error: "Failed to initiate Entra ID login" });
    }
  });

  // Entra ID OAuth2 callback
  app.get("/api/auth/entra/callback", async (req, res) => {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).json({ error: "Missing code or state parameter" });
    }

    if (!state || state !== req.session.entraState) {
      // em vez de 400 seco, manda reiniciar login
      return res.redirect("/login?error=entra_state");
    }

    delete req.session.entraState;

    try {
      const msalClient = getMsalClient();
      const tokenResponse = await msalClient.acquireTokenByCode({
        code: code as string,
        scopes: ["openid", "profile", "email"],
        redirectUri: process.env.AZURE_REDIRECT_URI!,
      });

      const claims = tokenResponse.idTokenClaims as Record<string, any>;
      const oid = claims?.oid as string | undefined;
      const email = (claims?.preferred_username || claims?.email) as string | undefined;
      const name = claims?.name as string | undefined;

      let user = null;

      if (oid) {
        user = await storage.getUserByEntraOid(oid);
      }

      if (!user && email) {
        user = await storage.getUserByEmail(email);
      }

      if (user) {
        if (oid && !user.entraOid) {
          await storage.updateUser(user.id, { entraOid: oid } as any);
        }

        req.session.userId = user.id;

        await storage.createAuditLog({
          actorUserId: user.id,
          action: "entra_login_success",
          ip: req.ip || req.socket.remoteAddress,
          metadata: { email, oid, name } as any,
        });

        return res.redirect("/");
      }

      await storage.createAuditLog({
        actorUserId: null as any,
        action: "entra_login_denied",
        metadata: { email, oid, name } as any,
        ip: req.ip || req.socket.remoteAddress,
      });

      return res.status(403).json({
        error: "Usuário não cadastrado. Contate o administrador.",
      });
    } catch (error) {
      console.error("Entra callback error:", error);
      return res.status(500).json({ error: "Authentication failed" });
    }
  });

  // Entra ID logout
  app.get("/api/auth/entra/logout", async (req, res) => {
    const userId = req.session.userId;

    if (userId) {
      await storage.createAuditLog({
        actorUserId: userId,
        action: "logout",
        ip: req.ip || req.socket.remoteAddress,
      });
    }

    req.session.destroy(() => {
      res.clearCookie("connect.sid");

      const tenantId = process.env.AZURE_TENANT_ID;
      const postLogoutUri = process.env.AZURE_POST_LOGOUT_REDIRECT_URI || process.env.AZURE_REDIRECT_URI?.replace("/api/auth/entra/callback", "/");

      if (tenantId && postLogoutUri) {
        const logoutUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(postLogoutUri)}`;
        return res.redirect(logoutUrl);
      }

      res.redirect("/");
    });
  });

  // Logout
  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    const userId = req.session.userId;

    if (userId) {
      await storage.createAuditLog({
        actorUserId: userId,
        action: "logout",
        ip: req.ip || req.socket.remoteAddress,
      });
    }

    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });

  // ==================== LOCAL AUTH ROUTES ====================

  // Local login
  app.post("/api/auth/local/login", async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      
      // Rate limiting
      const now = Date.now();
      const attempts = loginAttempts.get(ip);
      if (attempts) {
        if (now < attempts.resetAt) {
          if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
            return res.status(429).json({ error: "Muitas tentativas de login. Tente novamente em 1 minuto." });
          }
        } else {
          loginAttempts.set(ip, { count: 0, resetAt: now + RATE_LIMIT_WINDOW });
        }
      } else {
        loginAttempts.set(ip, { count: 0, resetAt: now + RATE_LIMIT_WINDOW });
      }

      const loginSchema = z.object({
        email: z.string().email(),
        password: z.string().min(1),
      });

      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Email e senha são obrigatórios" });
      }

      const { email, password } = parsed.data;

      const user = await storage.getUserByEmail(email);

      // Increment attempts
      const currentAttempts = loginAttempts.get(ip)!;
      currentAttempts.count++;

      if (!user) {
        await storage.createAuditLog({
          actorUserId: null,
          action: "local_login_failed",
          metadata: { email, reason: "user_not_found" },
          ip,
        });
        return res.status(401).json({ error: "Email ou senha incorretos" });
      }

      if (user.authProvider !== "local") {
        await storage.createAuditLog({
          actorUserId: user.id,
          action: "local_login_failed",
          metadata: { reason: "wrong_auth_provider" },
          ip,
        });
        return res.status(401).json({ error: "Use o login Microsoft para esta conta" });
      }

      if (!user.isActive) {
        await storage.createAuditLog({
          actorUserId: user.id,
          action: "local_login_failed",
          metadata: { reason: "account_inactive" },
          ip,
        });
        return res.status(401).json({ error: "Conta desativada. Contate o administrador." });
      }

      if (!user.passwordHash) {
        await storage.createAuditLog({
          actorUserId: user.id,
          action: "local_login_failed",
          metadata: { reason: "no_password_set" },
          ip,
        });
        return res.status(401).json({ error: "Senha não configurada. Contate o administrador." });
      }

      const passwordMatch = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatch) {
        await storage.createAuditLog({
          actorUserId: user.id,
          action: "local_login_failed",
          metadata: { reason: "wrong_password" },
          ip,
        });
        return res.status(401).json({ error: "Email ou senha incorretos" });
      }

      // Success - reset rate limit
      loginAttempts.delete(ip);

      req.session.userId = user.id;

      await storage.createAuditLog({
        actorUserId: user.id,
        action: "local_login_success",
        ip,
      });

      const userWithRoles = await storage.getUserWithRoles(user.id);
      res.json(userWithRoles);
    } catch (error) {
      console.error("Local login error:", error);
      res.status(500).json({ error: "Erro interno ao fazer login" });
    }
  });

  // Change password (for local users)
  app.post("/api/auth/local/change-password", requireAuth, async (req, res) => {
    try {
      if (req.user!.authProvider !== "local") {
        return res.status(400).json({ error: "Apenas usuários locais podem alterar senha por aqui" });
      }

      const changePasswordSchema = z.object({
        currentPassword: z.string().optional(),
        newPassword: passwordSchema,
      });

      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.errors });
      }

      const { currentPassword, newPassword } = parsed.data;
      const user = await storage.getUser(req.user!.id);

      if (!user || !user.passwordHash) {
        return res.status(400).json({ error: "Usuário não encontrado ou senha não configurada" });
      }

      // If not forced to change password, require current password
      if (!user.mustChangePassword) {
        if (!currentPassword) {
          return res.status(400).json({ error: "Senha atual é obrigatória" });
        }
        const currentMatch = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!currentMatch) {
          return res.status(401).json({ error: "Senha atual incorreta" });
        }
      }

      const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

      await storage.updateUser(user.id, {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
        passwordUpdatedAt: new Date(),
      } as any);

      await storage.createAuditLog({
        actorUserId: user.id,
        action: "local_password_changed",
        targetType: "user",
        targetId: user.id,
        ip: req.ip || req.socket.remoteAddress,
      });

      const userWithRoles = await storage.getUserWithRoles(user.id);
      res.json(userWithRoles);
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ error: "Erro ao alterar senha" });
    }
  });

  // ==================== USER ROUTES ====================

  // Update current user preferences (theme, whatsapp)
  app.patch("/api/users/me", requireAuth, async (req, res) => {
    try {
      const updateMeSchema = z.object({
        themePref: z.enum(["light", "dark"]).optional(),
        whatsapp: z.string().min(8).max(20).nullable().optional(),
        tutorialCompleted: z.boolean().optional(),
      });

      const parsed = updateMeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.errors });
      }

      const updates: Record<string, any> = {};
      if (parsed.data.themePref !== undefined) {
        updates.themePref = parsed.data.themePref;
      }
      if (parsed.data.whatsapp !== undefined) {
        updates.whatsapp = parsed.data.whatsapp;
      }
      if (parsed.data.tutorialCompleted !== undefined) {
        updates.tutorialCompleted = parsed.data.tutorialCompleted;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      await storage.updateUser(req.user!.id, updates);

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "user_update_profile",
        targetType: "user",
        targetId: req.user!.id,
        metadata: updates,
        ip: req.ip || req.socket.remoteAddress,
      });

      const userWithRoles = await storage.getUserWithRoles(req.user!.id);
      res.json(userWithRoles);
    } catch (error) {
      console.error("Error updating user preferences:", error);
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });

  // Upload user photo
  app.post("/api/users/me/photo", requireAuth, upload.single("photo"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No photo uploaded" });
      }

      const photoUrl = `/api/uploads/${req.file.filename}`;
      await storage.updateUser(req.user!.id, { photoUrl });

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "user_upload_photo",
        targetType: "user",
        targetId: req.user!.id,
        metadata: { photoUrl },
        ip: req.ip || req.socket.remoteAddress,
      });

      const userWithRoles = await storage.getUserWithRoles(req.user!.id);
      res.json({ photoUrl, user: userWithRoles });
    } catch (error) {
      console.error("Error uploading photo:", error);
      res.status(500).json({ error: "Failed to upload photo" });
    }
  });

  // Get team members (same sector)
  app.get("/api/users/team", requireAuth, async (req, res) => {
    try {
      const team = await storage.getTeamMembers(req.user!.id);
      res.json(team);
    } catch (error) {
      console.error("Error fetching team:", error);
      res.status(500).json({ error: "Failed to fetch team" });
    }
  });

  // Get directory of users (with filtering)
  app.get("/api/users/directory", requireAuth, async (req, res) => {
    try {
      const sectorId = req.query.sectorId as string | undefined;
      const query = req.query.q as string | undefined;
      const showAll = req.query.all === "true";

      const directory = await storage.getDirectory({
        userId: req.user!.id,
        sectorId,
        query,
        showAll,
      });

      res.json(directory);
    } catch (error) {
      console.error("Error fetching directory:", error);
      res.status(500).json({ error: "Failed to fetch directory" });
    }
  });

  // Serve uploaded files (authenticated)
  app.get("/api/uploads/:filename", async (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(process.env.UPLOAD_DIR ?? "/app/uploads", filename)

    try {
      await fs.promises.access(filePath);
      return res.sendFile(filePath);
    } catch {
      return res.redirect("/stdProfile.png")
    }
  });

  // ==================== RESOURCE ROUTES ====================

  // Get all resources for current user
  app.get("/api/resources", requireAuth, async (req, res) => {
    try {
      const resources = await storage.getResourcesForUser(req.user!.id);
      res.json(resources);
    } catch (error) {
      console.error("Error fetching resources:", error);
      res.status(500).json({ error: "Failed to fetch resources" });
    }
  });

  // Get recent access
  app.get("/api/resources/recent", requireAuth, async (req, res) => {
    try {
      const recent = await storage.getRecentAccess(req.user!.id, 5);
      res.json(recent);
    } catch (error) {
      console.error("Error fetching recent access:", error);
      res.status(500).json({ error: "Failed to fetch recent access" });
    }
  });

  // Get single resource
  app.get("/api/resources/:id", requireAuth, async (req, res) => {
    try {
      const resource = await storage.getResourceWithHealth(req.params.id, req.user!.id);
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }
      res.json(resource);
    } catch (error) {
      console.error("Error fetching resource:", error);
      res.status(500).json({ error: "Failed to fetch resource" });
    }
  });

  // Record resource access
  app.post("/api/resources/:id/access", requireAuth, async (req, res) => {
    try {
      await storage.recordAccess(req.user!.id, req.params.id);
      
      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "resource_access",
        targetType: "resource",
        targetId: req.params.id,
        ip: req.ip || req.socket.remoteAddress,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error recording access:", error);
      res.status(500).json({ error: "Failed to record access" });
    }
  });

  // Proxy route for iframe resources (placeholder for production reverse proxy)
  app.get("/api/proxy/:id", requireAuth, async (req, res) => {
    try {
      const resource = await storage.getResource(req.params.id);
      if (!resource || !resource.url) {
        return res.status(404).json({ error: "Resource not found" });
      }

      // In production, this would proxy to the internal resource
      // For now, redirect to the URL (won't work for most internal apps)
      res.redirect(resource.url);
    } catch (error) {
      console.error("Error proxying resource:", error);
      res.status(500).json({ error: "Failed to proxy resource" });
    }
  });

  // ==================== FAVORITES ROUTES ====================

  // Get user's favorites
  app.get("/api/favorites", requireAuth, async (req, res) => {
    try {
      const favorites = await storage.getUserFavorites(req.user!.id);
      res.json(favorites);
    } catch (error) {
      console.error("Error fetching favorites:", error);
      res.status(500).json({ error: "Failed to fetch favorites" });
    }
  });

  // Add favorite
  app.post("/api/favorites/:resourceId", requireAuth, async (req, res) => {
    try {
      const favorite = await storage.addFavorite({
        userId: req.user!.id,
        resourceId: req.params.resourceId,
      });

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "favorite_add",
        targetType: "resource",
        targetId: req.params.resourceId,
        ip: req.ip || req.socket.remoteAddress,
      });

      res.json(favorite);
    } catch (error) {
      console.error("Error adding favorite:", error);
      res.status(500).json({ error: "Failed to add favorite" });
    }
  });

  // Remove favorite
  app.delete("/api/favorites/:resourceId", requireAuth, async (req, res) => {
    try {
      await storage.removeFavorite(req.user!.id, req.params.resourceId);

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "favorite_remove",
        targetType: "resource",
        targetId: req.params.resourceId,
        ip: req.ip || req.socket.remoteAddress,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error removing favorite:", error);
      res.status(500).json({ error: "Failed to remove favorite" });
    }
  });

  // ==================== ADMIN ROUTES ====================

  // --- Settings ---
  app.get("/api/admin/settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const allSettings = await storage.getAllSettings();
      const settingsMap: Record<string, string> = {};
      for (const s of allSettings) {
        settingsMap[s.key] = s.value;
      }
      // Provide default if not set
      if (!settingsMap[DEFAULT_PASSWORD_SETTING_KEY]) {
        settingsMap[DEFAULT_PASSWORD_SETTING_KEY] = DEFAULT_PASSWORD;
      }
      res.json(settingsMap);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/admin/settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const settingsSchema = z.object({
        DEFAULT_LOCAL_PASSWORD: z.string().min(1).optional(),
      });

      const parsed = settingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.errors });
      }

      if (parsed.data.DEFAULT_LOCAL_PASSWORD) {
        await storage.setSetting(DEFAULT_PASSWORD_SETTING_KEY, parsed.data.DEFAULT_LOCAL_PASSWORD);
      }

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "settings_update",
        metadata: { keys: Object.keys(parsed.data) },
        ip: req.ip || req.socket.remoteAddress,
      });

      // Return updated settings
      const allSettings = await storage.getAllSettings();
      const settingsMap: Record<string, string> = {};
      for (const s of allSettings) {
        settingsMap[s.key] = s.value;
      }
      res.json(settingsMap);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // Admin stats
  app.get("/api/admin/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching admin stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // --- Sectors (public — scoped by role) ---
  app.get("/api/sectors", requireAuth, async (req, res) => {
    try {
      const allSectors = await storage.getAllSectors();
      if (req.user!.isAdmin) return res.json(allSectors);
      // Non-admin: only sectors the user belongs to
      const userSectorIds = new Set(
        (req.user!.roles ?? []).map((r: any) => r.sectorId).filter(Boolean)
      );
      return res.json(allSectors.filter((s: any) => userSectorIds.has(s.id)));
    } catch (error) {
      console.error("Error fetching sectors:", error);
      res.status(500).json({ error: "Failed to fetch sectors" });
    }
  });

  // --- Sectors (admin full CRUD) ---
  app.get("/api/admin/sectors", requireAuth, requireAdmin, async (req, res) => {
    try {
      const sectors = await storage.getAllSectors();
      res.json(sectors);
    } catch (error) {
      console.error("Error fetching sectors:", error);
      res.status(500).json({ error: "Failed to fetch sectors" });
    }
  });

  app.post("/api/admin/sectors", requireAuth, requireAdmin, async (req, res) => {
    try {
      const parsed = createSectorSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.errors });
      }

      const sector = await storage.createSector(parsed.data);

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "sector_create",
        targetType: "sector",
        targetId: sector.id,
        metadata: { name: sector.name },
        ip: req.ip || req.socket.remoteAddress,
      });

      res.json(sector);
    } catch (error) {
      console.error("Error creating sector:", error);
      res.status(500).json({ error: "Failed to create sector" });
    }
  });

  app.patch("/api/admin/sectors/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const parsed = updateSectorSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.errors });
      }

      const sector = await storage.updateSector(req.params.id, parsed.data);

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "sector_update",
        targetType: "sector",
        targetId: req.params.id,
        metadata: parsed.data,
        ip: req.ip || req.socket.remoteAddress,
      });

      res.json(sector);
    } catch (error) {
      console.error("Error updating sector:", error);
      res.status(500).json({ error: "Failed to update sector" });
    }
  });

  app.delete("/api/admin/sectors/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.deleteSector(req.params.id);

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "sector_delete",
        targetType: "sector",
        targetId: req.params.id,
        ip: req.ip || req.socket.remoteAddress,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting sector:", error);
      res.status(500).json({ error: "Failed to delete sector" });
    }
  });

  // --- Users ---
  app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsersWithRoles();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.errors });
      }

      const { email, name, sectorId, sectorIds, roleName, authProvider } = parsed.data;

      // For local users, set password hash from default password
      let passwordHash: string | undefined;
      let mustChangePassword = false;

      if (authProvider === "local") {
        const defaultPwdSetting = await storage.getSetting(DEFAULT_PASSWORD_SETTING_KEY);
        const defaultPassword = defaultPwdSetting?.value || DEFAULT_PASSWORD;
        passwordHash = await bcrypt.hash(defaultPassword, SALT_ROUNDS);
        mustChangePassword = true;
      }

      // Create user
      const user = await storage.createUser({ 
        email, 
        name, 
        authProvider: authProvider || "entra",
        passwordHash,
        mustChangePassword,
      } as any);

      // Handle sectorIds array (multi-sector support) or fallback to single sectorId
      const sectorsToAssign = sectorIds && sectorIds.length > 0 
        ? sectorIds 
        : (sectorId ? [sectorId] : []);

      if (sectorsToAssign.length > 0 && roleName) {
        const role = await storage.getRoleByName(roleName);
        if (role) {
          for (const sid of sectorsToAssign) {
            await storage.addUserSectorRole({
              userId: user.id,
              sectorId: sid,
              roleId: role.id,
            });
          }
        }
      }

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "user_create",
        targetType: "user",
        targetId: user.id,
        metadata: { email, name, sectorIds: sectorsToAssign },
        ip: req.ip || req.socket.remoteAddress,
      });

      const userWithRoles = await storage.getUserWithRoles(user.id);
      res.json(userWithRoles);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.patch("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.errors });
      }

      const { sectorIds, roleName, ...userUpdates } = parsed.data;
      const userId = req.params.id as string;

      // Prevent admin from deactivating their own account
      if (userUpdates.isActive === false && userId === req.user!.id) {
        return res.status(400).json({ error: "Você não pode desativar sua própria conta" });
      }

      // Update basic user info if provided
      if (Object.keys(userUpdates).length > 0) {
        await storage.updateUser(userId, userUpdates);
      }

      // Handle sector reassignment if sectorIds provided (even empty array to clear all)
      if (sectorIds !== undefined) {
        // Remove existing sector-role assignments
        const existingRoles = await storage.getUserSectorRoles(userId);
        for (const existing of existingRoles) {
          await storage.removeUserSectorRole(userId, existing.sectorId);
        }

        // Add new sector-role assignments if any sectors selected
        if (sectorIds.length > 0 && roleName) {
          const role = await storage.getRoleByName(roleName);
          if (role) {
            for (const sectorId of sectorIds) {
              await storage.addUserSectorRole({
                userId,
                sectorId,
                roleId: role.id,
              });
            }
          }
        }
      }

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "user_update",
        targetType: "user",
        targetId: userId,
        metadata: parsed.data,
        ip: req.ip || req.socket.remoteAddress,
      });

      const userWithRoles = await storage.getUserWithRoles(userId);
      res.json(userWithRoles);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Reset password (for local users only)
  app.post("/api/admin/users/:id/reset-password", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      if (user.authProvider !== "local") {
        return res.status(400).json({ error: "Apenas usuários locais podem ter senha resetada" });
      }

      const defaultPwdSetting = await storage.getSetting(DEFAULT_PASSWORD_SETTING_KEY);
      const defaultPassword = defaultPwdSetting?.value || DEFAULT_PASSWORD;
      const passwordHash = await bcrypt.hash(defaultPassword, SALT_ROUNDS);

      await storage.updateUser(userId, {
        passwordHash,
        mustChangePassword: true,
        passwordUpdatedAt: null,
      } as any);

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "user_password_reset",
        targetType: "user",
        targetId: userId,
        ip: req.ip || req.socket.remoteAddress,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ error: "Falha ao resetar senha" });
    }
  });

  // Set password (admin can set password for local users)
  app.post("/api/admin/users/:id/set-password", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      if (user.authProvider !== "local") {
        return res.status(400).json({ error: "Apenas usuários locais podem ter senha definida" });
      }

      const setPasswordSchema = z.object({
        newPassword: passwordSchema,
      });

      const parsed = setPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Senha inválida", details: parsed.error.errors });
      }

      const passwordHash = await bcrypt.hash(parsed.data.newPassword, SALT_ROUNDS);

      await storage.updateUser(userId, {
        passwordHash,
        mustChangePassword: false,
        passwordUpdatedAt: new Date(),
      } as any);

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "user_password_set",
        targetType: "user",
        targetId: userId,
        ip: req.ip || req.socket.remoteAddress,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error setting password:", error);
      res.status(500).json({ error: "Falha ao definir senha" });
    }
  });

  app.delete("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = req.params.id;

      if (userId === req.user!.id) {
        return res.status(400).json({ error: "Você não pode excluir sua própria conta" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      if (user.isActive) {
        return res.status(400).json({ error: "Apenas usuários inativos podem ser excluídos definitivamente" });
      }

      await pool.query("DELETE FROM users WHERE id = $1", [userId]);

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "user_deleted",
        targetType: "user",
        targetId: userId,
        ip: req.ip || req.socket.remoteAddress,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Falha ao excluir usuário" });
    }
  });

  // --- Resources ---
  app.get("/api/admin/resources", requireAuth, requireAdmin, async (req, res) => {
    try {
      const resources = await storage.getAllResources();
      res.json(resources);
    } catch (error) {
      console.error("Error fetching resources:", error);
      res.status(500).json({ error: "Failed to fetch resources" });
    }
  });

  app.post("/api/admin/resources", requireAuth, requireAdmin, async (req, res) => {
    try {
      const parsed = createResourceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.errors });
      }

      const resource = await storage.createResource(parsed.data as any);

      // Initialize health check as UP
      await storage.upsertHealthCheck(resource.id, "UP");

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "resource_create",
        targetType: "resource",
        targetId: resource.id,
        metadata: { name: resource.name, type: resource.type },
        ip: req.ip || req.socket.remoteAddress,
      });

      res.json(resource);
    } catch (error) {
      console.error("Error creating resource:", error);
      res.status(500).json({ error: "Failed to create resource" });
    }
  });

  app.patch("/api/admin/resources/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const parsed = updateResourceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.errors });
      }

      const resource = await storage.updateResource(req.params.id, parsed.data as any);

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "resource_update",
        targetType: "resource",
        targetId: req.params.id,
        metadata: parsed.data,
        ip: req.ip || req.socket.remoteAddress,
      });

      res.json(resource);
    } catch (error) {
      console.error("Error updating resource:", error);
      res.status(500).json({ error: "Failed to update resource" });
    }
  });

  app.delete("/api/admin/resources/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.deleteResource(req.params.id);

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "resource_delete",
        targetType: "resource",
        targetId: req.params.id,
        ip: req.ip || req.socket.remoteAddress,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting resource:", error);
      res.status(500).json({ error: "Failed to delete resource" });
    }
  });

  // --- Audit Logs ---
  app.get("/api/admin/audit", requireAuth, requireAdmin, async (req, res) => {
    try {
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const action = req.query.action as string | undefined;
      const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
      const limit = Math.min(500, Math.max(10, parseInt(req.query.limit as string || "200", 10)));
      const offset = (page - 1) * limit;

      const params: any[] = [];
      let where = "WHERE 1=1";
      if (from) { params.push(from); where += ` AND al.created_at >= $${params.length}::date`; }
      if (to) { params.push(to); where += ` AND al.created_at <= ($${params.length}::date + interval '1 day')`; }
      if (action) { params.push(action); where += ` AND al.action = $${params.length}`; }

      params.push(limit); params.push(offset);
      const result = await pool.query(
        `SELECT al.id, al.action, al.target_type as "targetType", al.target_id as "targetId",
                al.ip, al.metadata, al.created_at as "createdAt",
                u.name as "actorName", u.email as "actorEmail"
         FROM audit_logs al
         LEFT JOIN users u ON al.actor_user_id = u.id
         ${where}
         ORDER BY al.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  // ==================== TICKET ROUTES ====================

  app.get("/api/tickets/categories", requireAuth, requireTicketAccess, async (req, res) => {
    try {
      const categories = await storage.listTicketCategoriesActive();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  app.get("/api/tickets", requireAuth, requireTicketAccess, async (req, res) => {
    try {
      const filters = {
        status: req.query.status as string | undefined,
        q: req.query.q as string | undefined,
        includeClosed: req.query.includeClosed === "true",
        assignedToMe: req.query.assignedToMe === "true",
        pendingReopen: req.query.pendingReopen === "true",
      };
      const ticketList = await storage.listTicketsForUser(req.user!, filters);
      res.json(ticketList);
    } catch (error) {
      console.error("Error listing tickets:", error);
      res.status(500).json({ error: "Failed to list tickets" });
    }
  });

  app.post("/api/tickets", requireAuth, requireAdminOrCoordinator, async (req, res) => {
    try {
      const createTicketSchema = z.object({
        title: z.string().min(1).max(255),
        description: z.string().min(1),
        requesterSectorId: z.string().min(1),
        categoryId: z.string().min(1),
        priority: z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"]).optional(),
        relatedResourceId: z.string().optional(),
        tags: z.array(z.string()).optional(),
        requestData: z.record(z.any()).optional(),
      });

      const parsed = createTicketSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
      }

      if (!req.user!.isAdmin) {
        const coordSectorIds = req.user!.roles
          .filter(r => r.roleName === "Coordenador")
          .map(r => r.sectorId);
        if (!coordSectorIds.includes(parsed.data.requesterSectorId)) {
          return res.status(403).json({ error: "Coordenador só pode criar chamados para setores que coordena" });
        }
      }

      const allCats = await storage.listAllTicketCategories();
      const category = allCats.find(c => c.id === parsed.data.categoryId);
      if (!category) {
        return res.status(400).json({ error: "Categoria não encontrada" });
      }

      if (category.formSchema && Array.isArray(category.formSchema) && category.formSchema.length > 0) {
        const reqData = parsed.data.requestData || {};
        const issues: Array<{ key: string; message: string }> = [];
        for (const field of category.formSchema) {
          const val = reqData[field.key];
          const strVal = typeof val === "string" ? val.trim() : "";

          if (field.required) {
            if (val === undefined || val === null || (typeof val === "string" && !strVal)) {
              issues.push({ key: field.key, message: `${field.label} é obrigatório` });
              continue;
            }
          }

          if (val !== undefined && val !== null && strVal) {
            if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strVal)) {
              issues.push({ key: field.key, message: `${field.label} deve ser um email válido` });
            }
            if (field.rules) {
              const r = field.rules;
              if (r.regex) {
                try { if (!new RegExp(r.regex).test(strVal)) issues.push({ key: field.key, message: `${field.label} não corresponde ao padrão esperado` }); } catch {}
              }
              if (r.minLen !== undefined && strVal.length < r.minLen) {
                issues.push({ key: field.key, message: `${field.label} deve ter pelo menos ${r.minLen} caracteres` });
              }
              if (r.maxLen !== undefined && strVal.length > r.maxLen) {
                issues.push({ key: field.key, message: `${field.label} deve ter no máximo ${r.maxLen} caracteres` });
              }
              if (field.type === "number") {
                const numVal = Number(val);
                if (r.min !== undefined && numVal < r.min) {
                  issues.push({ key: field.key, message: `${field.label} deve ser no mínimo ${r.min}` });
                }
                if (r.max !== undefined && numVal > r.max) {
                  issues.push({ key: field.key, message: `${field.label} deve ser no máximo ${r.max}` });
                }
              }
            }
          }
        }
        if (issues.length > 0) {
          return res.status(400).json({ error: "Validação falhou", issues });
        }
      }

      let description = parsed.data.description;
      if (category.descriptionTemplate) {
        const template = category.descriptionTemplate;
        const mode = category.templateApplyMode || "replace_if_empty";
        const rd = parsed.data.requestData || {};
        const applied = template.replace(/\{\{(\w+)\}\}/g, (_, key) => rd[key] ?? "");
        if (mode === "always_replace") {
          description = applied;
        } else if (mode === "append") {
          description = description + "\n\n" + applied;
        } else if (mode === "replace_if_empty" && !parsed.data.description.trim()) {
          description = applied;
        }
      }

      const ticket = await storage.createTicket({
        ...parsed.data,
        description,
        requestData: parsed.data.requestData || {},
      }, req.user!);

      const baseUrl = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");

      const actor = {
        id: req.user!.id,
        name: req.user!.name,
        email: req.user!.email,
      };

      try {
        const enabled = await storage.isNotificationEnabled("ticket_created");
        if (enabled) {
          const allAdmins = await storage.getAdminUserIds();
          const recipients = allAdmins.filter(id => id !== req.user!.id);
          if (recipients.length > 0) {
            await storage.createNotifications(recipients, {
              type: "ticket_created",
              title: "Novo chamado criado",
              message: `${req.user!.name} criou o chamado: ${parsed.data.title}`,
              linkUrl: `/tickets/${ticket.id}`,
            });
          }
        }
      } catch (notifErr) {
        console.error("Error dispatching ticket_created notification:", notifErr);
      }

      setImmediate(async () => {
        try {
          const full = await storage.getTicketDetail(ticket.id, req.user!).catch(() => null);

          const data = full
            ? {
                ticketId: full.id,
                title: full.title,
                status: full.status,
                priority: full.priority,
                createdAt: full.createdAt,
                linkUrl: baseUrl ? `${baseUrl}/tickets/${full.id}` : `/tickets/${full.id}`,

                requesterSector: {
                  id: full.requesterSectorId,
                  name: full.requesterSectorName,
                },
                targetSector: {
                  id: full.targetSectorId,
                  name: full.targetSectorName,
                },
                category: {
                  id: full.categoryId,
                  name: full.categoryName,
                  branch: full.categoryBranch,
                },
                requester: {
                  id: full.createdBy,
                  name: full.creatorName,
                  email: full.creatorEmail,
                },
                assignees: (full.assignees ?? []).map((a: any) => ({
                  id: a.id,
                  name: a.name,
                  email: a.email,
                })),

                sla: full.currentCycle
                  ? {
                      firstResponseDueAt: full.currentCycle.firstResponseDueAt,
                      resolutionDueAt: full.currentCycle.resolutionDueAt,
                    }
                  : null,
              }
            : {
                // fallback: não quebra a criação do chamado
                ticketId: ticket.id,
                title: parsed.data.title,
                status: ticket.status,
                priority: ticket.priority,
                createdAt: ticket.createdAt,
                linkUrl: baseUrl ? `${baseUrl}/tickets/${ticket.id}` : `/tickets/${ticket.id}`,
                requester: actor,
                requesterSector: { id: parsed.data.requesterSectorId, name: null },
                category: { id: parsed.data.categoryId, name: null, branch: null },
                sla: null,
              };
          await emitEvent("ticket_created", data);
        } catch (err) {
          console.error("ticket_created webhook failed:", err);
        }
      });
      
      return res.status(201).json(ticket);
    } catch (error: any) {
      console.error("Error creating ticket:", error);
      return res.status(500).json({ error: error.message || "Failed to create ticket" });
    }
  });

  app.get("/api/tickets/:id", requireAuth, requireTicketAccess, async (req, res) => {
    try {
      const ticket = await storage.getTicketDetail(req.params.id, req.user!);
      if (!ticket) return res.status(404).json({ error: "Chamado não encontrado" });
      res.json(ticket);
    } catch (error) {
      console.error("Error fetching ticket:", error);
      res.status(500).json({ error: "Failed to fetch ticket" });
    }
  });

  app.patch("/api/tickets/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const patchSchema = z.object({
        status: z.enum(["ABERTO", "NA_FILA", "EM_ANDAMENTO", "AGUARDANDO_USUARIO", "AGUARDANDO_APROVACAO", "AGUARDANDO_REQUERENTE", "STANDBY", "RESOLVIDO", "CANCELADO"]).optional(),
        priority: z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"]).optional(),
        categoryId: z.string().optional(),
        relatedResourceId: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().min(1).optional(),
        resolutionDueAtManual: z.string().optional(),
        resolutionDueAtManualReason: z.string().optional(),
        queueOrder: z.number().int().positive().nullable().optional(),
        // Optional note tied to a status change (GLPI-style "solution"/conclusion)
        conclusionMessage: z.string().max(2000).optional(),
      });

      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
      }

      const { resolutionDueAtManual, resolutionDueAtManualReason, conclusionMessage, ...ticketPatch } = parsed.data;

      // A ticket cannot be resolved without a responsible assignee.
      if (ticketPatch.status === "RESOLVIDO") {
        const assigneeIds = await storage.getTicketAssigneeIds(req.params.id);
        if (assigneeIds.length === 0) {
          return res.status(400).json({ error: "Atribua um responsável antes de concluir o chamado" });
        }
      }

      if (resolutionDueAtManual) {
        // Fetch old deadline for the event record
        const ticketBefore = await storage.getTicketDetail(req.params.id, req.user!);
        const oldDeadline = ticketBefore?.currentCycle?.resolutionDueAt ?? null;
        await storage.updateSlaCycleDeadline(req.params.id, {
          resolutionDueAt: new Date(resolutionDueAtManual),
          reason: resolutionDueAtManualReason,
          updatedBy: req.user!.id,
        });
        // Record a sla_deadline_changed event visible in the timeline
        await pool.query(
          `INSERT INTO ticket_events (id, ticket_id, actor_user_id, type, data, created_at)
           VALUES (gen_random_uuid(), $1, $2, 'sla_deadline_changed', $3, NOW())`,
          [
            req.params.id,
            req.user!.id,
            JSON.stringify({
              field: "resolutionDueAt",
              from: oldDeadline ? new Date(oldDeadline).toISOString() : null,
              to: new Date(resolutionDueAtManual).toISOString(),
              note: resolutionDueAtManualReason || null,
            }),
          ]
        );
      }

      const updated = await storage.adminUpdateTicket(req.params.id, ticketPatch, req.user!);
      if (!updated) return res.status(404).json({ error: "Chamado não encontrado" });

      // NOTE: the status_changed timeline event is recorded inside
      // storage.adminUpdateTicket (single source of truth). Do not insert it
      // here as well, or the activity feed shows the change twice.

      // Optional conclusion/solution note tied to the status change. Posted as a
      // public comment so it appears in the activity timeline (GLPI-style).
      if (ticketPatch.status && conclusionMessage?.trim()) {
        const prefix: Record<string, string> = {
          RESOLVIDO: "✅ Conclusão",
          CANCELADO: "🚫 Cancelamento",
          STANDBY: "⏸️ Pausa",
        };
        const label = prefix[ticketPatch.status] ?? "📝 Observação";
        await pool.query(
          `INSERT INTO ticket_comments (id, ticket_id, author_id, body, is_internal, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, false, NOW())`,
          [req.params.id, req.user!.id, `${label}: ${conclusionMessage.trim()}`]
        );
      }

      if (ticketPatch.status) {
        try {
          const enabled = await storage.isNotificationEnabled("ticket_status");
          if (enabled) {
            const statusLabels: Record<string, string> = {
              ABERTO: "Aberto", NA_FILA: "Na fila", EM_ANDAMENTO: "Em andamento",
              AGUARDANDO_USUARIO: "Aguardando usuário", AGUARDANDO_APROVACAO: "Aguardando aprovação",
              AGUARDANDO_REQUERENTE: "Aguardando usuário", STANDBY: "Em pausa",
              RESOLVIDO: "Resolvido", CANCELADO: "Cancelado"
            };
            const assignees = await storage.getTicketAssigneeIds(req.params.id);
            const recipients = [updated.createdBy, ...assignees].filter(
              (id, i, arr) => id !== req.user!.id && arr.indexOf(id) === i
            );
            if (recipients.length > 0) {
              await storage.createNotifications(recipients, {
                type: "ticket_status",
                title: "Status do chamado alterado",
                message: `Chamado "${updated.title}" alterado para: ${statusLabels[ticketPatch.status] || ticketPatch.status}`,
                linkUrl: `/tickets/${updated.id}`,
              });
            }
          }
        } catch (notifErr) {
          console.error("Error dispatching ticket_status notification:", notifErr);
        }
      }

      if (ticketPatch.status) {
        emitEvent("ticket_status_changed", {
          ticketId: updated.id,
          title: updated.title,
          oldStatus: req.body._oldStatus,
          newStatus: ticketPatch.status,
          actorUserId: req.user!.id,
        });
        if (ticketPatch.status === "RESOLVIDO") {
          emitEvent("ticket_resolved", {
            ticketId: updated.id,
            title: updated.title,
            actorUserId: req.user!.id,
          });
        }
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Error updating ticket:", error);
      if (error.message === "APPROVAL_REQUIRED") {
        return res.status(409).json({ error: "Este chamado requer aprovação antes de mudar de status" });
      }
      res.status(500).json({ error: error.message || "Failed to update ticket" });
    }
  });

  app.put("/api/tickets/:id/assignees", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({ assigneeIds: z.array(z.string()) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos" });
      }

      const ticket = await storage.getTicketDetail(req.params.id, req.user!);
      if (!ticket) return res.status(404).json({ error: "Chamado não encontrado" });

      const adminUsers = await storage.getAdminUserIds();
      for (const aid of parsed.data.assigneeIds) {
        if (!adminUsers.includes(aid)) {
          return res.status(400).json({ error: `Responsável ${aid} deve ser um administrador` });
        }
      }

      await storage.adminSetAssignees(req.params.id, parsed.data.assigneeIds, req.user!);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error setting assignees:", error);
      res.status(500).json({ error: error.message || "Failed to set assignees" });
    }
  });

  app.get("/api/tickets/:id/comments", requireAuth, requireTicketAccess, async (req, res) => {
    try {
      const ticket = await storage.getTicketDetail(req.params.id, req.user!);
      if (!ticket) return res.status(404).json({ error: "Chamado não encontrado" });
      const comments = await storage.listTicketComments(req.params.id, req.user!);
      res.json(comments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  app.get("/api/tickets/:id/events", requireAuth, requireTicketAccess, async (req, res) => {
    try {
      const ticketId = req.params.id as string;
      const ticket = await storage.getTicketDetail(ticketId, req.user!);
      if (!ticket) return res.status(404).json({ error: "Chamado não encontrado" });
      const events = await storage.listTicketEvents(ticketId);
      const filtered = events.filter(e =>
        e.type === "sla_deadline_changed" || e.type === "status_changed"
      );
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching ticket events:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.post("/api/tickets/:id/comments", requireAuth, requireTicketAccess, async (req, res) => {
    try {
      const isUser = !req.user!.isAdmin && !req.user!.roles?.some(r => r.roleName === "Coordenador");
      if (isUser) {
        return res.status(403).json({ error: "Usuários não podem comentar em chamados" });
      }

      const ticket = await storage.getTicketDetail(req.params.id, req.user!);
      if (!ticket) return res.status(404).json({ error: "Chamado não encontrado" });

      const commentSchema = z.object({
        body: z.string().min(1),
        isInternal: z.boolean().optional(),
      });
      const parsed = commentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos" });
      }

      const comment = await storage.addTicketComment(req.params.id, req.user!, parsed.data);

      try {
        const enabled = await storage.isNotificationEnabled("ticket_comment");
        if (enabled && !parsed.data.isInternal) {
          const assignees = await storage.getTicketAssigneeIds(req.params.id);
          const recipients = [ticket.createdBy, ...assignees].filter(
            (id, i, arr) => id !== req.user!.id && arr.indexOf(id) === i
          );
          if (recipients.length > 0) {
            await storage.createNotifications(recipients, {
              type: "ticket_comment",
              title: "Novo comentário no chamado",
              message: `${req.user!.name} comentou no chamado "${ticket.title}"`,
              linkUrl: `/tickets/${ticket.id}`,
            });
          }
        }
      } catch (notifErr) {
        console.error("Error dispatching ticket_comment notification:", notifErr);
      }

      if (!parsed.data.isInternal) {
        emitEvent("ticket_commented", {
          ticketId: ticket.id,
          title: ticket.title,
          commentId: comment.id,
          actorUserId: req.user!.id,
        });
      }

      res.status(201).json(comment);
    } catch (error: any) {
      console.error("Error adding comment:", error);
      res.status(400).json({ error: error.message || "Failed to add comment" });
    }
  });

  app.get("/api/tickets/:id/attachments", requireAuth, requireTicketAccess, async (req, res) => {
    try {
      const ticket = await storage.getTicketDetail(req.params.id, req.user!);
      if (!ticket) return res.status(404).json({ error: "Chamado não encontrado" });
      const result = await pool.query(
        `SELECT
           ta.id,
           ta.ticket_id       AS "ticketId",
           ta.uploaded_by     AS "uploadedBy",
           ta.original_name   AS "originalName",
           ta.storage_name    AS "storageName",
           ta.mime_type       AS "mimeType",
           ta.size_bytes      AS "sizeBytes",
           ta.attachment_key  AS "attachmentKey",
           ta.created_at      AS "createdAt",
           u.name             AS "uploadedByName"
         FROM ticket_attachments ta
         LEFT JOIN users u ON u.id = ta.uploaded_by
         WHERE ta.ticket_id = $1
         ORDER BY ta.created_at ASC`,
        [req.params.id]
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching attachments:", error);
      res.status(500).json({ error: "Failed to fetch attachments" });
    }
  });

  app.post("/api/tickets/:id/attachments", requireAuth, requireTicketAccess,
    // Intercepta erros do multer (ex: LIMIT_FILE_SIZE) antes do handler assíncrono
    (req: Request, res: Response, next: NextFunction) => {
      ticketUpload.single("file")(req, res, (err: any) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({ error: `O arquivo excede o limite de ${TICKET_MAX_FILE_MB} MB` });
          }
          return res.status(400).json({ error: err.message || "Erro no upload" });
        }
        next();
      });
    },
    async (req, res) => {
      try {
        const isUser = !req.user!.isAdmin && !req.user!.roles?.some(r => r.roleName === "Coordenador");
        if (isUser) {
          return res.status(403).json({ error: "Usuários não podem enviar anexos" });
        }

        const ticket = await storage.getTicketDetail(req.params.id, req.user!);
        if (!ticket) return res.status(404).json({ error: "Chamado não encontrado" });

        if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });

        // multer receives the filename as Latin-1 bytes but browsers send UTF-8;
        // re-interpret the bytes as UTF-8 to fix mojibake (e.g. "VERIFICA��O" → "VERIFICAÇÃO")
        const rawName = req.file.originalname;
        const originalName = /[^\x00-\x7F]/.test(rawName)
          ? Buffer.from(rawName, "latin1").toString("utf8")
          : rawName;

        const attachment = await storage.addTicketAttachment(req.params.id, req.user!, {
          originalName,
          storageName: req.file.filename,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          attachmentKey: (req.body?.attachmentKey as string) || undefined,
        });
        res.status(201).json(attachment);
      } catch (error: any) {
        console.error("Error uploading attachment:", error);
        res.status(400).json({ error: error.message || "Failed to upload attachment" });
      }
    }
  );

  app.get("/api/tickets/:id/attachments/:attachmentId/download", requireAuth, requireTicketAccess, async (req, res) => {
    try {
      const ticket = await storage.getTicketDetail(req.params.id, req.user!);
      if (!ticket) return res.status(404).json({ error: "Chamado não encontrado" });

      const attachments = await storage.listTicketAttachments(req.params.id, req.user!);
      const attachment = attachments.find(a => a.id === req.params.attachmentId);
      if (!attachment) return res.status(404).json({ error: "Anexo não encontrado" });

      if (attachment.storageName.includes("..") || attachment.storageName.includes("/") || attachment.storageName.includes("\\")) {
        return res.status(400).json({ error: "Invalid filename" });
      }

      const filePath = path.join(ticketUploadDir, attachment.storageName);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Arquivo não encontrado" });
      }

      const safeName = attachment.originalName.replace(/[^\x20-\x7E]/g, "_");
      const encodedName = encodeURIComponent(attachment.originalName);
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`);
      res.setHeader("Content-Type", attachment.mimeType);
      res.sendFile(filePath);
    } catch (error) {
      console.error("Error downloading attachment:", error);
      res.status(500).json({ error: "Failed to download attachment" });
    }
  });

  app.delete("/api/tickets/:id/attachments/:attachmentId", requireAuth, requireTicketAccess, async (req, res) => {
    try {
      const isUser = !req.user!.isAdmin && !req.user!.roles?.some((r: any) => r.roleName === "Coordenador");
      if (isUser) return res.status(403).json({ error: "Sem permissão para remover anexos" });

      const attachments = await storage.listTicketAttachments(req.params.id, req.user!);
      const attachment = attachments.find(a => a.id === req.params.attachmentId);
      if (!attachment) return res.status(404).json({ error: "Anexo não encontrado" });

      // Remove do disco
      const filePath = path.join(ticketUploadDir, attachment.storageName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      // Remove do banco
      await pool.query("DELETE FROM ticket_attachments WHERE id = $1", [req.params.attachmentId]);

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "ticket_attachment_deleted",
        targetType: "ticket",
        targetId: req.params.id,
        ip: req.ip || req.socket.remoteAddress,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting attachment:", error);
      res.status(500).json({ error: "Failed to delete attachment" });
    }
  });

  app.get("/api/tickets/:id/attachments/requirements", requireAuth, requireTicketAccess, async (req, res) => {
    try {
      const ticket = await storage.getTicketDetail(req.params.id, req.user!);
      if (!ticket) return res.status(404).json({ error: "Chamado não encontrado" });
      const requirements = await storage.getTicketAttachmentRequirements(req.params.id);
      res.json(requirements);
    } catch (error) {
      console.error("Error fetching attachment requirements:", error);
      res.status(500).json({ error: "Failed to fetch attachment requirements" });
    }
  });

  app.get("/api/tickets/:id/checklist", requireAuth, requireTicketAccess, async (req, res) => {
    try {
      const ticket = await storage.getTicketDetail(req.params.id, req.user!);
      if (!ticket) return res.status(404).json({ error: "Chamado não encontrado" });
      const items = await storage.listTicketChecklistItems(req.params.id);
      res.json(items);
    } catch (error) {
      console.error("Error fetching checklist:", error);
      res.status(500).json({ error: "Failed to fetch checklist" });
    }
  });

  app.patch("/api/tickets/:id/checklist/:itemId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const bodySchema = z.object({ isDone: z.boolean() });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Dados inválidos" });

      const updated = await storage.updateChecklistItem(req.params.id, req.params.itemId, parsed.data.isDone, req.user!.id);
      if (!updated) return res.status(404).json({ error: "Item não encontrado" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating checklist item:", error);
      res.status(500).json({ error: "Failed to update checklist item" });
    }
  });

  app.post("/api/tickets/:id/request-info", requireAuth, requireAdmin, async (req, res) => {
    try {
      const bodySchema = z.object({
        message: z.string().min(1).max(2000),
        markAwaiting: z.boolean().default(true),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
      }
      const { message, markAwaiting } = parsed.data;

      const ticket = await storage.getTicketDetail(req.params.id, req.user!);
      if (!ticket) return res.status(404).json({ error: "Chamado não encontrado" });

      if (markAwaiting && ticket.status !== "AGUARDANDO_REQUERENTE" && ticket.status !== "AGUARDANDO_USUARIO") {
        await storage.adminUpdateTicket(req.params.id, { status: "AGUARDANDO_REQUERENTE" }, req.user!);
      }

      const commentBody = `📌 Solicitação de informações: ${message}`;
      const comment = await storage.addTicketComment(req.params.id, req.user!, {
        body: commentBody,
        isInternal: false,
      });

      res.json({ message: markAwaiting ? "Status alterado para Aguardando Usuário" : "Solicitação registrada", comment });
    } catch (error) {
      console.error("Error requesting info:", error);
      res.status(500).json({ error: "Failed to request info" });
    }
  });

  // ==================== TICKET APPROVAL ROUTES ====================

  app.get("/api/tickets/:id/approval", requireAuth, requireTicketAccess, async (req, res) => {
    try {
      const ticket = await storage.getTicketDetail(req.params.id, req.user!);
      if (!ticket) return res.status(404).json({ error: "Chamado não encontrado" });

      const allCats = await storage.listAllTicketCategories();
      const category = allCats.find(c => c.id === ticket.categoryId);

      const cycles = await pool.query(
        `SELECT MAX(cycle_number) as max_cycle FROM ticket_sla_cycles WHERE ticket_id = $1`,
        [req.params.id]
      );
      const cycleNumber = cycles.rows[0]?.max_cycle || 1;
      const approval = await storage.getTicketApproval(req.params.id, cycleNumber);

      let approverIds: string[] = [];
      if (category && ticket.status === "AGUARDANDO_APROVACAO") {
        approverIds = await storage.resolveApprovers(ticket as any, category);
      }

      const isApprover = req.user!.isAdmin || approverIds.includes(req.user!.id);

      res.json({
        approval: approval || null,
        isApprover,
        approverIds,
      });
    } catch (error) {
      console.error("Error fetching approval:", error);
      res.status(500).json({ error: "Failed to fetch approval" });
    }
  });

  app.post("/api/tickets/:id/approve", requireAuth, requireTicketAccess, async (req, res) => {
    try {
      const ticket = await storage.getTicketDetail(req.params.id, req.user!);
      if (!ticket) return res.status(404).json({ error: "Chamado não encontrado" });
      if (ticket.status !== "AGUARDANDO_APROVACAO") {
        return res.status(400).json({ error: "Chamado não está aguardando aprovação" });
      }

      const allCats = await storage.listAllTicketCategories();
      const category = allCats.find(c => c.id === ticket.categoryId);
      if (!category) return res.status(400).json({ error: "Categoria não encontrada" });

      const approverIds = await storage.resolveApprovers(ticket as any, category);
      if (!req.user!.isAdmin && !approverIds.includes(req.user!.id)) {
        return res.status(403).json({ error: "Você não tem permissão para aprovar este chamado" });
      }

      const noteSchema = z.object({ note: z.string().optional() });
      const parsed = noteSchema.safeParse(req.body);
      const note = parsed.success ? parsed.data.note || "" : "";

      const cycles = await pool.query(
        `SELECT MAX(cycle_number) as max_cycle FROM ticket_sla_cycles WHERE ticket_id = $1`,
        [req.params.id]
      );
      const cycleNumber = cycles.rows[0]?.max_cycle || 1;

      await pool.query(
        `UPDATE ticket_approvals SET status = 'APPROVED', approver_user_id = $1, decision_note = $2, decided_at = NOW()
         WHERE ticket_id = $3 AND cycle_number = $4`,
        [req.user!.id, note, req.params.id, cycleNumber]
      );

      await storage.adminUpdateTicket(req.params.id, { status: "ABERTO" }, req.user!);

      await pool.query(
        `INSERT INTO ticket_events (id, ticket_id, actor_user_id, type, data, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'approved', $3, NOW())`,
        [req.params.id, req.user!.id, JSON.stringify({ note, cycleNumber })]
      );

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "ticket_approve",
        entityType: "ticket",
        entityId: req.params.id,
        details: { note, cycleNumber },
      });

      try {
        const enabled = await storage.isNotificationEnabled("ticket_status");
        if (enabled) {
          const recipients = [ticket.createdBy].filter(id => id !== req.user!.id);
          if (recipients.length > 0) {
            await storage.createNotifications(recipients, {
              type: "ticket_status",
              title: "Chamado aprovado",
              message: `Chamado "${ticket.title}" foi aprovado por ${req.user!.name}`,
              linkUrl: `/tickets/${ticket.id}`,
            });
          }
        }
      } catch (notifErr) {
        console.error("Error dispatching approval notification:", notifErr);
      }

      emitEvent("ticket_approved", {
        ticketId: ticket.id,
        title: ticket.title,
        approverUserId: req.user!.id,
        note,
      });

      res.json({ message: "Chamado aprovado com sucesso" });
    } catch (error: any) {
      console.error("Error approving ticket:", error);
      res.status(500).json({ error: error.message || "Failed to approve ticket" });
    }
  });

  app.post("/api/tickets/:id/reject", requireAuth, requireTicketAccess, async (req, res) => {
    try {
      const ticket = await storage.getTicketDetail(req.params.id, req.user!);
      if (!ticket) return res.status(404).json({ error: "Chamado não encontrado" });
      if (ticket.status !== "AGUARDANDO_APROVACAO") {
        return res.status(400).json({ error: "Chamado não está aguardando aprovação" });
      }

      const allCats = await storage.listAllTicketCategories();
      const category = allCats.find(c => c.id === ticket.categoryId);
      if (!category) return res.status(400).json({ error: "Categoria não encontrada" });

      const approverIds = await storage.resolveApprovers(ticket as any, category);
      if (!req.user!.isAdmin && !approverIds.includes(req.user!.id)) {
        return res.status(403).json({ error: "Você não tem permissão para rejeitar este chamado" });
      }

      const noteSchema = z.object({ note: z.string().min(1, "Motivo da rejeição é obrigatório") });
      const parsed = noteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Motivo da rejeição é obrigatório" });
      }

      const cycles = await pool.query(
        `SELECT MAX(cycle_number) as max_cycle FROM ticket_sla_cycles WHERE ticket_id = $1`,
        [req.params.id]
      );
      const cycleNumber = cycles.rows[0]?.max_cycle || 1;

      await pool.query(
        `UPDATE ticket_approvals SET status = 'REJECTED', approver_user_id = $1, decision_note = $2, decided_at = NOW()
         WHERE ticket_id = $3 AND cycle_number = $4`,
        [req.user!.id, parsed.data.note, req.params.id, cycleNumber]
      );

      await storage.adminUpdateTicket(req.params.id, { status: "CANCELADO" }, req.user!);

      await pool.query(
        `INSERT INTO ticket_events (id, ticket_id, actor_user_id, type, data, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'rejected', $3, NOW())`,
        [req.params.id, req.user!.id, JSON.stringify({ note: parsed.data.note, cycleNumber })]
      );

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "ticket_reject",
        entityType: "ticket",
        entityId: req.params.id,
        details: { note: parsed.data.note, cycleNumber },
      });

      try {
        const enabled = await storage.isNotificationEnabled("ticket_status");
        if (enabled) {
          const recipients = [ticket.createdBy].filter(id => id !== req.user!.id);
          if (recipients.length > 0) {
            await storage.createNotifications(recipients, {
              type: "ticket_status",
              title: "Chamado rejeitado",
              message: `Chamado "${ticket.title}" foi rejeitado: ${parsed.data.note}`,
              linkUrl: `/tickets/${ticket.id}`,
            });
          }
        }
      } catch (notifErr) {
        console.error("Error dispatching rejection notification:", notifErr);
      }

      emitEvent("ticket_rejected", {
        ticketId: ticket.id,
        title: ticket.title,
        rejectorUserId: req.user!.id,
        note: parsed.data.note,
      });

      res.json({ message: "Chamado rejeitado" });
    } catch (error: any) {
      console.error("Error rejecting ticket:", error);
      res.status(500).json({ error: error.message || "Failed to reject ticket" });
    }
  });

  // ==================== TICKET REOPEN REQUEST ROUTES ====================

  app.get("/api/tickets/:id/reopen-request", requireAuth, requireTicketAccess, async (req, res) => {
    try {
      const ticket = await storage.getTicketDetail(req.params.id, req.user!);
      if (!ticket) return res.status(404).json({ error: "Chamado não encontrado" });
      const reopenRequest = await storage.getLatestReopenRequest(req.params.id);
      res.json({ reopenRequest: reopenRequest ?? null });
    } catch (error: any) {
      console.error("Error fetching reopen request:", error);
      res.status(500).json({ error: "Failed to fetch reopen request" });
    }
  });

  app.post("/api/tickets/:id/request-reopen", requireAuth, requireTicketAccess, async (req, res) => {
    try {
      const bodySchema = z.object({ reason: z.string().min(1, "Motivo é obrigatório").max(2000) });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Informe o motivo da reabertura" });
      }

      const ticket = await storage.getTicketDetail(req.params.id, req.user!);
      if (!ticket) return res.status(404).json({ error: "Chamado não encontrado" });

      if (ticket.createdBy !== req.user!.id) {
        return res.status(403).json({ error: "Apenas o requerente do chamado pode solicitar a reabertura" });
      }
      if (ticket.status !== "RESOLVIDO") {
        return res.status(400).json({ error: "Apenas chamados resolvidos podem ser reabertos" });
      }
      const latestReopen = await storage.getLatestReopenRequest(req.params.id);
      if (latestReopen?.status === "PENDING") {
        return res.status(400).json({ error: "Já existe uma solicitação de reabertura pendente para este chamado" });
      }
      if (latestReopen?.status === "REJECTED") {
        return res.status(400).json({ error: "A reabertura deste chamado já foi recusada e não pode ser solicitada novamente" });
      }

      const reopenRequest = await storage.createReopenRequest(req.params.id, req.user!.id, parsed.data.reason);

      // Public comment so the request is visible in the timeline (bypasses the
      // non-admin comment guard since the ticket is RESOLVIDO).
      await pool.query(
        `INSERT INTO ticket_comments (id, ticket_id, author_id, body, is_internal, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, false, NOW())`,
        [req.params.id, req.user!.id, `🔄 Solicitação de reabertura: ${parsed.data.reason}`]
      );

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "ticket_reopen_request",
        targetType: "ticket",
        targetId: req.params.id,
        metadata: { reason: parsed.data.reason },
      });

      try {
        const enabled = await storage.isNotificationEnabled("ticket_status");
        if (enabled) {
          const admins = await storage.getAdminUserIds();
          const assignees = await storage.getTicketAssigneeIds(req.params.id);
          const recipients = [...admins, ...assignees].filter(
            (id, i, arr) => id !== req.user!.id && arr.indexOf(id) === i
          );
          if (recipients.length > 0) {
            await storage.createNotifications(recipients, {
              type: "ticket_status",
              title: "Solicitação de reabertura",
              message: `${req.user!.name} solicitou a reabertura do chamado "${ticket.title}"`,
              linkUrl: `/tickets/${ticket.id}`,
            });
          }
        }
      } catch (notifErr) {
        console.error("Error dispatching reopen-request notification:", notifErr);
      }

      res.status(201).json({ message: "Solicitação de reabertura enviada", reopenRequest });
    } catch (error: any) {
      console.error("Error requesting reopen:", error);
      res.status(500).json({ error: error.message || "Failed to request reopen" });
    }
  });

  app.post("/api/tickets/:id/reopen-request/decision", requireAuth, requireAdmin, async (req, res) => {
    try {
      const bodySchema = z.object({
        action: z.enum(["accept", "reject"]),
        note: z.string().max(2000).optional(),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
      }
      const { action, note } = parsed.data;

      if (action === "reject" && !note?.trim()) {
        return res.status(400).json({ error: "Informe o motivo da recusa" });
      }

      const ticket = await storage.getTicketDetail(req.params.id, req.user!);
      if (!ticket) return res.status(404).json({ error: "Chamado não encontrado" });

      const pending = await storage.getLatestReopenRequest(req.params.id);
      if (!pending || pending.status !== "PENDING") {
        return res.status(400).json({ error: "Não há solicitação de reabertura pendente" });
      }

      if (action === "accept") {
        await storage.decideReopenRequest(pending.id, req.user!.id, "ACCEPTED", note);
        await storage.adminUpdateTicket(req.params.id, { status: "EM_ANDAMENTO" }, req.user!);
        await pool.query(
          `INSERT INTO ticket_comments (id, ticket_id, author_id, body, is_internal, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, false, NOW())`,
          [req.params.id, req.user!.id, `🔄 Reabertura aceita${note?.trim() ? `: ${note.trim()}` : "."} — chamado reaberto para andamento.`]
        );
      } else {
        await storage.decideReopenRequest(pending.id, req.user!.id, "REJECTED", note);
        await pool.query(
          `INSERT INTO ticket_comments (id, ticket_id, author_id, body, is_internal, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, false, NOW())`,
          [req.params.id, req.user!.id, `🔴 Solicitação de reabertura recusada: ${note!.trim()}`]
        );
      }

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: action === "accept" ? "ticket_reopen_accept" : "ticket_reopen_reject",
        targetType: "ticket",
        targetId: req.params.id,
        metadata: { note: note ?? null },
      });

      try {
        const enabled = await storage.isNotificationEnabled("ticket_status");
        if (enabled && pending.requestedBy && pending.requestedBy !== req.user!.id) {
          await storage.createNotifications([pending.requestedBy], {
            type: "ticket_status",
            title: action === "accept" ? "Reabertura aceita" : "Reabertura recusada",
            message: action === "accept"
              ? `Sua solicitação de reabertura do chamado "${ticket.title}" foi aceita`
              : `Sua solicitação de reabertura do chamado "${ticket.title}" foi recusada: ${note!.trim()}`,
            linkUrl: `/tickets/${ticket.id}`,
          });
        }
      } catch (notifErr) {
        console.error("Error dispatching reopen-decision notification:", notifErr);
      }

      res.json({ message: action === "accept" ? "Chamado reaberto" : "Solicitação de reabertura recusada" });
    } catch (error: any) {
      console.error("Error deciding reopen request:", error);
      res.status(500).json({ error: error.message || "Failed to decide reopen request" });
    }
  });

  // ==================== WEBHOOK SETTINGS ROUTES ====================

  app.get("/api/admin/settings/webhooks", requireAuth, requireAdmin, async (req, res) => {
    try {
      const urlSetting = await storage.getSetting("WEBHOOK_EVENTS_URL");
      const enabledSetting = await storage.getSetting("WEBHOOK_EVENTS_ENABLED");
      const url = urlSetting?.value;
      const enabled = enabledSetting?.value;
      res.json({
        url: url || "",
        enabled: enabled === "true",
      });
    } catch (error) {
      console.error("Error fetching webhook settings:", error);
      res.status(500).json({ error: "Failed to fetch webhook settings" });
    }
  });

  app.put("/api/admin/settings/webhooks", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        url: z.string(),
        enabled: z.boolean(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Dados inválidos" });

      await storage.setSetting("WEBHOOK_EVENTS_URL", parsed.data.url);
      await storage.setSetting("WEBHOOK_EVENTS_ENABLED", parsed.data.enabled ? "true" : "false");

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "webhook_settings_update",
        entityType: "settings",
        entityId: "webhooks",
        details: { url: parsed.data.url, enabled: parsed.data.enabled },
      });

      res.json({ message: "Configurações de webhook atualizadas" });
    } catch (error) {
      console.error("Error updating webhook settings:", error);
      res.status(500).json({ error: "Failed to update webhook settings" });
    }
  });

  // ==================== ADMIN TICKET ROUTES ====================

  app.get("/api/admin/tickets/categories", requireAuth, requireAdmin, async (req, res) => {
    try {
      const categories = await storage.listAllTicketCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  app.post("/api/admin/tickets/categories", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(255),
        branch: z.string().min(1).max(120),
        parentId: z.string().nullable().optional(),
        descriptionTemplate: z.string().nullable().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
      }

      if (parsed.data.parentId) {
        const allCats = await storage.listAllTicketCategories();
        const parent = allCats.find(c => c.id === parsed.data.parentId);
        if (!parent || parent.parentId !== null) {
          return res.status(400).json({ error: "Categoria pai deve ser uma branch (raiz)" });
        }
      }

      const cat = await storage.createTicketCategory({
        ...parsed.data,
        createdBy: req.user!.id,
      });

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "ticket_category_create",
        targetType: "ticket_category",
        targetId: cat.id,
        ip: req.ip || req.socket.remoteAddress,
      });

      res.status(201).json(cat);
    } catch (error) {
      console.error("Error creating category:", error);
      res.status(500).json({ error: "Failed to create category" });
    }
  });

  app.patch("/api/admin/tickets/categories/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(255).optional(),
        branch: z.string().min(1).max(120).optional(),
        parentId: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
        descriptionTemplate: z.string().nullable().optional(),
        formSchema: z.array(z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          type: z.enum(["text", "email", "number", "textarea", "select"]),
          required: z.boolean().optional(),
          options: z.array(z.string()).optional(),
          placeholder: z.string().optional(),
          helpText: z.string().optional(),
          rules: z.object({
            regex: z.string().optional(),
            minLen: z.number().optional(),
            maxLen: z.number().optional(),
            min: z.number().optional(),
            max: z.number().optional(),
          }).optional(),
        })).nullable().optional(),
        templateApplyMode: z.enum(["replace_if_empty", "always_replace", "append"]).optional(),
        requiredAttachments: z.array(z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          mime: z.array(z.string()).optional(),
          required: z.boolean().optional(),
        })).nullable().optional(),
        checklistTemplate: z.array(z.object({
          key: z.string().min(1),
          label: z.string().min(1),
        })).nullable().optional(),
        kbTags: z.array(z.string()).nullable().optional(),
        autoAwaitOnMissing: z.boolean().optional(),
        requiresApproval: z.boolean().optional(),
        approvalMode: z.enum(["REQUESTER_COORDINATOR", "TI_ADMIN", "SPECIFIC_USERS"]).optional(),
        approvalUserIds: z.array(z.string()).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos" });
      }

      const updated = await storage.updateTicketCategory(req.params.id, parsed.data);
      if (!updated) return res.status(404).json({ error: "Categoria não encontrada" });

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "ticket_category_update",
        targetType: "ticket_category",
        targetId: req.params.id,
        ip: req.ip || req.socket.remoteAddress,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(500).json({ error: "Failed to update category" });
    }
  });

  app.delete("/api/admin/tickets/categories/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.disableTicketCategory(req.params.id);

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "ticket_category_disable",
        targetType: "ticket_category",
        targetId: req.params.id,
        ip: req.ip || req.socket.remoteAddress,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error disabling category:", error);
      res.status(500).json({ error: "Failed to disable category" });
    }
  });

  app.get("/api/admin/tickets/sla-policies", requireAuth, requireAdmin, async (req, res) => {
    try {
      const policies = await storage.listSlaPolicies();
      res.json(policies);
    } catch (error) {
      console.error("Error fetching SLA policies:", error);
      res.status(500).json({ error: "Failed to fetch SLA policies" });
    }
  });

  app.post("/api/admin/tickets/sla-policies", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(120),
        priority: z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"]),
        firstResponseMinutes: z.number().int().positive(),
        resolutionMinutes: z.number().int().positive(),
        isActive: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
      }

      const policy = await storage.createSlaPolicy(parsed.data);
      res.status(201).json(policy);
    } catch (error) {
      console.error("Error creating SLA policy:", error);
      res.status(500).json({ error: "Failed to create SLA policy" });
    }
  });

  app.patch("/api/admin/tickets/sla-policies/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(120).optional(),
        priority: z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"]).optional(),
        firstResponseMinutes: z.number().int().positive().optional(),
        resolutionMinutes: z.number().int().positive().optional(),
        isActive: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos" });
      }

      const updated = await storage.updateSlaPolicy(req.params.id, parsed.data);
      if (!updated) return res.status(404).json({ error: "Política SLA não encontrada" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating SLA policy:", error);
      res.status(500).json({ error: "Failed to update SLA policy" });
    }
  });

  // ============ Notification Routes ============

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const items = await storage.listUserNotifications(req.user!.id, { limit, offset });
      res.json(items);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const count = await storage.countUnreadNotifications(req.user!.id);
      res.json({ count });
    } catch (error) {
      console.error("Error counting notifications:", error);
      res.status(500).json({ error: "Failed to count notifications" });
    }
  });

  app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const ok = await storage.markNotificationRead(req.user!.id, req.params.id);
      if (!ok) return res.status(404).json({ error: "Notificação não encontrada" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification read:", error);
      res.status(500).json({ error: "Failed to mark notification read" });
    }
  });

  app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      await storage.markAllNotificationsRead(req.user!.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications read:", error);
      res.status(500).json({ error: "Failed to mark all notifications read" });
    }
  });

  // ── Web Push routes ──────────────────────────────────────────────────────

  // Retorna a chave pública VAPID para o frontend se inscrever
  app.get("/api/push/vapid-public-key", requireAuth, (req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) return res.status(503).json({ error: "Push not configured" });
    res.json({ publicKey: key });
  });

  // Salva a subscription do browser do usuário
  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    const { endpoint, keys } = req.body ?? {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "Invalid subscription payload" });
    }
    try {
      await storage.savePushSubscription({
        userId: req.user!.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving push subscription:", error);
      res.status(500).json({ error: "Failed to save subscription" });
    }
  });

  // Remove subscription (usuário desativou notificações)
  app.delete("/api/push/unsubscribe", requireAuth, async (req, res) => {
    const { endpoint } = req.body ?? {};
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });
    try {
      await storage.deletePushSubscription(endpoint);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting push subscription:", error);
      res.status(500).json({ error: "Failed to delete subscription" });
    }
  });

  app.get("/api/admin/notifications/settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getNotificationSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching notification settings:", error);
      res.status(500).json({ error: "Failed to fetch notification settings" });
    }
  });

  app.patch("/api/admin/notifications/settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        type: z.enum(["ticket_created", "ticket_comment", "ticket_status", "resource_updated"]),
        enabled: z.boolean(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos" });
      }
      const setting = await storage.setNotificationSetting(parsed.data.type, parsed.data.enabled);
      res.json(setting);
    } catch (error) {
      console.error("Error updating notification setting:", error);
      res.status(500).json({ error: "Failed to update notification setting" });
    }
  });

  // ============ Knowledge Base Routes (User) ============

  app.get("/api/kb", requireAuth, async (req, res) => {
    try {
      const categoryId = req.query.categoryId as string | undefined;
      let tags: string[] | undefined;
      if (categoryId) {
        const allCats = await storage.listAllTicketCategories();
        const cat = allCats.find(c => c.id === categoryId);
        const catTags = (cat as any)?.kbTags;
        if (catTags && Array.isArray(catTags) && catTags.length > 0) {
          tags = catTags;
        }
      }
      if (req.query.tags) {
        const qTags = (req.query.tags as string).split(",").map(t => t.trim()).filter(Boolean);
        tags = tags ? [...new Set([...tags, ...qTags])] : qTags;
      }
      const articles = await storage.listKbArticles({
        categoryId,
        q: req.query.q as string | undefined,
        tags,
        publishedOnly: true,
      });
      res.json(articles);
    } catch (error) {
      console.error("Error fetching KB articles:", error);
      res.status(500).json({ error: "Failed to fetch KB articles" });
    }
  });

  app.get("/api/kb/:id", requireAuth, async (req, res) => {
    try {
      const article = await storage.getKbArticle(req.params.id);
      if (!article || (!article.isPublished && !req.user!.isAdmin)) {
        return res.status(404).json({ error: "Artigo não encontrado" });
      }
      await storage.logKbArticleView(req.params.id, req.user!.id);
      res.json(article);
    } catch (error) {
      console.error("Error fetching KB article:", error);
      res.status(500).json({ error: "Failed to fetch KB article" });
    }
  });

  app.post("/api/kb/:id/feedback", requireAuth, async (req, res) => {
    try {
      const feedbackSchema = z.object({ helpful: z.boolean() });
      const parsed = feedbackSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos" });
      }
      const feedback = await storage.submitKbArticleFeedback(req.params.id, req.user!.id, parsed.data.helpful);
      res.json(feedback);
    } catch (error) {
      console.error("Error submitting KB feedback:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  // ============ Knowledge Base Routes (Admin) ============

  app.get("/api/admin/kb", requireAuth, requireAdmin, async (req, res) => {
    try {
      const articles = await storage.listKbArticles({
        categoryId: req.query.categoryId as string | undefined,
        q: req.query.q as string | undefined,
        publishedOnly: false,
      });
      res.json(articles);
    } catch (error) {
      console.error("Error fetching KB articles:", error);
      res.status(500).json({ error: "Failed to fetch KB articles" });
    }
  });

  app.post("/api/admin/kb", requireAuth, requireAdmin, async (req, res) => {
    try {
      const createSchema = z.object({
        title: z.string().min(1).max(200),
        body: z.string().min(1),
        categoryId: z.string().nullable().optional(),
        isPublished: z.boolean().optional(),
      });
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
      }

      const article = await storage.createKbArticle({
        ...parsed.data,
        createdBy: req.user!.id,
        updatedBy: req.user!.id,
      });

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "kb_article_create",
        targetType: "kb_article",
        targetId: article.id,
        metadata: { title: article.title },
        ip: req.ip || req.socket.remoteAddress,
      });

      res.status(201).json(article);
    } catch (error) {
      console.error("Error creating KB article:", error);
      res.status(500).json({ error: "Failed to create KB article" });
    }
  });

  app.patch("/api/admin/kb/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const updateSchema = z.object({
        title: z.string().min(1).max(200).optional(),
        body: z.string().min(1).optional(),
        categoryId: z.string().nullable().optional(),
        isPublished: z.boolean().optional(),
      });
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
      }

      const updated = await storage.updateKbArticle(req.params.id, {
        ...parsed.data,
        updatedBy: req.user!.id,
      });
      if (!updated) return res.status(404).json({ error: "Artigo não encontrado" });

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "kb_article_update",
        targetType: "kb_article",
        targetId: req.params.id,
        metadata: parsed.data,
        ip: req.ip || req.socket.remoteAddress,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating KB article:", error);
      res.status(500).json({ error: "Failed to update KB article" });
    }
  });

  app.delete("/api/admin/kb/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.deleteKbArticle(req.params.id);

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "kb_article_delete",
        targetType: "kb_article",
        targetId: req.params.id,
        ip: req.ip || req.socket.remoteAddress,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting KB article:", error);
      res.status(500).json({ error: "Failed to delete KB article" });
    }
  });

  // ============ TI Dashboard Route ============

  app.get("/api/admin/ti/dashboard", requireAuth, requireAdmin, async (req, res) => {
    try {
      const range = (req.query.range === '30d' ? '30d' : '7d') as '7d' | '30d';
      const dashboard = await storage.getTiDashboard(range);
      res.json(dashboard);
    } catch (error) {
      console.error("Error fetching TI dashboard:", error);
      res.status(500).json({ error: "Failed to fetch TI dashboard" });
    }
  });

  // ============ Typing Test Routes (User) ============

  app.post("/api/typing/session", requireAuth, async (req, res) => {
    try {
      const rawLevel = req.body?.level as string | undefined;
      const level: "easy" | "medium" | "hard" =
        rawLevel === "easy" || rawLevel === "hard" ? rawLevel : "medium";

      // Map human level to DB difficulty range
      const diffRange = level === "easy" ? [1, 2] : level === "hard" ? [4, 5] : [3];

      const activeTexts = await storage.listTypingTexts(true);
      if (activeTexts.length === 0) {
        return res.status(400).json({ error: "Nenhum texto disponível para digitação" });
      }
      const diffTexts = activeTexts.filter((t: any) => diffRange.includes(t.difficulty));
      if (diffTexts.length === 0) {
        return res.status(404).json({
          error: `Nenhum texto cadastrado para o nível "${level}". Peça ao admin para cadastrar textos com dificuldade ${diffRange.join(" ou ")}.`,
          level,
        });
      }
      const textPool = diffTexts;
      const text = textPool[Math.floor(Math.random() * textPool.length)];
      const nonce = crypto.randomBytes(16).toString("hex");
      const expiresAt = new Date(Date.now() + 3 * 60 * 1000);
      const session = await storage.createTypingSession(req.user!.id, text.id, nonce, expiresAt);
      res.json({ session, text, level });
    } catch (error) {
      console.error("Error creating typing session:", error);
      res.status(500).json({ error: "Failed to create typing session" });
    }
  });

  app.post("/api/typing/submit", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        sessionId: z.string().min(1),
        nonce: z.string().min(1),
        wpm: z.number().min(1).max(300),
        accuracy: z.number().min(0).max(100),
        durationMs: z.number().min(1000).max(90000),
        typed: z.string().min(1),
        level: z.enum(["easy", "medium", "hard"]).optional(),
        // Anti-cheat telemetry
        pasteAttempts: z.number().int().min(0).optional(),
        maxDeltaChars: z.number().int().min(0).optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
      }

      // ── Anti-cheat: reject scores with paste attempts or huge jumps ──
      const PASTE_DELTA_THRESHOLD = 25;
      if ((parsed.data.pasteAttempts ?? 0) > 0) {
        return res.status(400).json({ error: "anti_cheat", message: "Tentativa de colagem detectada" });
      }
      if ((parsed.data.maxDeltaChars ?? 0) >= PASTE_DELTA_THRESHOLD) {
        return res.status(400).json({ error: "anti_cheat", message: "Variação de entrada suspeita detectada" });
      }

      const session = await storage.getTypingSession(parsed.data.sessionId);
      if (!session) return res.status(404).json({ error: "Sessão não encontrada" });
      if (session.userId !== req.user!.id) return res.status(403).json({ error: "Sessão pertence a outro usuário" });
      if (session.submittedAt) return res.status(400).json({ error: "Sessão já foi submetida" });
      if (session.nonce !== parsed.data.nonce) return res.status(400).json({ error: "Nonce inválido" });
      if (new Date() > session.expiresAt) return res.status(400).json({ error: "Sessão expirada" });

      const text = session.textId ? await storage.getTypingText(session.textId) : null;
      if (!text) return res.status(400).json({ error: "Texto original não encontrado" });

      // Derive canonical level from the actual text difficulty (server-authoritative)
      const textDiff = text.difficulty;
      const derivedLevel: "easy" | "medium" | "hard" =
        textDiff <= 2 ? "easy" : textDiff <= 3 ? "medium" : "hard";
      const level = parsed.data.level || derivedLevel;

      let finalDurationMs = parsed.data.durationMs;
      const durationServerMs = Date.now() - new Date(session.startedAt).getTime();
      if (Math.abs(finalDurationMs - durationServerMs) > 15000) {
        finalDurationMs = durationServerMs;
      }

      if (finalDurationMs < 10000) {
        return res.status(400).json({ error: "Duração muito curta (anti-cheat)" });
      }
      if (finalDurationMs > 90000) {
        finalDurationMs = 90000;
      }

      const durationMin = finalDurationMs / 60000;
      const words = parsed.data.typed.trim().split(/\s+/).length;
      const recalcWpm = Math.round(words / durationMin);
      const finalWpm = Math.min(recalcWpm, 300);

      const userSectorId = req.user!.roles?.[0]?.sectorId || null;
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const score = await storage.submitTypingSession(parsed.data.sessionId, {
        wpm: finalWpm,
        accuracy: parsed.data.accuracy.toFixed(2),
        durationMs: finalDurationMs,
        userId: req.user!.id,
        sectorId: userSectorId,
        monthKey,
        difficulty: textDiff,
        level,
      });

      res.json(score);
    } catch (error) {
      console.error("Error submitting typing session:", error);
      res.status(500).json({ error: "Failed to submit typing session" });
    }
  });

  app.get("/api/typing/leaderboard", requireAuth, async (req, res) => {
    try {
      const now = new Date();
      const monthKey = (req.query.month as string) || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const sectorId = req.query.sectorId as string | undefined;
      const rawLevel = req.query.level as string | undefined;
      const level = rawLevel && ["easy", "medium", "hard"].includes(rawLevel) ? rawLevel as "easy" | "medium" | "hard" : undefined;
      const leaderboard = await storage.getTypingLeaderboard({ monthKey, sectorId, level, limit: 20 });
      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });

  app.get("/api/typing/podium", requireAuth, async (req, res) => {
    try {
      const now = new Date();
      // Default: last month
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const defaultMonth = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
      const monthKey = (req.query.month as string) || defaultMonth;
      const podium = await storage.getTypingPodium(monthKey);
      res.json(podium);
    } catch (error) {
      console.error("Error fetching typing podium:", error);
      res.status(500).json({ error: "Failed to fetch podium" });
    }
  });

  app.get("/api/typing/me", requireAuth, async (req, res) => {
    try {
      const rawLevel = req.query.level as string | undefined;
      const level = rawLevel && ["easy", "medium", "hard"].includes(rawLevel) ? rawLevel : undefined;
      const best = await storage.getUserBestTypingScore(req.user!.id, level);
      res.json(best || null);
    } catch (error) {
      console.error("Error fetching user typing score:", error);
      res.status(500).json({ error: "Failed to fetch user typing score" });
    }
  });

  app.get("/api/typing/me/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getUserTypingStats(req.user!.id);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching user typing stats:", error);
      res.status(500).json({ error: "Failed to fetch user typing stats" });
    }
  });

  // ============ Admin Typing Text Routes ============

  app.get("/api/admin/typing/texts", requireAuth, requireAdmin, async (req, res) => {
    try {
      const texts = await storage.listTypingTexts(false);
      res.json(texts);
    } catch (error) {
      console.error("Error fetching typing texts:", error);
      res.status(500).json({ error: "Failed to fetch typing texts" });
    }
  });

  app.post("/api/admin/typing/texts", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        content: z.string().min(10),
        language: z.string().max(10).optional(),
        difficulty: z.number().int().min(1).max(5).optional(),
        isActive: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
      }
      const text = await storage.createTypingText(parsed.data as any);
      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "typing_text_create",
        targetType: "typing_text",
        targetId: text.id,
        ip: req.ip || req.socket.remoteAddress,
      });
      res.status(201).json(text);
    } catch (error) {
      console.error("Error creating typing text:", error);
      res.status(500).json({ error: "Failed to create typing text" });
    }
  });

  app.patch("/api/admin/typing/texts/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        content: z.string().min(10).optional(),
        language: z.string().max(10).optional(),
        difficulty: z.number().int().min(1).max(5).optional(),
        isActive: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Dados inválidos" });
      }
      const updated = await storage.updateTypingText(req.params.id, parsed.data as any);
      if (!updated) return res.status(404).json({ error: "Texto não encontrado" });
      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "typing_text_update",
        targetType: "typing_text",
        targetId: req.params.id,
        ip: req.ip || req.socket.remoteAddress,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error updating typing text:", error);
      res.status(500).json({ error: "Failed to update typing text" });
    }
  });

  app.delete("/api/admin/typing/texts/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.deleteTypingText(req.params.id);
      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "typing_text_delete",
        targetType: "typing_text",
        targetId: req.params.id,
        ip: req.ip || req.socket.remoteAddress,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting typing text:", error);
      res.status(500).json({ error: "Failed to delete typing text" });
    }
  });

  // ============ Admin Reports Routes ============

  function toCsv(headers: string[], rows: Record<string, any>[]): string {
    const escape = (v: any) => {
      if (v == null) return "";
      const s = String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const lines = [headers.join(",")];
    for (const row of rows) {
      lines.push(headers.map((h) => escape(row[h])).join(","));
    }
    return lines.join("\n");
  }

  app.get("/api/admin/reports/tickets", requireAuth, requireAdmin, async (req, res) => {
    try {
      const format = (req.query.format as string) || "json";
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;

      let whereClause = "";
      const params: any[] = [];
      if (from) {
        params.push(from);
        whereClause += ` AND t.created_at >= $${params.length}::date`;
      }
      if (to) {
        params.push(to);
        whereClause += ` AND t.created_at <= ($${params.length}::date + interval '1 day')`;
      }

      const result = await pool.query(
        `SELECT t.id as "ticketId", t.title, t.created_at as "createdAt", t.closed_at as "closedAt",
                t.status, t.priority,
                tc.branch as "branch",
                tc.name as "category",
                u.name as "requesterName",
                s.name as "requesterSector",
                st.name as "targetSector",
                COALESCE(
                  (SELECT string_agg(au.name, '; ') FROM ticket_assignees ta JOIN users au ON au.id = ta.user_id WHERE ta.ticket_id = t.id),
                  ''
                ) as "assignees",
                COALESCE(sc.resolution_breached, false) as "slaBreached",
                sc.resolution_due_at as "resolutionDueAt"
         FROM tickets t
         LEFT JOIN ticket_categories tc ON t.category_id = tc.id
         LEFT JOIN users u ON t.created_by = u.id
         LEFT JOIN sectors s ON t.requester_sector_id = s.id
         LEFT JOIN sectors st ON t.target_sector_id = st.id
         LEFT JOIN LATERAL (
           SELECT * FROM ticket_sla_cycles WHERE ticket_id = t.id ORDER BY cycle_number DESC LIMIT 1
         ) sc ON true
         WHERE 1=1 ${whereClause}
         ORDER BY t.created_at DESC`,
        params
      );

      const rows = result.rows.map((r: any) => ({
        ticketId: r.ticketId,
        title: r.title || "",
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
        closedAt: r.closedAt ? new Date(r.closedAt).toISOString() : "",
        status: r.status,
        priority: r.priority,
        branch: r.branch || "",
        category: r.category || "",
        requesterName: r.requesterName || "",
        requesterSector: r.requesterSector || "",
        targetSector: r.targetSector || "",
        assignees: r.assignees || "",
        slaBreached: r.slaBreached ? "Sim" : "Não",
        resolutionDueAt: r.resolutionDueAt ? new Date(r.resolutionDueAt).toISOString() : "",
      }));

      if (format === "csv") {
        const headers = ["ticketId", "title", "createdAt", "closedAt", "status", "priority", "branch", "category", "requesterName", "requesterSector", "targetSector", "assignees", "slaBreached", "resolutionDueAt"];
        const csv = toCsv(headers, rows);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="tickets_report.csv"');
        return res.send(csv);
      }
      res.json(rows);
    } catch (error: any) {
      console.error("[reports/tickets] error code=%s msg=%s", error?.code, error?.message, error?.stack);
      if (error?.code === "42P01" || error?.code === "42703") {
        return res.status(503).json({ error: "Schema de banco desatualizado — rode as migrations", code: error.code });
      }
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  app.get("/api/admin/reports/resources", requireAuth, requireAdmin, async (req, res) => {
    try {
      const formatRaw = Array.isArray(req.query.format) ? req.query.format[0] : req.query.format;
      const format = (formatRaw as string | undefined) || "csv";
      const includeInactive = req.query.includeInactive === "true";

      if (format !== "csv" && format !== "json") {
        return res.status(400).json({ error: "Formato inválido. Use csv ou json." });
      }

      const where = includeInactive ? "" : "WHERE is_active = true";
      const result = await pool.query(
        `SELECT r.id as "resourceId", r.name, r.type, r.url, r.is_active as "isActive",
                r.embed_mode as "embedMode", r.open_behavior as "openBehavior",
                r.tags, r.icon,
                s.name as "sectorName",
                r.health_status_override as "healthStatus",
                r.created_at as "createdAt"
         FROM resources r
         LEFT JOIN sectors s ON r.sector_id = s.id
         ${where}
         ORDER BY r.name`
      );
      const rows = result.rows.map((r: any) => ({
        resourceId: r.resourceId,
        name: r.name,
        type: r.type,
        url: r.url || "",
        sectorName: r.sectorName || "",
        embedMode: r.embedMode || "",
        openBehavior: r.openBehavior || "",
        tags: Array.isArray(r.tags) ? r.tags.join(", ") : (r.tags || ""),
        icon: r.icon || "",
        healthStatus: r.healthStatus || "UP",
        isActive: r.isActive ? "Sim" : "Não",
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
      }));

      if (format === "csv") {
        const headers = ["resourceId", "name", "type", "url", "sectorName", "embedMode", "openBehavior", "tags", "icon", "healthStatus", "isActive", "createdAt"];
        const csv = toCsv(headers, rows);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="resources_report.csv"');
        return res.send(csv);
      }
      res.json(rows);
    } catch (error) {
      console.error("Error generating resources report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  app.get("/api/admin/reports/notifications", requireAuth, requireAdmin, async (req, res) => {
    try {
      const format = (req.query.format as string) || "json";
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;

      let whereClause = "";
      const params: any[] = [];
      if (from) {
        params.push(from);
        whereClause += ` AND n.created_at >= $${params.length}::date`;
      }
      if (to) {
        params.push(to);
        whereClause += ` AND n.created_at <= ($${params.length}::date + interval '1 day')`;
      }

      const result = await pool.query(
        `SELECT n.id, n.type, u.name as "recipientName", n.is_read as "isRead",
                n.created_at as "createdAt", n.link_url as "linkUrl"
         FROM notifications n
         LEFT JOIN users u ON n.recipient_user_id = u.id
         WHERE 1=1 ${whereClause}
         ORDER BY n.created_at DESC`,
        params
      );

      const rows = result.rows.map((r: any) => ({
        id: r.id,
        type: r.type,
        recipientName: r.recipientName || "",
        isRead: r.isRead ? "Sim" : "Não",
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
        linkUrl: r.linkUrl || "",
      }));

      if (format === "csv") {
        const headers = ["id", "type", "recipientName", "isRead", "createdAt", "linkUrl"];
        const csv = toCsv(headers, rows);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="notifications_report.csv"');
        return res.send(csv);
      }
      res.json(rows);
    } catch (error) {
      console.error("Error generating notifications report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  // ============ Resource Health Override ============

  app.patch("/api/admin/resources/:id/health", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        healthStatus: z.enum(["UP", "DEGRADED", "DOWN"]),
        healthMessage: z.string().max(300).nullable().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });

      const resourceId = req.params.id as string;
      await pool.query(
        `UPDATE resources SET health_status_override = $1, health_message = $2,
         health_updated_at = NOW(), health_updated_by = $3
         WHERE id = $4`,
        [parsed.data.healthStatus, parsed.data.healthMessage ?? null, req.user!.id, resourceId]
      );
      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "resource_health_update",
        targetType: "resource",
        targetId: resourceId,
        metadata: parsed.data as any,
        ip: req.ip || req.socket.remoteAddress,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating resource health:", error);
      res.status(500).json({ error: "Failed to update resource health" });
    }
  });

  // ============ System Alerts ============

  // User: list active alerts with read status
  app.get("/api/alerts", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const activeOnly = req.query.active !== "false";
      const whereActive = activeOnly
        ? "WHERE sa.is_active = true AND (sa.starts_at IS NULL OR sa.starts_at <= NOW()) AND (sa.ends_at IS NULL OR sa.ends_at >= NOW())"
        : "";
      const result = await pool.query(
        `SELECT sa.id, sa.title, sa.message, sa.severity, sa.is_active as "isActive",
                sa.starts_at as "startsAt", sa.ends_at as "endsAt",
                sa.created_at as "createdAt", u.name as "createdByName",
                (SELECT sar.id FROM system_alert_reads sar WHERE sar.alert_id = sa.id AND sar.user_id = $1 LIMIT 1) IS NOT NULL as "isRead"
         FROM system_alerts sa
         LEFT JOIN users u ON sa.created_by = u.id
         ${whereActive}
         ORDER BY sa.created_at DESC`,
        [userId]
      );
      res.json(result.rows);
    } catch (error: any) {
      if (error?.code === "42P01") {
        // system_alerts table not yet created — graceful empty response
        console.warn("[alerts] system_alerts table missing (42P01) — returning []");
        return res.json([]);
      }
      console.error("Error fetching alerts:", error);
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  // User: mark alert as read
  app.post("/api/alerts/:id/read", requireAuth, async (req, res) => {
    try {
      const alertId = req.params.id as string;
      await pool.query(
        `INSERT INTO system_alert_reads (id, alert_id, user_id, read_at)
         VALUES (gen_random_uuid(), $1, $2, NOW())
         ON CONFLICT (alert_id, user_id) DO NOTHING`,
        [alertId, req.user!.id]
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking alert as read:", error);
      res.status(500).json({ error: "Failed to mark alert as read" });
    }
  });

  // Admin: list all alerts
  app.get("/api/admin/alerts", requireAuth, requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT sa.id, sa.title, sa.message, sa.severity, sa.is_active as "isActive",
                sa.starts_at as "startsAt", sa.ends_at as "endsAt",
                sa.created_at as "createdAt", sa.updated_at as "updatedAt",
                u.name as "createdByName"
         FROM system_alerts sa
         LEFT JOIN users u ON sa.created_by = u.id
         ORDER BY sa.created_at DESC`
      );
      res.json(result.rows);
    } catch (error: any) {
      if (error?.code === "42P01") {
        console.warn("[admin/alerts] system_alerts table missing (42P01) — returning []");
        return res.json([]);
      }
      console.error("Error fetching admin alerts:", error);
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  // Admin: create alert
  app.post("/api/admin/alerts", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        title: z.string().min(1).max(200),
        message: z.string().min(1).max(2000),
        severity: z.enum(["info", "warning", "critical"]).default("info"),
        isActive: z.boolean().default(true),
        startsAt: z.string().datetime().nullable().optional(),
        endsAt: z.string().datetime().nullable().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });

      const result = await pool.query(
        `INSERT INTO system_alerts (id, title, message, severity, is_active, starts_at, ends_at, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING *`,
        [parsed.data.title, parsed.data.message, parsed.data.severity, parsed.data.isActive,
         parsed.data.startsAt ?? null, parsed.data.endsAt ?? null, req.user!.id]
      );
      const alert = result.rows[0];

      // Respond immediately — side-effects (notifications, audit) are best-effort
      res.status(201).json(alert);

      // Side-effects after response — failures logged but do not affect client
      const sideEffects: Promise<any>[] = [];
      if (parsed.data.isActive) {
        // Usa storage.createNotifications() para garantir o disparo do Web Push
        sideEffects.push(
          (async () => {
            const rows = await pool.query<{ id: string }>(
              `SELECT id FROM users WHERE is_active = true AND id != $1`,
              [req.user!.id]
            );
            const recipients = rows.rows.map((r) => r.id);
            if (recipients.length > 0) {
              await storage.createNotifications(recipients, {
                type: "alert",
                title: parsed.data.title,
                message: parsed.data.message,
                linkUrl: "/alerts",
              });
            }
          })()
        );
      }
      sideEffects.push(
        storage.createAuditLog({
          actorUserId: req.user!.id,
          action: "alert_create",
          targetType: "system_alert",
          targetId: alert.id,
          metadata: { title: parsed.data.title, severity: parsed.data.severity } as any,
          ip: req.ip || req.socket.remoteAddress,
        })
      );
      Promise.allSettled(sideEffects).then((results) => {
        results.forEach((r, i) => {
          if (r.status === "rejected") {
            console.error(`[admin/alerts POST] side-effect[${i}] failed:`, r.reason?.message ?? r.reason);
          }
        });
      });
    } catch (error: any) {
      console.error("[admin/alerts POST] code=%s msg=%s", error?.code, error?.message, error?.stack);
      if (error?.code === "42P01") {
        return res.status(503).json({
          error: "Tabela system_alerts não existe no banco. Execute as migrations antes de criar alertas.",
          code: "42P01",
        });
      }
      res.status(500).json({ error: "Failed to create alert" });
    }
  });

  // Admin: update alert
  app.patch("/api/admin/alerts/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        title: z.string().min(1).max(200).optional(),
        message: z.string().min(1).max(2000).optional(),
        severity: z.enum(["info", "warning", "critical"]).optional(),
        isActive: z.boolean().optional(),
        startsAt: z.string().datetime().nullable().optional(),
        endsAt: z.string().datetime().nullable().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });

      const alertId = req.params.id as string;
      const sets: string[] = ["updated_at = NOW()"];
      const params: any[] = [];
      if (parsed.data.title !== undefined) { params.push(parsed.data.title); sets.push(`title = $${params.length}`); }
      if (parsed.data.message !== undefined) { params.push(parsed.data.message); sets.push(`message = $${params.length}`); }
      if (parsed.data.severity !== undefined) { params.push(parsed.data.severity); sets.push(`severity = $${params.length}`); }
      if (parsed.data.isActive !== undefined) { params.push(parsed.data.isActive); sets.push(`is_active = $${params.length}`); }
      if (parsed.data.startsAt !== undefined) { params.push(parsed.data.startsAt); sets.push(`starts_at = $${params.length}`); }
      if (parsed.data.endsAt !== undefined) { params.push(parsed.data.endsAt); sets.push(`ends_at = $${params.length}`); }
      params.push(alertId);
      const result = await pool.query(
        `UPDATE system_alerts SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
        params
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Alerta não encontrado" });
      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating alert:", error);
      res.status(500).json({ error: "Failed to update alert" });
    }
  });

  // Admin: delete alert
  app.delete("/api/admin/alerts/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const alertId = req.params.id as string;
      await pool.query(`DELETE FROM system_alerts WHERE id = $1`, [alertId]);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting alert:", error);
      res.status(500).json({ error: "Failed to delete alert" });
    }
  });

  // ============ Analytics ============

  app.get("/api/admin/analytics/stats", requireAuth, requireAdmin, async (req, res) => {
    try {
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const params: any[] = [];
      let dateWhere = "WHERE 1=1";
      if (from) { params.push(from); dateWhere += ` AND t.created_at >= $${params.length}::date`; }
      if (to) { params.push(to); dateWhere += ` AND t.created_at <= ($${params.length}::date + interval '1 day')`; }

      const [tickets, byStatus, byPriority, topCategories, resources, typing] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) as total,
                  COUNT(*) FILTER (WHERE status IN ('ABERTO','NA_FILA','EM_ANDAMENTO','AGUARDANDO_USUARIO','AGUARDANDO_APROVACAO','AGUARDANDO_REQUERENTE','STANDBY')) as open,
                  COUNT(*) FILTER (WHERE status = 'RESOLVIDO') as resolved,
                  COUNT(*) FILTER (WHERE status = 'CANCELADO') as cancelled
           FROM tickets t ${dateWhere}`,
          params
        ),
        pool.query(
          `SELECT status, COUNT(*) as count FROM tickets t ${dateWhere} GROUP BY status ORDER BY count DESC`,
          params
        ),
        pool.query(
          `SELECT priority, COUNT(*) as count FROM tickets t ${dateWhere} GROUP BY priority ORDER BY count DESC`,
          params
        ),
        pool.query(
          `SELECT tc.name as category, COUNT(*) as count
           FROM tickets t
           LEFT JOIN ticket_categories tc ON t.category_id = tc.id
           ${dateWhere}
           GROUP BY tc.name ORDER BY count DESC LIMIT 10`,
          params
        ),
        pool.query(
          `SELECT
             COUNT(*) as total,
             COUNT(*) FILTER (WHERE COALESCE(health_status_override,'UP') = 'UP') as up,
             COUNT(*) FILTER (WHERE health_status_override = 'DEGRADED') as degraded,
             COUNT(*) FILTER (WHERE health_status_override = 'DOWN') as down
           FROM resources WHERE is_active = true`
        ).catch(async (e: any) => {
          if (e?.code === "42703" || e?.code === "42P01") {
            return pool.query(`SELECT COUNT(*) as total, COUNT(*) as up, 0 as degraded, 0 as down FROM resources WHERE is_active = true`);
          }
          throw e;
        }),
        pool.query(
          `SELECT COUNT(*) as "totalSessions",
                  ROUND(AVG(wpm)) as "avgWpm",
                  ROUND(AVG(accuracy::numeric), 1) as "avgAccuracy"
           FROM typing_scores`
        ).catch(async (e: any) => {
          if (e?.code === "42P01") {
            // typing_scores doesn't exist — try typing_sessions
            return pool.query(
              `SELECT COUNT(*) as "totalSessions", NULL as "avgWpm", NULL as "avgAccuracy" FROM typing_sessions`
            ).catch(() => ({ rows: [{ totalSessions: "0", avgWpm: null, avgAccuracy: null }] }));
          }
          throw e;
        }),
      ]);

      const typingRow = typing.rows[0] ?? {};
      res.json({
        tickets: tickets.rows[0],
        byStatus: byStatus.rows,
        byPriority: byPriority.rows,
        topCategories: topCategories.rows,
        resources: resources.rows[0],
        typing: {
          totalSessions: typingRow.totalSessions ?? typingRow["totalSessions"] ?? "0",
          avgWpm: typingRow.avgWpm ?? typingRow["avgWpm"] ?? null,
          avgAccuracy: typingRow.avgAccuracy ?? typingRow["avgAccuracy"] ?? null,
        },
      });
    } catch (error: any) {
      if (error?.code === "42P01" || error?.code === "42703") {
        console.warn("[analytics/stats] Schema not ready (" + error.code + "):", error.message);
        return res.json({
          tickets: { total: "0", open: "0", resolved: "0", cancelled: "0" },
          byStatus: [],
          byPriority: [],
          topCategories: [],
          resources: { total: "0", up: "0", degraded: "0", down: "0" },
          typing: { totalSessions: "0", avgWpm: "0", avgAccuracy: "0" },
        });
      }
      console.error("Error fetching analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  app.get("/api/admin/analytics/ticket-trend", requireAuth, requireAdmin, async (req, res) => {
    try {
      const days = Math.min(90, Math.max(7, parseInt(req.query.days as string || "30", 10)));
      const result = await pool.query(
        `SELECT DATE(created_at) as date, COUNT(*) as count, status
         FROM tickets
         WHERE created_at >= NOW() - interval '${days} days'
         GROUP BY DATE(created_at), status
         ORDER BY date ASC`
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching ticket trend:", error);
      res.status(500).json({ error: "Failed to fetch ticket trend" });
    }
  });

  app.get("/api/admin/analytics/tickets-detail", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { from, to, sectorId, priority, assigneeId } = req.query as Record<string, string | undefined>;
      const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
      const limit = Math.min(100, Math.max(10, parseInt((req.query.limit as string) || "25", 10)));
      const offset = (page - 1) * limit;

      const conditions: string[] = ["1=1"];
      const params: any[] = [];
      const p = () => { params.push(null); return `$${params.length}`; };
      const add = (val: any, expr: string) => { params[params.length] = val; conditions.push(expr.replace("?", `$${params.length}`) ); };

      // rebuild cleanly
      const conds: string[] = ["1=1"];
      const vals: any[] = [];
      if (from)       { vals.push(from);       conds.push(`t.created_at >= $${vals.length}::date`); }
      if (to)         { vals.push(to);         conds.push(`t.created_at <= ($${vals.length}::date + interval '1 day')`); }
      if (sectorId)   { vals.push(sectorId);   conds.push(`t.target_sector_id = $${vals.length}`); }
      if (priority)   { vals.push(priority);   conds.push(`t.priority = $${vals.length}`); }
      if (assigneeId) { vals.push(assigneeId); conds.push(`EXISTS (SELECT 1 FROM ticket_assignees ta WHERE ta.ticket_id = t.id AND ta.user_id = $${vals.length})`); }

      const whereClause = conds.join(" AND ");

      const [rows, countRow, summary, byCategory] = await Promise.all([
        pool.query(
          `SELECT
             t.id, t.title, t.status, t.priority, t.created_at as "createdAt", t.closed_at as "closedAt",
             s.name as "targetSector",
             rs.name as "requesterSector",
             tc.name as "category",
             COALESCE(
               ROUND(EXTRACT(EPOCH FROM (COALESCE(t.closed_at, NOW()) - t.created_at)) / 60)::int,
               NULL
             ) as "resolutionMinutes",
             COALESCE(
               (SELECT string_agg(u.name, ', ') FROM ticket_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.ticket_id = t.id),
               '—'
             ) as assignees,
             sc.first_response_breached as "firstResponseBreached",
             sc.resolution_breached as "resolutionBreached",
             sc.first_response_due_at as "firstResponseDueAt",
             sc.resolution_due_at as "resolutionDueAt",
             sc.first_response_at as "firstResponseAt",
             sc.resolved_at as "slaResolvedAt"
           FROM tickets t
           LEFT JOIN sectors s ON s.id = t.target_sector_id
           LEFT JOIN sectors rs ON rs.id = t.requester_sector_id
           LEFT JOIN ticket_categories tc ON tc.id = t.category_id
           LEFT JOIN LATERAL (
             SELECT * FROM ticket_sla_cycles WHERE ticket_id = t.id ORDER BY cycle_number DESC LIMIT 1
           ) sc ON true
           WHERE ${whereClause}
           ORDER BY t.created_at DESC
           LIMIT ${limit} OFFSET ${offset}`,
          vals
        ),
        pool.query(
          `SELECT COUNT(*) as total FROM tickets t WHERE ${whereClause}`,
          vals
        ),
        pool.query(
          `SELECT
             COUNT(*) as total,
             COUNT(*) FILTER (WHERE sc.resolution_breached = true) as breached,
             ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(t.closed_at, NOW()) - t.created_at)) / 60))::int as "avgResolutionMinutes"
           FROM tickets t
           LEFT JOIN LATERAL (
             SELECT * FROM ticket_sla_cycles WHERE ticket_id = t.id ORDER BY cycle_number DESC LIMIT 1
           ) sc ON true
           WHERE ${whereClause}`,
          vals
        ),
        pool.query(
          `SELECT
             tc.name as category,
             COUNT(*) as total,
             COUNT(*) FILTER (WHERE sc.resolution_breached = true) as breached,
             ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(t.closed_at, NOW()) - t.created_at)) / 60))::int as "avgResolutionMinutes"
           FROM tickets t
           LEFT JOIN ticket_categories tc ON tc.id = t.category_id
           LEFT JOIN LATERAL (
             SELECT * FROM ticket_sla_cycles WHERE ticket_id = t.id ORDER BY cycle_number DESC LIMIT 1
           ) sc ON true
           WHERE ${whereClause}
           GROUP BY tc.name
           ORDER BY total DESC
           LIMIT 15`,
          vals
        ),
      ]);

      res.json({
        tickets: rows.rows,
        total: parseInt(countRow.rows[0].total, 10),
        page,
        limit,
        summary: summary.rows[0],
        byCategory: byCategory.rows,
      });
    } catch (error: any) {
      console.error("Error fetching tickets detail:", error);
      res.status(500).json({ error: "Failed to fetch tickets detail" });
    }
  });

  // ============ API Tokens (Integrations) ============

  app.get("/api/admin/integrations/tokens", requireAuth, requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT at.id, at.name, at.scopes, at.created_at as "createdAt",
                at.revoked_at as "revokedAt", u.name as "createdByName"
         FROM api_tokens at
         LEFT JOIN users u ON at.created_by = u.id
         ORDER BY at.created_at DESC`
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching tokens:", error);
      res.status(500).json({ error: "Failed to fetch tokens" });
    }
  });

  app.post("/api/admin/integrations/tokens", requireAuth, requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(120),
        scopes: z.array(z.string()).default(["read"]),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });

      const rawToken = `hub_${crypto.randomBytes(24).toString("hex")}`;
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      const result = await pool.query(
        `INSERT INTO api_tokens (id, name, token_hash, scopes, created_by, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
         RETURNING id, name, scopes, created_at as "createdAt"`,
        [parsed.data.name, tokenHash, parsed.data.scopes, req.user!.id]
      );

      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "api_token_create",
        targetType: "api_token",
        targetId: result.rows[0].id,
        metadata: { name: parsed.data.name, scopes: parsed.data.scopes } as any,
        ip: req.ip || req.socket.remoteAddress,
      });

      // Return raw token once
      res.status(201).json({ ...result.rows[0], token: rawToken });
    } catch (error) {
      console.error("Error creating token:", error);
      res.status(500).json({ error: "Failed to create token" });
    }
  });

  app.delete("/api/admin/integrations/tokens/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const tokenId = req.params.id as string;
      await pool.query(
        `UPDATE api_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`,
        [tokenId]
      );
      await storage.createAuditLog({
        actorUserId: req.user!.id,
        action: "api_token_revoke",
        targetType: "api_token",
        targetId: tokenId,
        ip: req.ip || req.socket.remoteAddress,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error revoking token:", error);
      res.status(500).json({ error: "Failed to revoke token" });
    }
  });

  // ============ New Reports ============

  app.get("/api/admin/reports/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const format = (req.query.format as string) || "json";
      if (format !== "csv" && format !== "json") return res.status(400).json({ error: "Formato inválido. Use csv ou json." });
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const params: any[] = [];
      let where = "WHERE 1=1";
      if (from) { params.push(from); where += ` AND u.created_at >= $${params.length}::date`; }
      if (to) { params.push(to); where += ` AND u.created_at <= ($${params.length}::date + interval '1 day')`; }

      const result = await pool.query(
        `SELECT u.id, u.name, u.email, u.auth_provider as "authProvider",
                u.is_active as "isActive", u.created_at as "createdAt",
                STRING_AGG(DISTINCT s.name, ', ') as sectors
         FROM users u
         LEFT JOIN user_sector_roles usr ON u.id = usr.user_id
         LEFT JOIN sectors s ON usr.sector_id = s.id
         ${where}
         GROUP BY u.id, u.name, u.email, u.auth_provider, u.is_active, u.created_at
         ORDER BY u.name`,
        params
      );
      const rows = result.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        authProvider: r.authProvider,
        isActive: r.isActive ? "Sim" : "Não",
        sectors: r.sectors || "",
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
      }));

      if (format === "csv") {
        const csv = toCsv(["id", "name", "email", "authProvider", "isActive", "sectors", "createdAt"], rows);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="users_report.csv"');
        return res.send(csv);
      }
      res.json(rows);
    } catch (error) {
      console.error("Error generating users report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  app.get("/api/admin/reports/typing", requireAuth, requireAdmin, async (req, res) => {
    try {
      const format = (req.query.format as string) || "json";
      if (format !== "csv" && format !== "json") return res.status(400).json({ error: "Formato inválido. Use csv ou json." });
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const difficulty = req.query.difficulty as string | undefined;
      const params: any[] = [];
      let where = "WHERE 1=1";
      if (from) { params.push(from); where += ` AND ts.created_at >= $${params.length}::date`; }
      if (to) { params.push(to); where += ` AND ts.created_at <= ($${params.length}::date + interval '1 day')`; }
      if (difficulty) { params.push(parseInt(difficulty, 10)); where += ` AND ts.difficulty = $${params.length}`; }

      const result = await pool.query(
        `SELECT u.name, u.email, ts.wpm, ts.accuracy, ts.difficulty,
                ts.duration_ms as "durationMs", ts.month_key as "monthKey", ts.created_at as "createdAt"
         FROM typing_scores ts
         JOIN users u ON ts.user_id = u.id
         ${where}
         ORDER BY ts.wpm DESC`,
        params
      );
      const rows = result.rows.map((r: any) => ({
        name: r.name,
        email: r.email,
        wpm: r.wpm,
        accuracy: r.accuracy,
        difficulty: r.difficulty,
        durationMs: r.durationMs,
        monthKey: r.monthKey,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
      }));

      if (format === "csv") {
        const csv = toCsv(["name", "email", "wpm", "accuracy", "difficulty", "durationMs", "monthKey", "createdAt"], rows);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="typing_report.csv"');
        return res.send(csv);
      }
      res.json(rows);
    } catch (error) {
      console.error("Error generating typing report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  app.get("/api/admin/reports/audit-logs", requireAuth, requireAdmin, async (req, res) => {
    try {
      const format = (req.query.format as string) || "json";
      if (format !== "csv" && format !== "json") return res.status(400).json({ error: "Formato inválido. Use csv ou json." });
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const params: any[] = [];
      let where = "WHERE 1=1";
      if (from) { params.push(from); where += ` AND al.created_at >= $${params.length}::date`; }
      if (to) { params.push(to); where += ` AND al.created_at <= ($${params.length}::date + interval '1 day')`; }

      const result = await pool.query(
        `SELECT al.id, al.action, al.target_type as "targetType", al.target_id as "targetId",
                al.ip, al.created_at as "createdAt",
                u.name as "actorName", u.email as "actorEmail"
         FROM audit_logs al
         LEFT JOIN users u ON al.actor_user_id = u.id
         ${where}
         ORDER BY al.created_at DESC
         LIMIT 10000`,
        params
      );
      const rows = result.rows.map((r: any) => ({
        id: r.id,
        action: r.action,
        targetType: r.targetType || "",
        targetId: r.targetId || "",
        actorName: r.actorName || "Sistema",
        actorEmail: r.actorEmail || "",
        ip: r.ip || "",
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
      }));

      if (format === "csv") {
        const csv = toCsv(["id", "action", "targetType", "targetId", "actorName", "actorEmail", "ip", "createdAt"], rows);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="audit_logs_report.csv"');
        return res.send(csv);
      }
      res.json(rows);
    } catch (error) {
      console.error("Error generating audit logs report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  app.get("/api/admin/reports/ops-watchers", requireAuth, requireAdmin, async (req, res) => {
    try {
      const format = (req.query.format as string) || "json";
      if (format !== "csv" && format !== "json") return res.status(400).json({ error: "Formato inválido." });
      const from = req.query.from as string | undefined;
      const to   = req.query.to   as string | undefined;
      const watcherSlug = req.query.watcherSlug as string | undefined;
      const params: any[] = [];
      let where = "WHERE 1=1";
      if (from)        { params.push(from);        where += ` AND e.processed_at >= $${params.length}::date`; }
      if (to)          { params.push(to);          where += ` AND e.processed_at <= ($${params.length}::date + interval '1 day')`; }
      if (watcherSlug) { params.push(watcherSlug); where += ` AND e.watcher_slug = $${params.length}`; }

      const result = await pool.query(
        `SELECT e.id, e.watcher_slug as "watcherSlug", w.name as "watcherName",
                e.filename, e.filename_renamed as "filenameRenamed",
                e.status, e.client, e.error_message as "errorMessage",
                e.n8n_execution_id as "n8nExecutionId",
                e.processed_at as "processedAt"
         FROM ops_events e
         LEFT JOIN ops_watchers w ON w.slug = e.watcher_slug
         ${where}
         ORDER BY e.processed_at DESC
         LIMIT 20000`,
        params
      );
      const rows = result.rows.map((r: any) => ({
        id: r.id,
        watcherSlug: r.watcherSlug,
        watcherName: r.watcherName || "",
        filename: r.filename,
        filenameRenamed: r.filenameRenamed || "",
        status: r.status,
        client: r.client || "",
        errorMessage: r.errorMessage || "",
        n8nExecutionId: r.n8nExecutionId || "",
        processedAt: r.processedAt ? new Date(r.processedAt).toISOString() : "",
      }));

      if (format === "csv") {
        const headers = ["id","watcherSlug","watcherName","filename","filenameRenamed","status","client","errorMessage","n8nExecutionId","processedAt"];
        const csv = toCsv(headers, rows);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="ops_watchers_report.csv"');
        return res.send(csv);
      }
      res.json(rows);
    } catch (error: any) {
      if (error?.code === "42P01") return res.status(503).json({ error: "Tabela ops_events não encontrada — execute as migrations" });
      console.error("Error generating ops-watchers report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  app.get("/api/admin/reports/kb", requireAuth, requireAdmin, async (req, res) => {
    try {
      const format = (req.query.format as string) || "json";
      if (format !== "csv" && format !== "json") return res.status(400).json({ error: "Formato inválido." });

      const result = await pool.query(
        `SELECT a.id, a.title, a.is_published as "isPublished",
                a.created_at as "createdAt", a.updated_at as "updatedAt",
                u.name as "createdBy",
                COUNT(DISTINCT v.id) as "totalViews",
                COUNT(DISTINCT f.id) as "totalFeedback",
                COUNT(DISTINCT f.id) FILTER (WHERE f.helpful = true)  as "helpfulCount",
                COUNT(DISTINCT f.id) FILTER (WHERE f.helpful = false) as "notHelpfulCount"
         FROM kb_articles a
         LEFT JOIN users u ON u.id = a.created_by
         LEFT JOIN kb_article_views v ON v.article_id = a.id
         LEFT JOIN kb_article_feedback f ON f.article_id = a.id
         GROUP BY a.id, a.title, a.is_published, a.created_at, a.updated_at, u.name
         ORDER BY "totalViews" DESC`
      );
      const rows = result.rows.map((r: any) => ({
        id: r.id,
        title: r.title,
        isPublished: r.isPublished ? "Sim" : "Não",
        createdBy: r.createdBy || "",
        totalViews: r.totalViews || 0,
        totalFeedback: r.totalFeedback || 0,
        helpfulCount: r.helpfulCount || 0,
        notHelpfulCount: r.notHelpfulCount || 0,
        helpfulRate: r.totalFeedback > 0 ? `${Math.round((r.helpfulCount / r.totalFeedback) * 100)}%` : "—",
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : "",
        updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : "",
      }));

      if (format === "csv") {
        const headers = ["id","title","isPublished","createdBy","totalViews","totalFeedback","helpfulCount","notHelpfulCount","helpfulRate","createdAt","updatedAt"];
        const csv = toCsv(headers, rows);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="kb_report.csv"');
        return res.send(csv);
      }
      res.json(rows);
    } catch (error: any) {
      if (error?.code === "42P01") return res.status(503).json({ error: "Tabela kb_articles não encontrada — execute as migrations" });
      console.error("Error generating kb report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  // ==================== 41 OPS CENTER ====================

  app.get("/api/ops/stats", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(*) as total_today,
          COUNT(*) FILTER (WHERE status = 'SUCCESS') as success_today,
          COUNT(*) FILTER (WHERE status = 'ERROR') as errors_today
        FROM ops_events
        WHERE processed_at >= CURRENT_DATE
      `);
      const row = result.rows[0];
      const total = parseInt(row.total_today, 10);
      const success = parseInt(row.success_today, 10);
      const errors = parseInt(row.errors_today, 10);
      res.json({
        totalToday: total,
        successToday: success,
        errorsToday: errors,
        successRate: total > 0 ? parseFloat(((success / total) * 100).toFixed(1)) : 100,
      });
    } catch (error: any) {
      if (error?.code === "42P01") return res.json({ totalToday: 0, successToday: 0, errorsToday: 0, successRate: 100 });
      res.status(500).json({ error: "Failed to fetch ops stats" });
    }
  });

  // POST /api/ops/events — called by n8n after each file processing (token auth)
  app.post("/api/ops/events", requireOpsToken, async (req, res) => {
    try {
      const schema = z.object({
        watcherSlug:      z.string().min(1).max(60),
        filename:         z.string().min(1).max(500),
        filenameRenamed:  z.string().max(500).nullish(),
        status:           z.enum(["SUCCESS", "ERROR", "WARNING"]),
        errorMessage:     z.string().nullish(),
        client:           z.string().max(80).nullish(),
        n8nExecutionId:   z.string().max(120).nullish(),
        metadata:         z.record(z.any()).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });

      const d = parsed.data;

      // Verify watcher exists
      const watcherCheck = await pool.query(
        `SELECT slug FROM ops_watchers WHERE slug = $1 AND is_active = true`,
        [d.watcherSlug]
      );
      if (!watcherCheck.rows.length) {
        return res.status(400).json({ error: `Watcher '${d.watcherSlug}' não encontrado` });
      }

      // Upsert: always try to update an existing event for the same watcher+filename created
      // today before inserting. COALESCE preserves filenameRenamed if the incoming call has null
      // (e.g. n8n also calls this endpoint without filenameRenamed; Python calls with it).
      let result;
      const upd = await pool.query(
        `UPDATE ops_events
         SET filename_renamed = COALESCE($3, filename_renamed),
             status           = $4::ops_event_status,
             error_message    = COALESCE($5, error_message)
         WHERE id = (
           SELECT id FROM ops_events
           WHERE watcher_slug = $1 AND filename = $2
             AND processed_at >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
           ORDER BY processed_at DESC LIMIT 1
         )
         RETURNING id, processed_at as "processedAt"`,
        [d.watcherSlug, d.filename, d.filenameRenamed ?? null, d.status, d.errorMessage ?? null]
      );
      if (upd.rows.length) {
        return res.status(200).json({ id: upd.rows[0].id, processedAt: upd.rows[0].processedAt, updated: true });
      }

      result = await pool.query(
        `INSERT INTO ops_events (id, watcher_slug, filename, filename_renamed, status, error_message, client, n8n_execution_id, metadata, processed_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING id, processed_at as "processedAt"`,
        [d.watcherSlug, d.filename, d.filenameRenamed ?? null, d.status, d.errorMessage ?? null,
         d.client ?? null, d.n8nExecutionId ?? null, JSON.stringify(d.metadata ?? {})]
      );

      res.status(201).json({ id: result.rows[0].id, processedAt: result.rows[0].processedAt });
    } catch (error) {
      console.error("[ops/events POST] error:", error);
      res.status(500).json({ error: "Falha ao registrar evento" });
    }
  });

  // POST /api/ops/watchers/:slug/heartbeat — called by Python scripts every 30s (token auth)
  app.post("/api/ops/watchers/:slug/heartbeat", requireOpsToken, async (req, res) => {
    try {
      const { slug } = req.params;
      const result = await pool.query(
        `UPDATE ops_watchers SET last_heartbeat_at = NOW() WHERE slug = $1 AND is_active = true RETURNING slug`,
        [slug]
      );
      if (!result.rows.length) {
        return res.status(404).json({ error: `Watcher '${slug}' não encontrado` });
      }
      res.json({ ok: true, slug, ts: new Date().toISOString() });
    } catch (error) {
      console.error("[ops/heartbeat POST] error:", error);
      res.status(500).json({ error: "Falha ao registrar heartbeat" });
    }
  });

  // GET /api/ops/watchers — list all watchers with last event info.
  // Admins see everything. All other users (Coordenador or Usuário) see only
  // watchers that share at least one sector with their own sector memberships.
  app.get("/api/ops/watchers", requireAuth, async (req, res) => {
    try {
      const u = (req as any).user;
      const isAdmin = u?.isAdmin;

      let sectorFilter = "";
      const filterParams: any[] = [];
      if (!isAdmin) {
        filterParams.push(u.id);
        sectorFilter = `
          AND EXISTS (
            SELECT 1 FROM ops_watcher_sectors ows
            JOIN user_sector_roles usr ON usr.sector_id = ows.sector_id
            WHERE ows.watcher_slug = w.slug AND usr.user_id = $1
          )`;
      }

      const result = await pool.query(`
        SELECT
          w.slug, w.name, w.description, w.client,
          w.folder        AS "folderInput",
          w.folder_output AS "folderOutput",
          w.is_active     AS "isActive",
          w.last_heartbeat_at AS "lastHeartbeatAt",
          e.status        AS "lastStatus",
          e.processed_at  AS "lastProcessedAt",
          e.filename      AS "lastFilename",
          e.error_message AS "lastErrorMessage",
          counts.total_today    AS "totalToday",
          counts.success_today  AS "successToday",
          counts.error_today    AS "errorToday"
        FROM ops_watchers w
        LEFT JOIN LATERAL (
          SELECT status, processed_at, filename, error_message
          FROM ops_events
          WHERE watcher_slug = w.slug
          ORDER BY processed_at DESC
          LIMIT 1
        ) e ON true
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)                                        AS total_today,
            COUNT(*) FILTER (WHERE status = 'SUCCESS')     AS success_today,
            COUNT(*) FILTER (WHERE status = 'ERROR')       AS error_today
          FROM ops_events
          WHERE watcher_slug = w.slug
            AND processed_at >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
        ) counts ON true
        WHERE w.is_active = true ${sectorFilter}
        ORDER BY w.client, w.name
      `, filterParams);
      res.json(result.rows);
    } catch (error) {
      console.error("[ops/watchers GET] error:", error);
      res.status(500).json({ error: "Falha ao buscar watchers" });
    }
  });

  // GET /api/ops/events — paginated event list with filters
  app.get("/api/ops/events", requireAuth, async (req, res) => {
    try {
      const watcherSlug = req.query.watcher as string | undefined;
      const status      = req.query.status  as string | undefined;
      const date        = req.query.date    as string | undefined; // YYYY-MM-DD
      const limit       = Math.min(parseInt(req.query.limit  as string) || 50, 200);
      const offset      = parseInt(req.query.offset as string) || 0;

      const conditions: string[] = [];
      const params: any[] = [];
      let i = 1;

      if (watcherSlug) { conditions.push(`e.watcher_slug = $${i++}`); params.push(watcherSlug); }
      if (status && ["SUCCESS","ERROR","WARNING"].includes(status)) {
        conditions.push(`e.status = $${i++}::ops_event_status`); params.push(status);
      }
      if (date) {
        conditions.push(`e.processed_at::date = $${i++}::date`); params.push(date);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const result = await pool.query(`
        SELECT
          e.id, e.watcher_slug as "watcherSlug", w.name as "watcherName",
          e.filename, e.filename_renamed as "filenameRenamed",
          e.status, e.error_message as "errorMessage",
          e.client, e.n8n_execution_id as "n8nExecutionId",
          e.metadata, e.processed_at as "processedAt"
        FROM ops_events e
        JOIN ops_watchers w ON w.slug = e.watcher_slug
        ${where}
        ORDER BY e.processed_at DESC
        LIMIT $${i++} OFFSET $${i++}
      `, [...params, limit, offset]);

      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM ops_events e ${where}`,
        params
      );

      res.json({ events: result.rows, total: parseInt(countResult.rows[0].total) });
    } catch (error) {
      console.error("[ops/events GET] error:", error);
      res.status(500).json({ error: "Falha ao buscar eventos" });
    }
  });

  // GET /api/ops/summary — today's counts for dashboard cards
  app.get("/api/ops/summary", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(*)                                     AS total,
          COUNT(*) FILTER (WHERE status = 'SUCCESS')  AS success,
          COUNT(*) FILTER (WHERE status = 'ERROR')    AS error,
          COUNT(*) FILTER (WHERE status = 'WARNING')  AS warning,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE status = 'SUCCESS') / NULLIF(COUNT(*), 0), 1
          ) AS success_rate
        FROM ops_events
        WHERE processed_at >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
      `);
      const row = result.rows[0];
      res.json({
        total:       parseInt(row.total),
        success:     parseInt(row.success),
        error:       parseInt(row.error),
        warning:     parseInt(row.warning),
        successRate: row.success_rate ? parseFloat(row.success_rate) : null,
      });
    } catch (error) {
      console.error("[ops/summary GET] error:", error);
      res.status(500).json({ error: "Falha ao buscar resumo" });
    }
  });

  // ── Admin: manage watcher config ────────────────────────────────────────────

  // GET /api/admin/ops-watchers — all watchers with their sector assignments (admin)
  app.get("/api/admin/ops-watchers", requireAuth, requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          w.slug, w.name, w.description, w.client,
          w.folder        AS "folderInput",
          w.folder_output AS "folderOutput",
          w.is_active     AS "isActive",
          COALESCE(
            (
              SELECT json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
              FROM ops_watcher_sectors ows
              JOIN sectors s ON s.id = ows.sector_id
              WHERE ows.watcher_slug = w.slug
            ),
            '[]'::json
          ) AS sectors
        FROM ops_watchers w
        ORDER BY w.client, w.name
      `);
      res.json(result.rows);
    } catch (e: any) {
      console.error("[admin/ops-watchers GET] error:", e?.message ?? e);
      res.status(500).json({ error: "Falha ao buscar watchers", detail: e?.message });
    }
  });

  // PATCH /api/admin/ops-watchers/:slug — update watcher config (admin)
  app.patch("/api/admin/ops-watchers/:slug", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { slug } = req.params;
      const schema = z.object({
        name:         z.string().min(1).max(120).optional(),
        description:  z.string().max(500).nullish(),
        client:       z.string().max(80).nullish(),
        folderInput:  z.string().max(1000).nullish(),
        folderOutput: z.string().max(1000).nullish(),
        isActive:     z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
      const d = parsed.data;
      await pool.query(
        `UPDATE ops_watchers SET
           name         = COALESCE($2, name),
           description  = COALESCE($3, description),
           client       = COALESCE($4, client),
           folder       = COALESCE($5, folder),
           folder_output= COALESCE($6, folder_output),
           is_active    = COALESCE($7, is_active)
         WHERE slug = $1`,
        [slug, d.name ?? null, d.description, d.client, d.folderInput, d.folderOutput, d.isActive ?? null]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Falha ao atualizar watcher" });
    }
  });

  // GET /api/admin/ops-watcher-sectors/:slug — sector IDs assigned to a watcher
  app.get("/api/admin/ops-watcher-sectors/:slug", requireAuth, requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT sector_id AS "sectorId" FROM ops_watcher_sectors WHERE watcher_slug = $1 ORDER BY sector_id`,
        [req.params.slug]
      );
      res.json(result.rows.map((r: any) => r.sectorId));
    } catch (e) {
      res.status(500).json({ error: "Falha ao buscar setores do watcher" });
    }
  });

  // PUT /api/admin/ops-watcher-sectors/:slug — replace sector list for a watcher
  app.put("/api/admin/ops-watcher-sectors/:slug", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { slug } = req.params;
      const parsed = z.object({ sectorIds: z.array(z.string()) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Dados inválidos" });
      const { sectorIds } = parsed.data;
      await pool.query(`DELETE FROM ops_watcher_sectors WHERE watcher_slug = $1`, [slug]);
      if (sectorIds.length) {
        const values = sectorIds.map((_: string, i: number) => `($1, $${i + 2})`).join(", ");
        await pool.query(
          `INSERT INTO ops_watcher_sectors (watcher_slug, sector_id) VALUES ${values}`,
          [slug, ...sectorIds]
        );
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Falha ao salvar setores do watcher" });
    }
  });

  // Health check endpoint for backend
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API info — prevents SPA router from catching /api and showing "forgot to add page"
  app.get("/api", (req, res) => {
    res.json({
      name: "41 Tech Hub API",
      version: "1.0",
      description: "REST API for 41 Tech Hub portal",
      docsUrl: "/admin/integrations?tab=docs",
      auth: "Bearer hub_<token> in Authorization header",
      endpoints: {
        resources: "GET /api/resources",
        tickets: "GET /api/tickets, POST /api/tickets, GET /api/tickets/:id",
        alerts: "GET /api/alerts, POST /api/admin/alerts",
        kb: "GET /api/kb, GET /api/kb/:id, POST /api/kb/:id/feedback",
        notifications: "GET /api/notifications",
        admin: "GET /api/admin/resources, GET /api/admin/reports/*, GET /api/admin/audit",
      },
    });
  });

  // ── Schema diagnostics (read-only, admin only) ───────────────────────────
  app.get("/api/admin/diagnostics/schema", requireAuth, requireAdmin, async (req, res) => {
    const checks: Array<{ name: string; exists: boolean; detail?: string }> = [];

    const tableExists = async (table: string): Promise<boolean> => {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
        [table]
      );
      return r.rows.length > 0;
    };

    const columnExists = async (table: string, column: string): Promise<boolean> => {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
        [table, column]
      );
      return r.rows.length > 0;
    };

    try {
      const tables = [
        "resources", "sectors", "users", "roles", "user_sector_roles",
        "resource_overrides", "favorites", "recent_access", "audit_logs",
        "health_checks", "tickets", "ticket_categories", "ticket_sla_policies",
        "ticket_assignees", "ticket_comments", "ticket_attachments",
        "ticket_sla_cycles", "ticket_events", "ticket_checklist_items",
        "ticket_approvals", "ticket_alerts_dedup",
        "notifications", "notification_settings",
        "system_alerts", "system_alert_reads",
        "api_tokens",
        "kb_articles", "kb_article_views", "kb_article_feedback",
        "typing_texts", "typing_sessions", "typing_scores",
        "admin_settings",
      ];

      for (const t of tables) {
        checks.push({ name: `table:${t}`, exists: await tableExists(t) });
      }

      // Key columns added in recent migrations
      const cols = [
        ["resources", "health_status_override"],
        ["resources", "health_message"],
        ["resources", "health_updated_at"],
        ["resources", "health_updated_by"],
      ];
      for (const [tbl, col] of cols) {
        checks.push({ name: `column:${tbl}.${col}`, exists: await columnExists(tbl, col) });
      }

      res.json({ ok: true, timestamp: new Date().toISOString(), checks });
    } catch (err: any) {
      console.error("[diagnostics/schema] error:", err);
      res.status(500).json({ ok: false, error: err.message, checks });
    }
  });

  // ── Health diagnostics (read-only, admin only) ───────────────────────────
  app.get("/api/admin/diagnostics/health", requireAuth, requireAdmin, async (_req, res) => {
    const requiredTables = [
      "users", "sectors", "resources", "tickets", "ticket_comments",
      "kb_articles", "system_alerts", "alert_reads", "notifications",
      "audit_logs", "typing_sessions", "resource_access_logs",
      "health_checks",
    ];

    try {
      const dbMeta = await pool.query("SELECT current_database() AS db, version() AS ver");
      const { db, ver } = dbMeta.rows[0] ?? { db: "unknown", ver: "unknown" };

      const tableRes = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
      `);
      const existingTables = new Set(tableRes.rows.map((r: any) => r.table_name as string));
      const missingTables = requiredTables.filter((t) => !existingTables.has(t));

      res.json({
        ok: missingTables.length === 0,
        timestamp: new Date().toISOString(),
        database: db,
        version: ver.split(" ").slice(0, 2).join(" "),
        missingTables,
        tableCount: existingTables.size,
      });
    } catch (err: any) {
      console.error("[diagnostics/health] error:", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ── Platform Feedback ────────────────────────────────────────────────────
  app.post("/api/feedback", requireAuth, async (req, res) => {
    try {
      const { type, title, message } = req.body;
      if (!type || !title || !message) {
        return res.status(400).json({ error: "type, title e message são obrigatórios" });
      }
      const item = await storage.createFeedback({
        userId: (req as any).user?.id ?? null,
        type,
        title,
        message,
      });
      res.json(item);
    } catch (err: any) {
      console.error("[feedback] error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/feedback", requireAuth, requireAdmin, async (req, res) => {
    try {
      const items = await storage.listFeedback(200);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/feedback/:id/read", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.markFeedbackRead(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
