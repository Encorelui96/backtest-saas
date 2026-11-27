import "server-only";
import { z } from "zod";
import {
  ACCOUNT_KINDS,
  CURRENCIES,
  ERROR_CODES,
  EXIT_REASONS,
  VERDICTS,
  MAX_SETUPS,
  MAX_TRADES,
  NO_ANSWERS,
  closeProblem,
  isTimeZone,
  isWebLink,
  minutesOf,
  openProblem,
  planChecks,
  planStatus,
  resultR,
  riskAmount,
  riskPercent,
  type JournalAccount,
  type JournalSetup,
  type JournalTrade,
  type PlanAnswers,
  type PlanCheck,
} from "../journal";
import { importKey } from "../journal-import";
import type { SessionUser } from "./auth";
import { newId, query, queryOne } from "./db";
import { UserError } from "./errors";
import { QuotaError, planOf, withUserLock } from "./quotas";
import { limitPerMinute } from "./rate-limit";

/**
 * The trading journal's storage. Every query carries the user's id: an id from another account
 * reads as "not found". The shapes and calculations shared with the pages are in lib/journal.
 */

/** Changes per minute: plenty for typing trades, too few for a script filling the database. */
export function limitJournal(userId: string) {
  limitPerMinute(userId, "journal", 60, "Trop de changements d'affilée dans le journal : attends une minute.");
}

// ---------- Input ----------

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => (s ? s : null));
const price = z.number().positive().max(1e9);
const link = z
  .string()
  .trim()
  .max(500)
  .nullable()
  .transform((s) => (s ? s : null))
  .refine((s) => s === null || isWebLink(s), { message: "lien web attendu (https://…)" });
/** From the year 2000 to tomorrow: a typo in the year shouldn't file a trade in 1926 or 2062. */
const time = z
  .number()
  .int()
  .refine((t) => t >= Date.UTC(2000, 0, 1) && t <= Date.now() + 86_400_000, { message: "date hors limites" });

const hour = z
  .string()
  .nullable()
  .refine((h) => h === null || minutesOf(h) !== null, { message: "heure attendue (HH:MM)" });

export const AccountInput = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(ACCOUNT_KINDS),
  currency: z.enum(CURRENCIES),
  capital: z.number().positive().max(1e12),
  riskPct: z.number().positive().max(100),
  // The plan: null for "no rule".
  maxDailyLossR: z.number().positive().max(100).nullable(),
  maxTradesDay: z.number().int().min(1).max(100).nullable(),
  tradingDays: z.number().int().min(1).max(127).nullable(),
  sessionStart: hour,
  sessionEnd: hour,
  timeZone: z.string().max(64).refine(isTimeZone, { message: "fuseau horaire inconnu" }),
  archived: z.boolean().optional(),
});
export type AccountInput = z.infer<typeof AccountInput>;

export const SetupInput = z.object({
  name: z.string().trim().min(1).max(60),
  description: text(1000),
  strategyId: z.string().max(64).nullable(),
  archived: z.boolean().optional(),
});
export type SetupInput = z.infer<typeof SetupInput>;

export const CloseInput = z.object({
  closedAt: time,
  exit: price,
  exitReason: z.enum(EXIT_REASONS),
  fees: z.number().min(0).max(1e9),
  comment: text(280),
  captureUrl: link,
  maeR: z.number().min(-100).max(100).nullable(),
  mfeR: z.number().min(-100).max(100).nullable(),
});

