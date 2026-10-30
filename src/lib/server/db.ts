import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/**
 * SQLite database (built into Node, no native build). Every user-owned row
 * carries a user_id so accounts can be added later without a migration.
 */

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");

declare global {
  var __db: DatabaseSync | undefined;
}

export function db(): DatabaseSync {
  if (globalThis.__db) return globalThis.__db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const d = new DatabaseSync(DB_PATH);
  d.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS candles (
      symbol TEXT NOT NULL,
      interval TEXT NOT NULL,
      t INTEGER NOT NULL,
      o REAL NOT NULL, h REAL NOT NULL, l REAL NOT NULL, c REAL NOT NULL, v REAL NOT NULL,
      PRIMARY KEY (symbol, interval, t)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS strategies (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'local',
      name TEXT NOT NULL,
      json TEXT NOT NULL,
      source_text TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS backtests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'local',
      strategy_id TEXT,
      strategy_json TEXT NOT NULL,
      config_json TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      report_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS backtests_by_strategy ON backtests (strategy_id, created_at);
  `);
  globalThis.__db = d;
  return d;
}

export const LOCAL_USER = "local";

export function newId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
