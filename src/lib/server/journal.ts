import "server-only";
import { z } from "zod";
import {
  ACCOUNT_KINDS,
  CURRENCIES,
  EXIT_REASONS,
  MAX_SETUPS,
  MAX_TRADES,
  closeProblem,
  isWebLink,
  openProblem,
  type JournalAccount,
  type JournalSetup,
  type JournalTrade,
} from "../journal";
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

export const AccountInput = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(ACCOUNT_KINDS),
  currency: z.enum(CURRENCIES),
  capital: z.number().positive().max(1e12),
  riskPct: z.number().positive().max(100),
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
  planFollowed: z.boolean().nullable(),
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
  close: CloseInput.nullable(),
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
  closed_at: Date | null;
  exit_price: number | null;
  exit_reason: string | null;
  fees: number;
  plan_followed: boolean | null;
  comment: string | null;
  exit_capture_url: string | null;
  mae_r: number | null;
  mfe_r: number | null;
  created_at: Date;
  updated_at: Date;
}

const trade = (r: TradeRow): JournalTrade => ({
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
  close:
    r.closed_at && r.exit_price !== null
      ? {
          closedAt: r.closed_at.getTime(),
          exit: r.exit_price,
          exitReason: (r.exit_reason ?? "manual-plan") as NonNullable<JournalTrade["close"]>["exitReason"],
          fees: r.fees,
          planFollowed: r.plan_followed,
          comment: r.comment,
          captureUrl: r.exit_capture_url,
          maeR: r.mae_r,
          mfeR: r.mfe_r,
        }
      : null,
  createdAt: r.created_at.getTime(),
  updatedAt: r.updated_at.getTime(),
});

// ---------- Reading ----------

export async function loadJournal(userId: string) {
  const [accounts, setups, trades] = await Promise.all([
    query<AccountRow>("SELECT * FROM journal_accounts WHERE user_id = $1 ORDER BY archived, created_at", [userId]),
    query<SetupRow>("SELECT * FROM journal_setups WHERE user_id = $1 ORDER BY archived, name", [userId]),
    query<TradeRow>("SELECT * FROM journal_trades WHERE user_id = $1 ORDER BY opened_at DESC", [userId]),
  ]);
  return { accounts: accounts.map(account), setups: setups.map(setup), trades: trades.map(trade) };
}

/** Trades still open: the badge on the Journal tab. */
export async function openTrades(userId: string): Promise<number> {
  const r = await queryOne<{ n: string }>("SELECT count(*) AS n FROM journal_trades WHERE user_id = $1 AND closed_at IS NULL", [userId]);
  return Number(r?.n ?? 0);
}

// ---------- Accounts ----------

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
      "INSERT INTO journal_accounts (id, user_id, name, kind, currency, capital, risk_pct) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [newId(), user.id, input.name, input.kind, input.currency, input.capital, input.riskPct],
    );
    return account(r as unknown as AccountRow);
  });
}

export async function updateAccount(userId: string, id: string, input: AccountInput): Promise<JournalAccount | null> {
  const r = await queryOne<AccountRow>(
    `UPDATE journal_accounts SET name = $3, kind = $4, currency = $5, capital = $6, risk_pct = $7, archived = coalesce($8, archived)
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, input.name, input.kind, input.currency, input.capital, input.riskPct, input.archived ?? null],
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

/** The account and setup must be the user's. */
async function checkLinks(userId: string, t: TradeInput) {
  const a = await queryOne("SELECT 1 FROM journal_accounts WHERE id = $1 AND user_id = $2", [t.accountId, userId]);
  if (!a) throw new UserError("Compte introuvable");
  if (t.setupId) {
    const s = await queryOne("SELECT 1 FROM journal_setups WHERE id = $1 AND user_id = $2", [t.setupId, userId]);
    if (!s) throw new UserError("Configuration introuvable");
  }
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
  "closed_at",
  "exit_price",
  "exit_reason",
  "fees",
  "plan_followed",
  "comment",
  "exit_capture_url",
  "mae_r",
  "mfe_r",
];

function values(t: TradeInput): unknown[] {
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
    c ? new Date(c.closedAt) : null,
    c?.exit ?? null,
    c?.exitReason ?? null,
    c?.fees ?? 0,
    c?.planFollowed ?? null,
    c?.comment ?? null,
    c?.captureUrl ?? null,
    c?.maeR ?? null,
    c?.mfeR ?? null,
  ];
}

export async function createTrade(userId: string, input: TradeInput): Promise<JournalTrade> {
  checkTrade(input);
  await checkLinks(userId, input);
  const n = await queryOne<{ n: string }>("SELECT count(*) AS n FROM journal_trades WHERE user_id = $1", [userId]);
  if (Number(n?.n ?? 0) >= MAX_TRADES) throw new UserError("Ton journal a atteint {0} trades : écris-nous pour aller plus loin.", [MAX_TRADES]);
  const params = values(input);
  const r = await queryOne<TradeRow>(
    `INSERT INTO journal_trades (id, user_id, ${COLUMNS.join(", ")}) VALUES ($1, $2, ${COLUMNS.map((_, i) => `$${i + 3}`).join(", ")}) RETURNING *`,
    [newId(), userId, ...params],
  );
  return trade(r!);
}

/** Replaces the whole trade: the form sends everything, a closed trade can be reopened by sending close: null. */
export async function updateTrade(userId: string, id: string, input: TradeInput): Promise<JournalTrade | null> {
  checkTrade(input);
  await checkLinks(userId, input);
  const r = await queryOne<TradeRow>(
    `UPDATE journal_trades SET ${COLUMNS.map((c, i) => `${c} = $${i + 3}`).join(", ")}, updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, ...values(input)],
  );
  return r ? trade(r) : null;
}

export async function deleteTrade(userId: string, id: string) {
  await query("DELETE FROM journal_trades WHERE id = $1 AND user_id = $2", [id, userId]);
}
