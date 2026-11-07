import "server-only";
import type { Strategy } from "../strategy/schema";
import { newId, query, queryOne } from "./db";

export interface StoredStrategy {
  id: string;
  name: string;
  strategy: Strategy;
  sourceText: string | null;
  /** Starred by the owner: listed first, and its backtests are kept out of the purge. */
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
}

interface Row {
  id: string;
  name: string;
  json: Strategy;
  source_text: string | null;
  favorite: boolean;
  created_at: Date;
  updated_at: Date;
}

function fromRow(r: Row): StoredStrategy {
  return {
    id: r.id,
    name: r.name,
    strategy: r.json,
    sourceText: r.source_text,
    favorite: r.favorite,
    createdAt: r.created_at.getTime(),
    updatedAt: r.updated_at.getTime(),
  };
}

export async function listStrategies(userId: string): Promise<StoredStrategy[]> {
  return (await query<Row>("SELECT * FROM strategies WHERE user_id = $1 ORDER BY favorite DESC, updated_at DESC", [userId])).map(fromRow);
}

/** Stars or unstars a strategy. Returns false when it isn't the user's. */
export async function setFavorite(userId: string, id: string, favorite: boolean) {
  const r = await queryOne<{ id: string }>("UPDATE strategies SET favorite = $3 WHERE id = $1 AND user_id = $2 RETURNING id", [id, userId, favorite]);
  return r !== null;
}

export async function getStrategy(userId: string, id: string): Promise<StoredStrategy | null> {
  const r = await queryOne<Row>("SELECT * FROM strategies WHERE id = $1 AND user_id = $2", [id, userId]);
  return r ? fromRow(r) : null;
}

/** Updates the user's strategy `id`, or creates one when it doesn't exist or isn't theirs. */
export async function saveStrategy(userId: string, strategy: Strategy, sourceText: string | null, id?: string): Promise<StoredStrategy> {
  if (id) {
    const r = await queryOne<Row>(
      "UPDATE strategies SET name = $1, json = $2, source_text = $3, updated_at = now() WHERE id = $4 AND user_id = $5 RETURNING *",
      [strategy.name, JSON.stringify(strategy), sourceText, id, userId],
    );
    if (r) return fromRow(r);
  }
  const r = await queryOne<Row>("INSERT INTO strategies (id, user_id, name, json, source_text) VALUES ($1, $2, $3, $4, $5) RETURNING *", [
    newId(),
    userId,
    strategy.name,
    JSON.stringify(strategy),
    sourceText,
  ]);
  return fromRow(r!);
}

export async function deleteStrategy(userId: string, id: string) {
  await query("DELETE FROM strategies WHERE id = $1 AND user_id = $2", [id, userId]);
}
