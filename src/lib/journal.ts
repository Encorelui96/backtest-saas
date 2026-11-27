/**
 * The trading journal: its vocabulary and calculations, shared by the server (checks before saving)
 * and the pages (live preview in the form, summary of the list).
 *
 * Everything is measured in R, the result compared to the risk taken at entry: 1R is what the
 * initial stop would have cost. R doesn't depend on the size or the currency, so trades on
 * different markets and accounts add up. Amounts in the account's currency come on top.
 */

export type Side = "long" | "short";
export type Quality = "A" | "B" | "C";

export const ACCOUNT_KINDS = ["real", "demo", "challenge", "funded"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];
export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  real: "Compte réel",
  demo: "Compte démo",
  challenge: "Challenge prop firm",
  funded: "Compte financé",
};

export const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const EXIT_REASONS = ["stop", "target", "trailing", "breakeven", "manual-plan", "manual-off-plan", "session-end"] as const;
export type ExitReason = (typeof EXIT_REASONS)[number];
export const EXIT_REASON_LABELS: Record<ExitReason, string> = {
  stop: "Stop touché",
  target: "Objectif atteint",
  trailing: "Stop suiveur",
  breakeven: "Stop au point mort",
  "manual-plan": "Sortie manuelle prévue par le plan",
  "manual-off-plan": "Sortie manuelle hors plan",
  "session-end": "Fin de séance",
};

/** Limits per account, so a script can't fill the database. */
export const MAX_TRADES = 20_000;
export const MAX_SETUPS = 50;
/** Accounts a paid plan can keep; the free plan has one (see plans.ts). */
export const MAX_ACCOUNTS = 20;

/**
 * What one unit of size gains when the price moves by 1, in the account's currency, for the markets
 * where it doesn't depend on the broker: a standard forex lot quoted in dollars is 100 000 units,
 * a gold lot 100 ounces, a crypto or a share counts one for one. null: the trader says it.
 */
export function defaultPointValue(market: string): number | null {
  const m = market.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD"].includes(m)) return 100_000;
  if (m === "XAUUSD") return 100;
  if (m === "QQQ" || m === "SPY") return 1;
  if (/^[A-Z0-9]{2,10}(USDT|USDC|FDUSD)$/.test(m)) return 1;
  return null;
}

/** The size unit to name in the form: lots where brokers count in lots. */
export function sizeUnit(market: string): "lots" | "units" {
  const v = defaultPointValue(market);
  return v !== null && v > 1 ? "lots" : "units";
}

export interface OpenFields {
  side: Side;
  entry: number;
  stop: number;
  size: number;
  /** What the size gains for a move of 1 in the price, in the account's currency. */
  pointValue: number;
  target?: number | null;
  openedAt: number;
}

export interface CloseFields {
  exit: number;
  closedAt: number;
  fees: number;
}

const dir = (side: Side) => (side === "long" ? 1 : -1);

/** 1R in the account's currency: what the initial stop costs, fees aside. */
export function riskAmount(t: Pick<OpenFields, "entry" | "stop" | "size" | "pointValue">): number {
  return Math.abs(t.entry - t.stop) * t.size * t.pointValue;
}

/** The risk as a % of the capital, null without capital. */
export function riskPercent(risk: number, capital: number): number | null {
  return capital > 0 ? (risk / capital) * 100 : null;
}

/** Where the target sits, in R: 2 for a target twice as far as the stop. */
export function targetR(t: Pick<OpenFields, "side" | "entry" | "stop" | "target">): number | null {
  if (t.target === null || t.target === undefined) return null;
  const unit = Math.abs(t.entry - t.stop);
  return unit > 0 ? ((t.target - t.entry) * dir(t.side)) / unit : null;
}

/** The result in the account's currency, fees taken off. */
export function resultAmount(t: OpenFields, c: CloseFields): number {
  return (c.exit - t.entry) * dir(t.side) * t.size * t.pointValue - c.fees;
}

/** The result in R, fees taken off, against the initial stop even if it was moved since. */
export function resultR(t: OpenFields, c: CloseFields): number | null {
  const risk = riskAmount(t);
  return risk > 0 ? resultAmount(t, c) / risk : null;
}

/**
 * What makes a trade impossible to save, as a French text that is also its translation key;
 * null when it reads well. The form shows it before sending, the server refuses with it.
 */
export function openProblem(t: OpenFields): string | null {
  if (!(t.entry > 0) || !(t.stop > 0)) return "L'entrée et le stop doivent être des prix positifs.";
  if (t.entry === t.stop) return "Le stop doit être différent de l'entrée : c'est lui qui fixe ton risque (1R).";
  if (t.side === "long" && t.stop > t.entry) return "Pour un achat, le stop se place sous l'entrée.";
  if (t.side === "short" && t.stop < t.entry) return "Pour une vente, le stop se place au-dessus de l'entrée.";
  if (!(t.size > 0)) return "La taille doit être positive.";
  if (!(t.pointValue > 0)) return "La valeur du point doit être positive.";
  if (t.target !== null && t.target !== undefined) {
    if (!(t.target > 0)) return "L'objectif doit être un prix positif.";
    if ((t.target - t.entry) * dir(t.side) <= 0) return t.side === "long" ? "Pour un achat, l'objectif se place au-dessus de l'entrée." : "Pour une vente, l'objectif se place sous l'entrée.";
  }
  return null;
}