export const TradeInput = z.object({
  accountId: z.string().min(1).max(64),
  setupId: z.string().max(64).nullable(),
  offPlan: z.boolean(),
  market: z.string().trim().min(1).max(40),
  side: z.enum(["long", "short"]),
  quality: z.enum(["A", "B", "C"]).nullable(),
  openedAt: time,
  entry: price,
  stop: price,
  size: z.number().positive().max(1e12),
  pointValue: z.number().positive().max(1e9),
  target: price.nullable(),
  timeframe: text(20),
  context: text(500),
  plannedEntry: price.nullable(),
  announcement: text(200),
  captureUrl: link,
  // Taken without a stop: the form then sends the stop of the planned risk.
  noStop: z.boolean().default(false),
  ticket: z.string().trim().max(40).nullable().default(null),
  notes: text(5000).default(null),
  // The AI's reading of a chart, as /api/journal/analysis gave it: kept with the trade, never asked again on its own.
  analysis: z
    .object({
      verdict: z.enum(VERDICTS),
      summary: z.string().max(600),
      remarks: z.array(z.string().max(300)).max(5),
      at: z.number().int(),
    })
    .nullable()
    .default(null),
  close: CloseInput.nullable(),
  planAnswers: z.object({ setup: z.boolean().nullable(), entry: z.boolean().nullable(), exit: z.boolean().nullable() }),
  errors: z
    .array(
      z.object({
        code: z.enum(ERROR_CODES),
        costR: z
          .number()
          .min(-1000)
          .max(1000)
          .nullable()
          .transform((x) => (x === null ? null : Math.round(x * 100) / 100)),
      }),
    )
    .max(ERROR_CODES.length)
    .refine((e) => new Set(e.map((x) => x.code)).size === e.length, { message: "code d'erreur en double" }),
});
export type TradeInput = z.infer<typeof TradeInput>;

/** The checks zod can't express: a stop on the right side, an exit after the entry. */
function checkTrade(t: TradeInput) {
  const problem = openProblem(t) ?? (t.close ? closeProblem(t, t.close) : null);
  if (problem) throw new UserError(problem);
}

// ---------- Rows ----------

interface AccountRow {
  id: string;
  name: string;
  kind: JournalAccount["kind"];
  currency: string;
  capital: number;
  risk_pct: number;
  max_daily_loss_r: number | null;
  max_trades_day: number | null;
  trading_days: number | null;
  session_start: string | null;
  session_end: string | null;
  time_zone: string;
  archived: boolean;
  created_at: Date;
}

const account = (r: AccountRow): JournalAccount => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  currency: r.currency,
  capital: r.capital,
  riskPct: r.risk_pct,
  maxDailyLossR: r.max_daily_loss_r,
  maxTradesDay: r.max_trades_day,
  tradingDays: r.trading_days,
  sessionStart: r.session_start,
  sessionEnd: r.session_end,
  timeZone: r.time_zone,
  archived: r.archived,
  createdAt: r.created_at.getTime(),
});

interface SetupRow {
  id: string;
  name: string;
  description: string | null;
  strategy_id: string | null;
  archived: boolean;
  created_at: Date;
}

const setup = (r: SetupRow): JournalSetup => ({
  id: r.id,
  name: r.name,
  description: r.description,
  strategyId: r.strategy_id,
  archived: r.archived,
  createdAt: r.created_at.getTime(),
});

interface TradeRow {
  id: string;
  account_id: string;
  setup_id: string | null;
  off_plan: boolean;
  market: string;
  side: JournalTrade["side"];
  quality: JournalTrade["quality"];
  opened_at: Date;
  entry: number;
  stop: number;
  size: number;
  point_value: number;
  target: number | null;
  timeframe: string | null;
  context: string | null;
  planned_entry: number | null;
  announcement: string | null;
  capture_url: string | null;
  no_stop: boolean;
  ticket: string | null;
  notes: string | null;
  analysis: JournalTrade["analysis"];
  closed_at: Date | null;
  exit_price: number | null;
  exit_reason: string | null;
  fees: number;
  plan_followed: boolean | null;
  comment: string | null;
  exit_capture_url: string | null;
  mae_r: number | null;
  mfe_r: number | null;
  checks: PlanCheck[];
  plan_answers: Partial<PlanAnswers>;
  errors: JournalTrade["errors"];
  created_at: Date;
  updated_at: Date;
}

