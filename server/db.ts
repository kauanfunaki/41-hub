import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Garante que todas as conexões usem o horário de Brasília.
// Isso corrige a exibição de timestamps no banco e nas queries brutas.
pool.on("connect", (client) => {
  client.query("SET timezone = 'America/Sao_Paulo'");
});

export const db = drizzle(pool, { schema });