export function closeProblem(t: OpenFields, c: CloseFields): string | null {
  if (!(c.exit > 0)) return "Le prix de sortie doit être positif.";
  if (!(c.fees >= 0)) return "Les frais ne peuvent pas être négatifs.";
  if (c.closedAt < t.openedAt) return "La sortie ne peut pas précéder l'entrée.";
  return null;
}

/** Only web addresses: a capture link is shown as a link, never loaded as an image. */
export function isWebLink(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export interface ClosedTrade {
  /** Result in R, null when the risk was zero. */
  r: number | null;
  amount: number;
  currency: string;
}

export interface JournalSummary {
  closed: number;
  wins: number;
  losses: number;
  /** Share of closed trades in gain, 0 to 1. */
  winRate: number | null;
  /** Average result per trade, in R: the expectancy. */
  expectancy: number | null;
  /** Sum of the gains divided by the sum of the losses, in R; null without a loss. */
  profitFactor: number | null;
  totalR: number;
  avgWinR: number | null;
  avgLossR: number | null;
  bestR: number | null;
  worstR: number | null;
  /** Total in the trades' currency, null when they mix currencies. */
  amount: { value: number; currency: string } | null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** The basic statistics of a list of closed trades. Trades without a measurable risk count in the amounts only. */
export function summarize(trades: ClosedTrade[]): JournalSummary {
  const rs = trades.map((t) => t.r).filter((r): r is number => r !== null && Number.isFinite(r));
  const wins = trades.filter((t) => t.amount > 0).length;
  const losses = trades.filter((t) => t.amount < 0).length;
  const winRs = rs.filter((r) => r > 0);
  const lossRs = rs.filter((r) => r < 0);
  const gains = winRs.reduce((a, b) => a + b, 0);
  const pains = -lossRs.reduce((a, b) => a + b, 0);
  const currencies = new Set(trades.map((t) => t.currency));
  return {
    closed: trades.length,
    wins,
    losses,
    winRate: trades.length ? wins / trades.length : null,
    expectancy: mean(rs),
    profitFactor: pains > 0 ? gains / pains : null,
    totalR: rs.reduce((a, b) => a + b, 0),
    avgWinR: mean(winRs),
    avgLossR: mean(lossRs),
    bestR: rs.length ? Math.max(...rs) : null,
    worstR: rs.length ? Math.min(...rs) : null,
    amount: currencies.size === 1 ? { value: trades.reduce((a, t) => a + t.amount, 0), currency: [...currencies][0] } : null,
  };
}

/** The account's capital now: the start plus every closed trade's result. */
export function balance(capital: number, amounts: number[]): number {
  return amounts.reduce((a, b) => a + b, capital);
}

/** The journal as the API sends it. Times are milliseconds since 1970. */
export interface JournalAccount {
  id: string;
  name: string;
  kind: AccountKind;
  currency: string;
  capital: number;
  riskPct: number;
  archived: boolean;
  createdAt: number;
}

export interface JournalSetup {
  id: string;
  name: string;
  description: string | null;
  strategyId: string | null;
  archived: boolean;
  createdAt: number;
}

export interface TradeClose {
  closedAt: number;
  exit: number;
  exitReason: ExitReason;
  fees: number;
  /** Did the trade follow the plan, as the trader judges it. */
  planFollowed: boolean | null;
  comment: string | null;
  captureUrl: string | null;
  /** How far the trade went against (MAE) and for (MFE) the trader before closing, in R. */
  maeR: number | null;
  mfeR: number | null;
}

export interface JournalTrade {
  id: string;
  accountId: string;
  setupId: string | null;
  offPlan: boolean;
  market: string;
  side: Side;
  quality: Quality | null;
  openedAt: number;
  entry: number;
  stop: number;
  size: number;
  pointValue: number;
  target: number | null;
  timeframe: string | null;
  context: string | null;
  plannedEntry: number | null;
  announcement: string | null;
  captureUrl: string | null;
  close: TradeClose | null;
  createdAt: number;
  updatedAt: number;
}

/** What the trades list shows for a closed trade: its result in R and in the account's currency. */
export function closedResult(t: JournalTrade, currency: string): ClosedTrade | null {
  if (!t.close) return null;
  const c = { exit: t.close.exit, closedAt: t.close.closedAt, fees: t.close.fees };
  return { r: resultR(t, c), amount: resultAmount(t, c), currency };
}
