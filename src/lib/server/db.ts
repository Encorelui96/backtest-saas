import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * Postgres connection pool, shared by the web server and the worker.
 * DATABASE_URL is the only setting (Railway provides it).
 */

declare global {
  var __pool: Pool | undefined;
}

export function pool(): Pool {
  if (!globalThis.__pool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL manquant : configure la base Postgres (voir README).");
    globalThis.__pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalThis.__pool;
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await query<T>(text, params))[0] ?? null;
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export function newId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