const trade = (r: TradeRow, images: string[] = []): JournalTrade => ({
  id: r.id,
  accountId: r.account_id,
  setupId: r.setup_id,
  offPlan: r.off_plan,
  market: r.market,
  side: r.side,
  quality: r.quality,
  openedAt: r.opened_at.getTime(),
  entry: r.entry,
  stop: r.stop,
  size: r.size,
  pointValue: r.point_value,
  target: r.target,
  timeframe: r.timeframe,
  context: r.context,
  plannedEntry: r.planned_entry,
  announcement: r.announcement,
  captureUrl: r.capture_url,
  noStop: r.no_stop,
  ticket: r.ticket,
  notes: r.notes,
  images,
  analysis: r.analysis,
  close:
    r.closed_at && r.exit_price !== null
      ? {
          closedAt: r.closed_at.getTime(),
          exit: r.exit_price,
          exitReason: (r.exit_reason ?? "manual-plan") as NonNullable<JournalTrade["close"]>["exitReason"],
          fees: r.fees,
          comment: r.comment,
          captureUrl: r.exit_capture_url,
          maeR: r.mae_r,
          mfeR: r.mfe_r,
        }
      : null,
  checks: r.checks,
  planAnswers: { ...NO_ANSWERS, ...r.plan_answers },
  errors: r.errors,
  planFollowed: r.plan_followed,
  createdAt: r.created_at.getTime(),
  updatedAt: r.updated_at.getTime(),
});

// ---------- Reading ----------

export async function loadJournal(userId: string) {
  const [accounts, setups, trades, notes, images] = await Promise.all([
    query<AccountRow>("SELECT * FROM journal_accounts WHERE user_id = $1 ORDER BY archived, created_at", [userId]),
    query<SetupRow>("SELECT * FROM journal_setups WHERE user_id = $1 ORDER BY archived, name", [userId]),
    query<TradeRow>("SELECT * FROM journal_trades WHERE user_id = $1 ORDER BY opened_at DESC", [userId]),
    query<{ day: string; text: string; updated_at: Date }>("SELECT to_char(day, 'YYYY-MM-DD') AS day, text, updated_at FROM journal_notes WHERE user_id = $1 ORDER BY day DESC", [userId]),
    // The ids only: each image is fetched by the page when shown.
    query<{ id: string; trade_id: string | null; note_day: string | null }>(
      "SELECT id, trade_id, to_char(note_day, 'YYYY-MM-DD') AS note_day FROM journal_images WHERE user_id = $1 ORDER BY created_at",
      [userId],
    ),
  ]);
  const byTrade = new Map<string, string[]>();
  const byDay = new Map<string, string[]>();
  for (const i of images) {
    const [map, key] = i.trade_id ? [byTrade, i.trade_id] : [byDay, i.note_day!];
    map.set(key, [...(map.get(key) ?? []), i.id]);
  }
  return {
    accounts: accounts.map(account),
    setups: setups.map(setup),
    trades: trades.map((t) => trade(t, byTrade.get(t.id))),
    notes: notes.map((n) => ({ day: n.day, text: n.text, images: byDay.get(n.day) ?? [], updatedAt: n.updated_at.getTime() })),
  };
}

/** Trades still open: the badge on the Journal tab. */
export async function openTrades(userId: string): Promise<number> {
  const r = await queryOne<{ n: string }>("SELECT count(*) AS n FROM journal_trades WHERE user_id = $1 AND closed_at IS NULL", [userId]);
  return Number(r?.n ?? 0);
}

// ---------- Accounts ----------

const ACCOUNT_COLUMNS = ["name", "kind", "currency", "capital", "risk_pct", "max_daily_loss_r", "max_trades_day", "trading_days", "session_start", "session_end", "time_zone"];

const accountValues = (a: AccountInput) => [
  a.name,
  a.kind,
  a.currency,
  a.capital,
  a.riskPct,
  a.maxDailyLossR,
  a.maxTradesDay,
  a.tradingDays,
  a.sessionStart,
  a.sessionEnd,
  a.timeZone,
];

