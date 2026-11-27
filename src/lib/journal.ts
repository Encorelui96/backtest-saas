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
export interface JournalAccount extends AccountPlan {
  id: string;
  name: string;
  kind: AccountKind;
  currency: string;
  capital: number;
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
  /** The plan's rules this trade broke, checked when it was saved. */
  checks: PlanCheck[];
  planAnswers: PlanAnswers;
  errors: TradeError[];
  /** In the plan (true), out of it (false), or not known yet (null): see planStatus. */
  planFollowed: boolean | null;
  createdAt: number;
  updatedAt: number;
}

/** What the trades list shows for a closed trade: its result in R and in the account's currency. */
export function closedResult(t: JournalTrade, currency: string): ClosedTrade | null {
  if (!t.close) return null;
  const c = { exit: t.close.exit, closedAt: t.close.closedAt, fees: t.close.fees };
  return { r: resultR(t, c), amount: resultAmount(t, c), currency };
}

// ---------- The account's plan and its automatic checks ----------

/**
 * The few rules of a trading plan the journal can check by itself. null: no rule.
 * The days and hours are read in the plan's time zone.
 */
export interface AccountPlan {
  /** Planned risk per trade, % of the capital. */
  riskPct: number;
  /** Stop trading for the day after losing this many R. */
  maxDailyLossR: number | null;
  maxTradesDay: number | null;
  /** Days allowed, bit 0 for Monday to bit 6 for Sunday. */
  tradingDays: number | null;
  /** "09:00" to "17:30"; a window that crosses midnight works too ("22:00" to "02:00"). */
  sessionStart: string | null;
  sessionEnd: string | null;
  timeZone: string;
}

export const ALL_DAYS = 0b1111111;
export const WEEK_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;

export const PLAN_CHECKS = ["no-setup", "risk", "day", "hours", "daily-loss", "max-trades"] as const;
export type PlanCheck = (typeof PLAN_CHECKS)[number];
export const PLAN_CHECK_LABELS: Record<PlanCheck, string> = {
  "no-setup": "Trade sans configuration du plan",
  risk: "Risque au-dessus du plan",
  day: "Jour non prévu par le plan",
  hours: "En dehors des horaires du plan",
  "daily-loss": "Perte max du jour déjà atteinte",
  "max-trades": "Nombre max de trades du jour déjà atteint",
};

/** The trader's own answers to the three points the app can't check (see J4.1 in the book). */
export interface PlanAnswers {
  /** The setup was complete, with all its conditions. */
  setup: boolean | null;
  /** Entered at the planned trigger, neither early nor chasing. */
  entry: boolean | null;
  /** Managed and closed as the plan says. */
  exit: boolean | null;
}

export const NO_ANSWERS: PlanAnswers = { setup: null, entry: null, exit: null };

