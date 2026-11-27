/**
 * The journal's calendar, dashboard and filters: pure calculations over the closed trades, shared
 * by the pages and the tests. A trade counts on the day it closes, when its result is known. Days
 * and hours are read in its account's time zone, the one its plan uses.
 */

import { closedResult, localTime, summarize, type JournalAccount, type JournalSummary, type JournalTrade, type Quality, type Side, type TradeError } from "./journal";

/** Under this many trades a figure is only an indication: a few lucky trades can still make it (J09 in the book). */
export const MIN_SAMPLE = 30;

const DAY = 86_400_000;

/** A closed trade as the statistics read it. */
export interface StatTrade {
  id: string;
  accountId: string;
  setupId: string | null;
  offPlan: boolean;
  market: string;
  side: Side;
  quality: Quality | null;
  openedAt: number;
  closedAt: number;
  /** Result in R, net of fees; null when the risk was zero. */
  r: number | null;
  amount: number;
  currency: string;
  planFollowed: boolean | null;
  errors: TradeError[];
  /** The closing day, "2026-11-27", in the account's time zone. */
  day: string;
  /** The opening weekday (0 = Monday) and hour (0 to 23), in the account's time zone. */
  weekday: number;
  hour: number;
}

/** The closed trades, oldest first, with their result and local times worked out once. */
export function statTrades(trades: JournalTrade[], accounts: JournalAccount[]): StatTrade[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  return trades
    .filter((t) => t.close)
    .map((t) => {
      const a = byId.get(t.accountId);
      const currency = a?.currency ?? "USD";
      const timeZone = a?.timeZone ?? "Europe/Paris";
      const res = closedResult(t, currency)!;
      const opened = localTime(t.openedAt, timeZone);
      return {
        id: t.id,
        accountId: t.accountId,
        setupId: t.setupId,
        offPlan: t.offPlan,
        market: t.market,
        side: t.side,
        quality: t.quality,
        openedAt: t.openedAt,
        closedAt: t.close!.closedAt,
        r: res.r,
        amount: res.amount,
        currency,
        planFollowed: t.planFollowed,
        errors: t.errors,
        day: localTime(t.close!.closedAt, timeZone).day,
        weekday: opened.weekday,
        hour: Math.floor(opened.minutes / 60),
      };
    })
    .sort((x, y) => x.closedAt - y.closedAt || x.openedAt - y.openedAt || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

/** The basic statistics of a list of stat trades. */
export function summaryOf(trades: StatTrade[]): JournalSummary {
  return summarize(trades.map((t) => ({ r: t.r, amount: t.amount, currency: t.currency })));
}

// ---------- Days and months, as "2026-11-27" and "2026-11" ----------

function utcDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function shiftDay(day: string, by: number) {
  return dayKey(utcDay(day) + by * DAY);
}

export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

// ---------- Filters ----------

export const PERIODS = ["all", "month", "last-month", "90d", "year"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABELS: Record<Period, string> = {
  all: "Depuis le début",
  month: "Ce mois-ci",
  "last-month": "Le mois dernier",
  "90d": "90 derniers jours",
  year: "Cette année",
};

export interface TradeFilter {
  /** "" for every account. */
  accountId: string;
  /** "" for every setup, "off" for the trades outside any setup. */
  setupId: string;
  /** "" for all, else in or out of the plan. */
  plan: "" | "in" | "out";
  period: Period;
  /** When the period was picked: "this month" is the month of that moment. */
  now: number;
  /** The device's time zone, where the period's days are read. */
  timeZone: string;
}

export const NO_FILTER: TradeFilter = { accountId: "", setupId: "", plan: "", period: "all", now: 0, timeZone: "Europe/Paris" };

/** The period's first and last days, both included; null for no bound. */
export function periodDays(period: Period, now: number, timeZone: string): { from: string | null; to: string | null } {
  if (period === "all") return { from: null, to: null };
  const today = localTime(now, timeZone).day;
  const month = today.slice(0, 7);
  if (period === "month") return { from: `${month}-01`, to: null };
  if (period === "year") return { from: `${today.slice(0, 4)}-01-01`, to: null };
  if (period === "last-month") {
    const before = shiftMonth(month, -1);
    // "-31" sorts after every day of the month, whatever its length.
    return { from: `${before}-01`, to: `${before}-31` };
  }
  return { from: shiftDay(today, -89), to: null };
}

/** Whether a trade, open or closed, belongs to the setup filter. */
export function matchesSetup(t: { setupId: string | null }, setupId: string) {
  return !setupId || (setupId === "off" ? !t.setupId : t.setupId === setupId);
}

export function filterTrades(trades: StatTrade[], f: TradeFilter, period = true): StatTrade[] {
  const { from, to } = period ? periodDays(f.period, f.now, f.timeZone) : { from: null, to: null };
  return trades.filter(
    (t) =>
      (!f.accountId || t.accountId === f.accountId) &&
      matchesSetup(t, f.setupId) &&
      (f.plan !== "in" || t.planFollowed === true) &&
      (f.plan !== "out" || t.planFollowed === false) &&
      (!from || t.day >= from) &&
      (!to || t.day <= to),
  );
}

// ---------- The calendar ----------

export interface CalendarDay {
  day: string;
  /** Day of the month, 1 to 31. */
  date: number;
  /** False for the days of the months around, which fill the first and last weeks. */
  inMonth: boolean;
  trades: StatTrade[];
  /** Sum of the R of its trades. */
  r: number;
}

export interface CalendarWeek {
  days: CalendarDay[];
  trades: number;
  r: number;
}

export interface CalendarMonth {
  month: string;
  weeks: CalendarWeek[];
  trades: number;
  r: number;
  /** Days with at least one trade, in gain and in loss. */
  activeDays: number;
  greenDays: number;
  redDays: number;
}

function pushTo<T>(map: Map<string, T[]>, key: string, item: T) {
  const list = map.get(key);
  if (list) list.push(item);
  else map.set(key, [item]);
}

const sumR = (ts: StatTrade[]) => ts.reduce((a, t) => a + (t.r ?? 0), 0);

/** A month in weeks from Monday to Sunday. Weeks and the month only add the days of the month. */
export function calendarMonth(month: string, trades: StatTrade[]): CalendarMonth {
  const byDay = new Map<string, StatTrade[]>();
  for (const t of trades) if (t.day.startsWith(month)) pushTo(byDay, t.day, t);
  const first = utcDay(`${month}-01`);
  const lead = (new Date(first).getUTCDay() + 6) % 7;
  const [y, m] = month.split("-").map(Number);
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks: CalendarWeek[] = [];
  for (let i = 0; i < Math.ceil((lead + length) / 7) * 7; i++) {
    const day = dayKey(first + (i - lead) * DAY);
    const inMonth = day.startsWith(month);
    const ts = inMonth ? (byDay.get(day) ?? []) : [];
    if (i % 7 === 0) weeks.push({ days: [], trades: 0, r: 0 });
    const week = weeks[weeks.length - 1];
    week.days.push({ day, date: Number(day.slice(8)), inMonth, trades: ts, r: sumR(ts) });
    week.trades += ts.length;
    week.r += sumR(ts);
  }
  const days = weeks.flatMap((w) => w.days).filter((d) => d.trades.length);
  return {
    month,
    weeks,
    trades: days.reduce((a, d) => a + d.trades.length, 0),
    r: days.reduce((a, d) => a + d.r, 0),
    activeDays: days.length,
    greenDays: days.filter((d) => d.r > 0).length,
    redDays: days.filter((d) => d.r < 0).length,
  };
}

// ---------- The dashboard ----------

export interface CurvePoint {
  /** Trade number, from 1. */
  n: number;
  id: string;
  closedAt: number;
  market: string;
  r: number;
  /** R added up to this trade. */
  total: number;
}

/** The R added up trade after trade, for the trades whose risk was measured. */
export function rCurve(trades: StatTrade[]): CurvePoint[] {
  let total = 0;
  return trades
    .filter((t): t is StatTrade & { r: number } => t.r !== null && Number.isFinite(t.r))
    .map((t, i) => {
      total += t.r;
      return { n: i + 1, id: t.id, closedAt: t.closedAt, market: t.market, r: t.r, total };
    });
}

export interface Drawdown {
  /** The deepest fall from a peak, in R: 0 or below. */
  depth: number;
  /** Trade numbers of the peak (0: the start) and of the bottom. */
  peak: number;
  trough: number;
  /** The curve went back above the peak afterwards. */
  recovered: boolean;
}

/** The max drawdown in R, measured from the start (0R) and every new high. null without trades. */
export function maxDrawdown(curve: CurvePoint[]): Drawdown | null {
  if (!curve.length) return null;
  let high = 0;
  let highN = 0;
  let worst: Drawdown = { depth: 0, peak: 0, trough: 0, recovered: true };
  let worstHigh = 0;
  for (const p of curve) {
    if (p.total > high) {
      high = p.total;
      highN = p.n;
    }
    if (p.total - high < worst.depth) {
      worst = { depth: p.total - high, peak: highN, trough: p.n, recovered: false };
      worstHigh = high;
    }
  }
  worst.recovered = worst.depth === 0 || curve.some((p) => p.n > worst.trough && p.total >= worstHigh);
  return worst;
}

/** The longest runs of winning and losing trades, and the run in progress. A trade at exactly 0 ends both. */
export function streaks(trades: { amount: number }[]): { wins: number; losses: number; current: { win: boolean; length: number } | null } {
  let wins = 0;
  let losses = 0;
  let run = 0;
  for (const t of trades) {
    const sign = Math.sign(t.amount);
    run = sign === 0 ? 0 : Math.sign(run) === sign ? run + sign : sign;
    wins = Math.max(wins, run);
    losses = Math.max(losses, -run);
  }
  return { wins, losses, current: run ? { win: run > 0, length: Math.abs(run) } : null };
}

export const GROUPINGS = ["setup", "market", "hour", "weekday", "side", "quality", "plan"] as const;
export type Grouping = (typeof GROUPINGS)[number];
export const GROUPING_LABELS: Record<Grouping, string> = {
  setup: "Configuration",
  market: "Marché",
  hour: "Heure d'entrée",
  weekday: "Jour",
  side: "Sens",
  quality: "Qualité",
  plan: "Plan",
};

export interface Group {
  /** Setup id or "off" / "none", market in capitals, "09" for 9 a.m., "0" for Monday, "long", "A", "in"… */
  key: string;
  /** The market as first written, for the market grouping; null for the others. */
  label: string | null;
  summary: JournalSummary;
  /** Fewer than MIN_SAMPLE trades: an indication only. */
  indicative: boolean;
}

const FIXED_ORDER: Partial<Record<Grouping, string[]>> = {
  side: ["long", "short"],
  quality: ["A", "B", "C", "none"],
  plan: ["in", "out", "unknown"],
};

/** The closed trades split by one criterion, each part with its own statistics. */
export function groupTrades(trades: StatTrade[], by: Grouping): Group[] {
  const keyOf = (t: StatTrade): string => {
    if (by === "setup") return t.setupId ?? (t.offPlan ? "off" : "none");
    if (by === "market") return t.market.trim().toUpperCase();
    if (by === "hour") return String(t.hour).padStart(2, "0");
    if (by === "weekday") return String(t.weekday);
    if (by === "side") return t.side;
    if (by === "quality") return t.quality ?? "none";
    return t.planFollowed === null ? "unknown" : t.planFollowed ? "in" : "out";
  };
  const parts = new Map<string, StatTrade[]>();
  for (const t of trades) pushTo(parts, keyOf(t), t);
  const groups = [...parts].map(([key, ts]) => ({
    key,
    label: by === "market" ? ts[0].market.trim() : null,
    summary: summaryOf(ts),
    indicative: ts.length < MIN_SAMPLE,
  }));
  const fixed = FIXED_ORDER[by];
  return groups.sort((a, b) => {
    if (fixed) return fixed.indexOf(a.key) - fixed.indexOf(b.key);
    if (by === "hour" || by === "weekday") return Number(a.key) - Number(b.key);
    return b.summary.closed - a.summary.closed || (a.key < b.key ? -1 : 1);
  });
}