export async function createAccount(user: SessionUser, input: AccountInput): Promise<JournalAccount> {
  const plan = await planOf(user);
  return withUserLock(user, async (run) => {
    const [{ n }] = await run<{ n: string }>("SELECT count(*) AS n FROM journal_accounts WHERE user_id = $1", [user.id]);
    if (Number(n) >= plan.journalAccounts) {
      throw plan.journalAccounts === 1
        ? new QuotaError("L'offre {0:t} garde un seul compte dans le journal. Les offres Trader et Pro en suivent plusieurs : réel, démo, challenge…", [plan.label], {
            plain: "L'offre {0:t} garde un seul compte dans le journal.",
          })
        : new QuotaError("Tu as atteint {0} comptes dans le journal : archive ou supprime un compte pour en ajouter un.", [plan.journalAccounts]);
    }
    const [r] = await run<Record<string, unknown>>(
      `INSERT INTO journal_accounts (id, user_id, ${ACCOUNT_COLUMNS.join(", ")})
       VALUES ($1, $2, ${ACCOUNT_COLUMNS.map((_, i) => `$${i + 3}`).join(", ")}) RETURNING *`,
      [newId(), user.id, ...accountValues(input)],
    );
    return account(r as unknown as AccountRow);
  });
}

export async function updateAccount(userId: string, id: string, input: AccountInput): Promise<JournalAccount | null> {
  const n = ACCOUNT_COLUMNS.length;
  const r = await queryOne<AccountRow>(
    `UPDATE journal_accounts SET ${ACCOUNT_COLUMNS.map((c, i) => `${c} = $${i + 3}`).join(", ")}, archived = coalesce($${n + 3}, archived)
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, ...accountValues(input), input.archived ?? null],
  );
  return r ? account(r) : null;
}

/** Deletes the account and its trades. */
export async function deleteAccount(userId: string, id: string) {
  await query("DELETE FROM journal_accounts WHERE id = $1 AND user_id = $2", [id, userId]);
}

// ---------- Setups ----------

async function checkStrategy(userId: string, strategyId: string | null) {
  if (!strategyId) return;
  const s = await queryOne("SELECT 1 FROM strategies WHERE id = $1 AND user_id = $2", [strategyId, userId]);
  if (!s) throw new UserError("Stratégie introuvable");
}

export async function createSetup(userId: string, input: SetupInput): Promise<JournalSetup> {
  await checkStrategy(userId, input.strategyId);
  const n = await queryOne<{ n: string }>("SELECT count(*) AS n FROM journal_setups WHERE user_id = $1", [userId]);
  if (Number(n?.n ?? 0) >= MAX_SETUPS) throw new UserError("Tu as atteint {0} configurations : archive celles que tu ne trades plus.", [MAX_SETUPS]);
  const r = await queryOne<SetupRow>("INSERT INTO journal_setups (id, user_id, name, description, strategy_id) VALUES ($1, $2, $3, $4, $5) RETURNING *", [
    newId(),
    userId,
    input.name,
    input.description,
    input.strategyId,
  ]);
  return setup(r!);
}

export async function updateSetup(userId: string, id: string, input: SetupInput): Promise<JournalSetup | null> {
  await checkStrategy(userId, input.strategyId);
  const r = await queryOne<SetupRow>(
    `UPDATE journal_setups SET name = $3, description = $4, strategy_id = $5, archived = coalesce($6, archived)
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, input.name, input.description, input.strategyId, input.archived ?? null],
  );
  return r ? setup(r) : null;
}

/** A setup with trades is archived rather than deleted: the trades keep saying which setup they followed. */
export async function deleteSetup(userId: string, id: string): Promise<{ archived: boolean }> {
  const used = await queryOne("SELECT 1 FROM journal_trades WHERE setup_id = $1 AND user_id = $2 LIMIT 1", [id, userId]);
  if (used) {
    await query("UPDATE journal_setups SET archived = true WHERE id = $1 AND user_id = $2", [id, userId]);
    return { archived: true };
  }
  await query("DELETE FROM journal_setups WHERE id = $1 AND user_id = $2", [id, userId]);
  return { archived: false };
}

// ---------- Trades ----------

const DAY = 86_400_000;

/**
 * Checks the account and setup are the user's, then runs the plan's checks as they stand now:
 * the risk against the capital before this trade, the day, the hours and the day's other trades.
 * The result is stored with the trade and not recomputed when the plan changes afterwards.
 */