/** "09:30" → 570, null when it isn't an hour. */
export function minutesOf(hhmm: string | null): number | null {
  const m = hhmm ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** One formatter per time zone: building one costs far more than using it, and the calendar reads thousands of trades. */
const FORMATS = new Map<string, Intl.DateTimeFormat>();

/** The day (2026-11-27), weekday (0 = Monday) and minute of the day of a moment, in a time zone. */
export function localTime(t: number, timeZone: string) {
  let f = FORMATS.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
    FORMATS.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday),
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

/** Another trade of the same account, as the daily checks need it. */
export interface OtherTrade {
  openedAt: number;
  closedAt: number | null;
  /** Result in R once closed. */
  r: number | null;
}

/**
 * The plan's rules a trade breaks, at the moment it opens. `riskPct` is its risk as a % of the
 * capital (null when unknown). The daily rules count the account's other trades of the same day:
 * the losses already closed and the trades already opened before this one.
 */
export function planChecks(
  t: { openedAt: number; setupId: string | null; riskPct: number | null },
  plan: AccountPlan,
  others: OtherTrade[],
): PlanCheck[] {
  const failed: PlanCheck[] = [];
  if (!t.setupId) failed.push("no-setup");
  if (t.riskPct !== null && t.riskPct > plan.riskPct * 1.1) failed.push("risk");
  const at = localTime(t.openedAt, plan.timeZone);
  if (plan.tradingDays !== null && !(plan.tradingDays & (1 << at.weekday))) failed.push("day");
  const start = minutesOf(plan.sessionStart);
  const end = minutesOf(plan.sessionEnd);
  if (start !== null && end !== null && start !== end) {
    const inside = start < end ? at.minutes >= start && at.minutes < end : at.minutes >= start || at.minutes < end;
    if (!inside) failed.push("hours");
  }
  const sameDay = (x: number) => localTime(x, plan.timeZone).day === at.day;
  if (plan.maxDailyLossR !== null) {
    const lost = others
      .filter((o) => o.closedAt !== null && o.r !== null && o.closedAt <= t.openedAt && sameDay(o.closedAt))
      .reduce((a, o) => a + (o.r ?? 0), 0);
    if (lost <= -plan.maxDailyLossR) failed.push("daily-loss");
  }
  if (plan.maxTradesDay !== null) {
    const before = others.filter((o) => o.openedAt < t.openedAt && sameDay(o.openedAt)).length;
    if (before >= plan.maxTradesDay) failed.push("max-trades");
  }
  return failed;
}

/** In the plan only if no rule broke and the three answers are yes; out of it at the first no. */
export function planStatus(checks: PlanCheck[], a: PlanAnswers): boolean | null {
  if (checks.length || a.setup === false || a.entry === false || a.exit === false) return false;
  return a.setup && a.entry && a.exit ? true : null;
}

// ---------- The error register (J4.5 in the book) ----------

export const ERROR_CODES = ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8"] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
export const ERROR_LABELS: Record<ErrorCode, string> = {
  E1: "Entrée hors plan",
  E2: "Entrée anticipée ou en rattrapage",
  E3: "Stop déplacé ou retiré",
  E4: "Taille trop grosse",
  E5: "Sortie trop tôt",
  E6: "Sortie trop tard",
  E7: "Trade en période interdite",
  E8: "Revenge trade",
};

export interface TradeError {
  code: ErrorCode;
  /** What the error cost, in R: the real result minus what the plan would have given. A winning error costs a positive R. */
  costR: number | null;
}

/** The errors the checks and the answers point to; the trader picks. */
export function suggestedErrors(checks: PlanCheck[], a: PlanAnswers): ErrorCode[] {
  const s = new Set<ErrorCode>();
  if (checks.includes("no-setup") || checks.includes("max-trades") || a.setup === false) s.add("E1");
  if (a.entry === false) s.add("E2");
  if (checks.includes("risk")) s.add("E4");
  if (a.exit === false) {
    s.add("E5");
    s.add("E6");
  }
  if (checks.includes("day") || checks.includes("hours")) s.add("E7");
  if (checks.includes("daily-loss")) s.add("E8");
  return ERROR_CODES.filter((c) => s.has(c));
}

/**
 * The cost the app can work out, null when the trader has to estimate it. `r`: the trade's result;
 * `riskRatio`: its risk divided by the planned risk.
 * A trade the plan wouldn't have taken (E1, E7, E8) costs its whole result; a moved stop the loss
 * beyond −1R; a too big size the extra loss (or gain), measured in the plan's R.
 */
export function proposedCost(code: ErrorCode, r: number | null, riskRatio: number | null): number | null {
  const cost = (() => {
    if (r === null) return null;
    if (code === "E1" || code === "E7" || code === "E8") return r;
    if (code === "E3") return r < -1 ? r + 1 : 0;
    if (code === "E4") return riskRatio !== null && riskRatio > 1 ? r * (riskRatio - 1) : null;
    return null;
  })();
  // Two decimals: −0.5000000000000568 is what floating point makes of −1.5 + 1.
  return cost === null ? null : Math.round(cost * 100) / 100 || 0;
}

export interface Discipline {
  /** Trades whose plan status is known. */
  judged: number;
  inPlan: number;
  /** Share of judged trades in the plan, 0 to 1. */
  rate: number | null;
  /** Average R of the trades in the plan (the method) and out of it (the discipline). */
  inPlanR: number | null;
  offPlanR: number | null;
  /** Per error code: how many and what they cost; total of the known costs. */
  register: { code: ErrorCode; count: number; costR: number }[];
  costR: number;
}

/** Splits the method from the discipline, over closed trades. */
export function discipline(trades: { planFollowed: boolean | null; r: number | null; errors: TradeError[] }[]): Discipline {
  const judged = trades.filter((t) => t.planFollowed !== null);
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const register = ERROR_CODES.map((code) => {
    const hits = trades.flatMap((t) => t.errors.filter((e) => e.code === code));
    return { code, count: hits.length, costR: hits.reduce((a, e) => a + (e.costR ?? 0), 0) };
  }).filter((x) => x.count > 0);
  const inPlan = judged.filter((t) => t.planFollowed);
  return {
    judged: judged.length,
    inPlan: inPlan.length,
    rate: judged.length ? inPlan.length / judged.length : null,
    inPlanR: avg(inPlan.map((t) => t.r)),
    offPlanR: avg(judged.filter((t) => !t.planFollowed).map((t) => t.r)),
    register,
    costR: register.reduce((a, x) => a + x.costR, 0),
  };
}
