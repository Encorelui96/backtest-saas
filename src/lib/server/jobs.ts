import "server-only";
import { z } from "zod";
import { LANGS } from "../i18n";
import { BacktestConfigSchema, StrategySchema } from "../strategy/schema";
import type { PoolClient } from "pg";
import { newId, query, queryOne } from "./db";
import { refundBacktestCredit } from "./quotas";

/**
 * Work queue in Postgres. The web server only inserts; the worker claims jobs
 * one by one with FOR UPDATE SKIP LOCKED, so several workers can run safely.
 */

export const BacktestPayload = z.object({
  strategy: StrategySchema,
  config: BacktestConfigSchema,
  strategyId: z.string().nullable(),
  /** The language of the page that asked, for the e-mail at the end of a long test. */
  lang: z.enum(LANGS).optional(),
});
export type BacktestPayload = z.infer<typeof BacktestPayload>;

export interface Job {
  id: string;
  userId: string;
  kind: string;
  payload: unknown;
  status: "queued" | "running" | "done" | "failed";
  progress: number;
  message: string | null;
  resultId: string | null;
  error: string | null;
  attempts: number;
  createdAt: number;
}

interface Row {
  id: string;
  user_id: string;
  kind: string;
  payload: unknown;
  status: Job["status"];
  progress: number;
  message: string | null;
  result_id: string | null;
  error: string | null;
  attempts: number;
  created_at: Date;
}

function fromRow(r: Row): Job {
  return {
    id: r.id,
    userId: r.user_id,
    kind: r.kind,
    payload: r.payload,
    status: r.status,
    progress: r.progress,
    message: r.message,
    resultId: r.result_id,
    error: r.error,
    attempts: r.attempts,
    createdAt: r.created_at.getTime(),
  };
}

export async function enqueue(userId: string, kind: string, payload: unknown, client?: PoolClient): Promise<Job> {
  const run = async (text: string, params: unknown[]) => (client ? (await client.query<Row>(text, params)).rows[0] : await queryOne<Row>(text, params));
  const r = await run("INSERT INTO jobs (id, user_id, kind, payload, message) VALUES ($1, $2, $3, $4, 'En attente') RETURNING *", [
    newId(),
    userId,
    kind,
    JSON.stringify(payload),
  ]);
  return fromRow(r!);
}

/** The job and its place in the queue, for the progress bar. */
export async function getJob(userId: string, id: string): Promise<(Job & { ahead: number }) | null> {
  const r = await queryOne<Row & { ahead: string }>(
    `SELECT j.*, (SELECT count(*) FROM jobs q WHERE q.status = 'queued' AND q.created_at < j.created_at) AS ahead
     FROM jobs j WHERE j.id = $1 AND j.user_id = $2`,
    [id, userId],
  );
  return r ? { ...fromRow(r), ahead: Number(r.ahead) } : null;
}

/** Takes the oldest waiting job. Jobs left running by a crashed worker for 15 minutes are retried once. */
export async function claimNext(): Promise<Job | null> {
  const stale = await query<{ id: string; status: string }>(
    `UPDATE jobs SET status = CASE WHEN attempts >= 2 THEN 'failed' ELSE 'queued' END,
       error = CASE WHEN attempts >= 2 THEN 'Le calcul a été interrompu deux fois.' ELSE error END
     WHERE status = 'running' AND started_at < now() - interval '15 minutes'
     RETURNING id, status`,
  );
  for (const j of stale) if (j.status === "failed") await refundBacktestCredit(j.id);
  const r = await queryOne<Row>(
    `UPDATE jobs SET status = 'running', started_at = now(), attempts = attempts + 1, message = 'Démarrage'
     WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING *`,
  );
  return r ? fromRow(r) : null;
}

export async function reportProgress(id: string, share: number, message: string) {
  await query("UPDATE jobs SET progress = $2, message = $3 WHERE id = $1 AND status = 'running'", [id, Math.round(share * 100), message]);
}

export async function finishJob(id: string, resultId: string) {
  await query("UPDATE jobs SET status = 'done', progress = 100, message = 'Terminé', result_id = $2, finished_at = now() WHERE id = $1", [id, resultId]);
}

export async function failJob(id: string, error: string) {
  await query("UPDATE jobs SET status = 'failed', error = $2, finished_at = now() WHERE id = $1", [id, error]);
  // A failed backtest doesn't count against the month; neither does it cost a recharge credit.
  await refundBacktestCredit(id);
}
