import "server-only";
import type { Strategy } from "../strategy/schema";
import { LOCAL_USER, db, newId } from "./db";

export interface StoredStrategy {
  id: string;
  name: string;
  strategy: Strategy;
  sourceText: string | null;
  createdAt: number;
  updatedAt: number;
}

function fromRow(r: Record<string, string | number | null>): StoredStrategy {
  return {
    id: r.id as string,
    name: r.name as string,
    strategy: JSON.parse(r.json as string),
    sourceText: (r.source_text as string) ?? null,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  };
}

export function listStrategies(): StoredStrategy[] {
  return (db().prepare("SELECT * FROM strategies WHERE user_id = ? ORDER BY updated_at DESC").all(LOCAL_USER) as Record<string, string | number | null>[]).map(fromRow);
}

export function getStrategy(id: string): StoredStrategy | null {
  const r = db().prepare("SELECT * FROM strategies WHERE id = ? AND user_id = ?").get(id, LOCAL_USER) as Record<string, string | number | null> | undefined;
  return r ? fromRow(r) : null;
}

export function saveStrategy(strategy: Strategy, sourceText: string | null, id?: string): StoredStrategy {
  const now = Date.now();
  if (id && getStrategy(id)) {
    db()
      .prepare("UPDATE strategies SET name = ?, json = ?, source_text = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(strategy.name, JSON.stringify(strategy), sourceText, now, id, LOCAL_USER);
    return getStrategy(id)!;
  }
  const newIdValue = newId();
  db()
    .prepare("INSERT INTO strategies (id, user_id, name, json, source_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(newIdValue, LOCAL_USER, strategy.name, JSON.stringify(strategy), sourceText, now, now);
  return getStrategy(newIdValue)!;
}

export function deleteStrategy(id: string) {
  db().prepare("DELETE FROM strategies WHERE id = ? AND user_id = ?").run(id, LOCAL_USER);
}
