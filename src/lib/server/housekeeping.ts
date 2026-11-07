import "server-only";
import { query } from "./db";

/**
 * What the database keeps, and for how long. Run by the worker once a day
 * (and at start), between two backtests.
 *
 * - Backtest reports: the newest KEEP_BACKTESTS per account. Older ones go,
 *   except those the owner named or shared, and those of a starred strategy:
 *   naming, sharing or starring is how to keep a result. A report weighs about 165 KB compressed; 1 000 a month on the
 *   Pro plan would add 165 MB a month per account otherwise.
 * - Finished jobs: 90 days. The monthly quota counts the current month's jobs,
 *   and the admin page the current month's, so nothing they read is touched.
 * - Telegram link codes: a day past their expiry.
 */
export const KEEP_BACKTESTS = 200;
export const KEEP_JOBS_DAYS = 90;

export interface Purged {
  backtests: number;
  jobs: number;
  codes: number;
}

export async function purgeOld(): Promise<Purged> {
  const backtests = await query<{ id: string }>(
    `DELETE FROM backtests b
     WHERE b.name IS NULL
       AND NOT EXISTS (SELECT 1 FROM shares s WHERE s.backtest_id = b.id)
       AND NOT EXISTS (SELECT 1 FROM strategies st WHERE st.id = b.strategy_id AND st.favorite)
       AND b.id IN (
         SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn FROM backtests) ranked
         WHERE rn > $1
       )
     RETURNING id`,
    [KEEP_BACKTESTS],
  );
  const jobs = await query<{ id: string }>(
    `DELETE FROM jobs WHERE status IN ('done', 'failed') AND coalesce(finished_at, created_at) < now() - make_interval(days => $1) RETURNING id`,
    [KEEP_JOBS_DAYS],
  );
  const codes = await query<{ code: string }>("DELETE FROM telegram_link_codes WHERE expires_at < now() - interval '1 day' RETURNING code");
  return { backtests: backtests.length, jobs: jobs.length, codes: codes.length };
}

const EVERY_MS = 24 * 3_600_000;
let last = 0;

/** purgeOld() at most once a day; errors are logged, never thrown, so the worker's loop goes on. */
export async function housekeepingTick(now = Date.now()) {
  if (now - last < EVERY_MS) return;
  last = now;
  try {
    const p = await purgeOld();
    if (p.backtests || p.jobs || p.codes) console.log(`[ménage] ${p.backtests} rapport(s), ${p.jobs} tâche(s), ${p.codes} code(s) supprimé(s)`);
  } catch (e) {
    console.error("[ménage] échec", e);
  }
}