async function evaluate(userId: string, t: TradeInput, id: string | null): Promise<{ checks: PlanCheck[]; planFollowed: boolean | null }> {
  const a = await queryOne<AccountRow>("SELECT * FROM journal_accounts WHERE id = $1 AND user_id = $2", [t.accountId, userId]);
  if (!a) throw new UserError("Compte introuvable");
  if (t.setupId) {
    const s = await queryOne("SELECT 1 FROM journal_setups WHERE id = $1 AND user_id = $2", [t.setupId, userId]);
    if (!s) throw new UserError("Configuration introuvable");
  }
  const [sum, near] = await Promise.all([
    queryOne<{ pnl: number }>(
      `SELECT coalesce(sum((exit_price - entry) * (CASE WHEN side = 'long' THEN 1 ELSE -1 END) * size * point_value - fees), 0)::float8 AS pnl
       FROM journal_trades WHERE account_id = $1 AND user_id = $2 AND closed_at IS NOT NULL AND id <> $3`,
      [a.id, userId, id ?? ""],
    ),
    // The day's other trades, with margin for the time zones.
    query<TradeRow>("SELECT * FROM journal_trades WHERE account_id = $1 AND user_id = $2 AND id <> $3 AND opened_at > $4 AND opened_at < $5", [
      a.id,
      userId,
      id ?? "",
      new Date(t.openedAt - 3 * DAY),
      new Date(t.openedAt + DAY),
    ]),
  ]);
  const capital = a.capital + (sum?.pnl ?? 0);
  const others = near.map((r) => trade(r)).map((o) => ({ openedAt: o.openedAt, closedAt: o.close?.closedAt ?? null, r: o.close ? resultR(o, o.close) : null }));
  const checks = planChecks({ openedAt: t.openedAt, setupId: t.setupId, riskPct: riskPercent(riskAmount(t), capital), noStop: t.noStop }, account(a), others);
  return { checks, planFollowed: planStatus(checks, t.planAnswers) };
}

const COLUMNS = [
  "account_id",
  "setup_id",
  "off_plan",
  "market",
  "side",
  "quality",
  "opened_at",
  "entry",
  "stop",
  "size",
  "point_value",
  "target",
  "timeframe",
  "context",
  "planned_entry",
  "announcement",
  "capture_url",
  "no_stop",
  "ticket",
  "notes",
  "analysis",
  "closed_at",
  "exit_price",
  "exit_reason",
  "fees",
  "plan_followed",
  "checks",
  "plan_answers",
  "errors",
  "comment",
  "exit_capture_url",
  "mae_r",
  "mfe_r",
];

function values(t: TradeInput, plan: { checks: PlanCheck[]; planFollowed: boolean | null }): unknown[] {
  const c = t.close;
  return [
    t.accountId,
    t.setupId,
    t.setupId ? false : t.offPlan,
    t.market.toUpperCase(),
    t.side,
    t.quality,
    new Date(t.openedAt),
    t.entry,
    t.stop,
    t.size,
    t.pointValue,
    t.target,
    t.timeframe,
    t.context,
    t.plannedEntry,
    t.announcement,
    t.captureUrl,
    t.noStop,
    t.ticket || null,
    t.notes,
    t.analysis ? JSON.stringify(t.analysis) : null,
    c ? new Date(c.closedAt) : null,
    c?.exit ?? null,
    c?.exitReason ?? null,
    c?.fees ?? 0,
    plan.planFollowed,
    // jsonb: pg would send a JS array as a Postgres array.
    JSON.stringify(plan.checks),
    JSON.stringify(t.planAnswers),
    JSON.stringify(t.errors),
    c?.comment ?? null,
    c?.captureUrl ?? null,
    c?.maeR ?? null,
    c?.mfeR ?? null,
  ];
}

export async function createTrade(userId: string, input: TradeInput): Promise<JournalTrade> {
  checkTrade(input);
  const plan = await evaluate(userId, input, null);
  const n = await queryOne<{ n: string }>("SELECT count(*) AS n FROM journal_trades WHERE user_id = $1", [userId]);
  if (Number(n?.n ?? 0) >= MAX_TRADES) throw new UserError("Ton journal a atteint {0} trades : écris-nous pour aller plus loin.", [MAX_TRADES]);
  const params = values(input, plan);
  const r = await queryOne<TradeRow>(
    `INSERT INTO journal_trades (id, user_id, ${COLUMNS.join(", ")}) VALUES ($1, $2, ${COLUMNS.map((_, i) => `$${i + 3}`).join(", ")}) RETURNING *`,
    [newId(), userId, ...params],
  );
  return trade(r!);
}

/**
 * Files a batch of trades read from an outside journal, in order, each with the plan's checks as
 * they stand after the ones before. A trade already in the journal (same ticket on the account,
 * else same market, minute and entry) is skipped, so a file imported twice adds nothing the second time.
 */
export async function importTrades(userId: string, inputs: TradeInput[]): Promise<{ added: number; skipped: number }> {
  inputs.forEach((t, i) => {
    const problem = openProblem(t) ?? (t.close ? closeProblem(t, t.close) : null);
    if (problem) throw new UserError("Trade n° {0} du lot : {1:t}", [i + 1, problem]);
  });
  const n = await queryOne<{ n: string }>("SELECT count(*) AS n FROM journal_trades WHERE user_id = $1", [userId]);
  if (Number(n?.n ?? 0) + inputs.length > MAX_TRADES) throw new UserError("Ton journal a atteint {0} trades : écris-nous pour aller plus loin.", [MAX_TRADES]);
  const accountIds = [...new Set(inputs.map((t) => t.accountId))];
  const times = inputs.map((t) => t.openedAt);
  const existing = await query<{ market: string; opened_at: Date; entry: number; ticket: string | null }>(
    `SELECT market, opened_at, entry, ticket FROM journal_trades
     WHERE user_id = $1 AND account_id = ANY($2) AND (ticket IS NOT NULL OR (opened_at >= $3 AND opened_at <= $4))`,
    [userId, accountIds, new Date(Math.min(...times) - 60_000), new Date(Math.max(...times) + 60_000)],
  );
  const seen = new Set(existing.map((r) => importKey({ market: r.market, openedAt: r.opened_at.getTime(), entry: Number(r.entry), ticket: r.ticket })));
  // Same key without the ticket: a trade typed by hand, then found in the platform's report.
  existing.forEach((r) => seen.add(importKey({ market: r.market, openedAt: r.opened_at.getTime(), entry: Number(r.entry), ticket: null })));
  let added = 0;
  let skipped = 0;
  for (const t of inputs) {
    const keys = [importKey({ market: t.market, openedAt: t.openedAt, entry: t.entry, ticket: t.ticket }), importKey({ market: t.market, openedAt: t.openedAt, entry: t.entry, ticket: null })];
    if (keys.some((k) => seen.has(k))) {
      skipped++;
      continue;
    }
    const plan = await evaluate(userId, t, null);
    await query(`INSERT INTO journal_trades (id, user_id, ${COLUMNS.join(", ")}) VALUES ($1, $2, ${COLUMNS.map((_, i) => `$${i + 3}`).join(", ")})`, [
      newId(),
      userId,
      ...values(t, plan),
    ]);
    keys.forEach((k) => seen.add(k));
    added++;
  }
  return { added, skipped };
}

/** Replaces the whole trade: the form sends everything, a closed trade can be reopened by sending close: null. */
export async function updateTrade(userId: string, id: string, input: TradeInput): Promise<JournalTrade | null> {
  checkTrade(input);
  const plan = await evaluate(userId, input, id);
  const r = await queryOne<TradeRow>(
    `UPDATE journal_trades SET ${COLUMNS.map((c, i) => `${c} = $${i + 3}`).join(", ")}, updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, ...values(input, plan)],
  );
  return r ? trade(r) : null;
}

export async function deleteTrade(userId: string, id: string) {
  await query("DELETE FROM journal_trades WHERE id = $1 AND user_id = $2", [id, userId]);
}
