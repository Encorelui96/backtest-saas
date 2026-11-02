import { INTERVAL_MS, type Interval } from "../types";
import type { ExitReason, Trade } from "./backtest";
import { CALENDAR_FROM, CALENDAR_TO, EVENT_KINDS, eventsBetween, type EventKind } from "./calendar";
import { avg, percentile } from "./metrics";
import { rng } from "./robustness";
import { localTime } from "./time";

/**
 * What the trades themselves teach: where the strategy wins and loses, what
 * the excursions say about the stop and the exits, and how much to risk per
 * trade. Computed from the trade list alone, so the results page gets it for
 * every report, including the ones saved before this module existed.
 */

/** Results are in R when every trade had a stop, else in % of equity at entry. */
export type Unit = "R" | "%";

export function tradeUnit(trades: Trade[]): Unit {
  return trades.length > 0 && trades.every((t) => t.r !== null && t.riskAmount) ? "R" : "%";
}

const value = (t: Trade, unit: Unit) => (unit === "R" ? t.r! : t.pnlPercent);
/** A trade's costs in the same unit as its result. */
const costOf = (t: Trade, unit: Unit) => (unit === "R" ? t.costs / t.riskAmount! : (t.costs / t.equityBefore) * 100);

export const EXIT_LABELS: Record<ExitReason, string> = {
  stop: "Stop",
  target: "Objectif",
  trailing: "Stop suiveur",
  breakeven: "Point mort",
  signal: "Signal de sortie",
  reverse: "Retournement",
  time: "Heure de fin",
  max_bars: "Durée max",
  liquidation: "Liquidation",
  end: "Fin du test",
};

const WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

// ---------------------------------------------------------------------------
// Where the strategy wins and loses

export interface Bucket {
  key: string;
  label: string;
  /** Subject of a sentence: "Les trades ouverts le lundi". */
  subject: string;
  /** For the pronouns that follow: "Les ventes… Sans elles". */
  feminine: boolean;
  trades: number;
  winRate: number;
  /** Average trade, in the breakdown's unit. */
  avg: number;
  total: number;
}

/**
 * A group of trades worth a sentence. In a winning strategy, a group that
 * loses ("weak"); in a losing one, a group that still wins ("strong"): there,
 * every group loses a little and pointing at the worst teaches nothing.
 */
export interface Finding {
  kind: "weak" | "strong";
  bucket: Bucket;
  /** Average trade of the whole test, and without this bucket. */
  avgAll: number;
  avgWithout: number;
  /** The bucket's average trade over the first 70 % and the last 30 % of the test (null under 3 trades). */
  study: number | null;
  validation: number | null;
  /** Same sign as the finding on both parts of the test: more likely real than chance. */
  steady: boolean;
}

export interface Breakdowns {
  unit: Unit;
  /** Average trade of the whole test. */
  avg: number;
  /** null when the trait does not vary (daily bars, one side only…). */
  byHour: Bucket[] | null;
  byWeekday: Bucket[] | null;
  bySide: Bucket[] | null;
  byExit: Bucket[];
  /** null when no trade falls within the calendar's years. */
  events: EventDays | null;
  /** At most two groups, the one that weighs most first. */
  findings: Finding[];
}

/** Trades in position on the day of a Fed or ECB decision, or of US inflation or jobs figures. */
export interface EventDays {
  /** Announcement days, then the other days. */
  split: Bucket[];
  /** One row per kind of announcement: a trade open through several counts in each. */
  kinds: Bucket[];
  /** Trades outside the calendar's years, left out. */
  outside: number;
}

/** The announcements made while the trade was open, one per kind, in the calendar's order. */
export function tradeEvents(t: Trade): EventKind[] {
  const kinds = new Set(eventsBetween(t.entryTime, t.exitTime).map((e) => e.kind));
  return EVENT_KINDS.filter((k) => kinds.has(k.kind)).map((k) => k.kind);
}

const inCalendar = (t: Trade) => t.entryTime >= CALENDAR_FROM && t.exitTime < CALENDAR_TO;

interface Trait {
  key: string;
  order: number;
  label: string;
  subject: string;
  feminine?: boolean;
}

const bucket = (trait: Trait, xs: number[]): Bucket => ({
  key: trait.key,
  label: trait.label,
  subject: trait.subject,
  feminine: trait.feminine ?? false,
  trades: xs.length,
  winRate: (xs.filter((x) => x > 0).length / xs.length) * 100,
  avg: avg(xs),
  total: xs.reduce((s, x) => s + x, 0),
});

function group(trades: Trade[], unit: Unit, traitOf: (t: Trade) => Trait): Bucket[] {
  const map = new Map<string, { trait: Trait; xs: number[] }>();
  for (const t of trades) {
    const trait = traitOf(t);
    const row = map.get(trait.key) ?? { trait, xs: [] };
    row.xs.push(value(t, unit));
    map.set(trait.key, row);
  }
  return [...map.values()].sort((a, b) => a.trait.order - b.trait.order).map(({ trait, xs }) => bucket(trait, xs));
}

const EVENT_DAY: Trait = { key: "event", order: 0, label: "Jours d'annonce", subject: "Les trades en position un jour d'annonce" };
const QUIET_DAY: Trait = { key: "quiet", order: 1, label: "Autres jours", subject: "Les trades des jours sans annonce" };

function eventDays(trades: Trade[], unit: Unit, kindsOf: Map<Trade, EventKind[]>): EventDays | null {
  const covered = trades.filter(inCalendar);
  if (!covered.length) return null;
  const split = group(covered, unit, (t) => (kindsOf.get(t)!.length ? EVENT_DAY : QUIET_DAY));
  const kinds = EVENT_KINDS.flatMap(({ kind, label }, order) => {
    const xs = covered.filter((t) => kindsOf.get(t)!.includes(kind)).map((t) => value(t, unit));
    return xs.length ? [bucket({ key: kind, order, label, subject: label }, xs)] : [];
  });
  return { split, kinds, outside: trades.length - covered.length };
}

/**
 * `from` / `to`: the test period, cut at 70 % like the robustness check, to
 * tell a group that loses all along from one that lost during a single stretch.
 */
export function breakdowns(trades: Trade[], timezone: string, interval: Interval, from: number, to: number): Breakdowns {
  const unit = tradeUnit(trades);
  const local = trades.map((t) => localTime(timezone, t.entryTime));
  const at = new Map(trades.map((t, i) => [t, local[i]]));

  const byHour = group(trades, unit, (t) => {
    const h = at.get(t)!.hour;
    return { key: `h${h}`, order: h, label: `${h} h – ${h + 1} h`, subject: `Les trades ouverts entre ${h} h et ${h + 1} h` };
  });
  const byWeekday = group(trades, unit, (t) => {
    const d = at.get(t)!.weekday;
    const name = WEEKDAYS[d - 1];
    return { key: `d${d}`, order: d, label: name[0].toUpperCase() + name.slice(1), subject: `Les trades ouverts le ${name}` };
  });
  const bySide = group(trades, unit, (t) =>
    t.side === "long" ? { key: "long", order: 0, label: "Achats", subject: "Les achats" } : { key: "short", order: 1, label: "Ventes", subject: "Les ventes", feminine: true },
  );
  const exits = Object.keys(EXIT_LABELS) as ExitReason[];
  const byExit = group(trades, unit, (t) => ({
    key: t.exitReason,
    order: exits.indexOf(t.exitReason),
    label: EXIT_LABELS[t.exitReason],
    subject: `Les sorties « ${EXIT_LABELS[t.exitReason]} »`,
    feminine: true,
  }));

  // Hours only mean something below daily bars; a single hour or day is no breakdown.
  const intraday = INTERVAL_MS[interval] < 86_400_000;
  const dims: { rows: Bucket[]; traitKey: (t: Trade) => string }[] = [];
  const keep = (rows: Bucket[], traitKey: (t: Trade) => string, useful: boolean) => {
    if (!useful || rows.length < 2) return null;
    dims.push({ rows, traitKey });
    return rows;
  };
  const hourRows = keep(byHour, (t) => `h${at.get(t)!.hour}`, intraday);
  const weekdayRows = keep(byWeekday, (t) => `d${at.get(t)!.weekday}`, true);
  const sideRows = keep(bySide, (t) => t.side, true);
  const kindsOf = new Map(trades.map((t) => [t, inCalendar(t) ? tradeEvents(t) : []]));
  const events = eventDays(trades, unit, kindsOf);
  // Announcement days or not, like any other trait; trades outside the calendar belong to neither.
  if (events) keep(events.split, (t) => (!inCalendar(t) ? "outside" : kindsOf.get(t)!.length ? EVENT_DAY.key : QUIET_DAY.key), true);

  const n = trades.length;
  const all = trades.map((t) => value(t, unit));
  const avgAll = avg(all);
  const totalAll = all.reduce((s, x) => s + x, 0);
  // A group small enough to be noise is no lesson; neither is one so big that little would be left.
  const minTrades = Math.max(10, Math.ceil(n * 0.08));
  const cut = from + (to - from) * 0.7;
  const kind: Finding["kind"] = avgAll > 0 ? "weak" : "strong";
  // Weak: the group that costs the most. Strong: the group that earns the most.
  const sign = kind === "weak" ? -1 : 1;
  const candidates: Finding[] = [];
  for (const { rows, traitKey } of dims) {
    const pick = rows.filter((b) => b.trades >= minTrades && n - b.trades >= 10 && sign * b.avg > 0).sort((a, b) => sign * (b.total - a.total))[0];
    if (!pick) continue;
    const inBucket = trades.filter((t) => traitKey(t) === pick.key);
    const part = (ts: Trade[]) => (ts.length >= 3 ? avg(ts.map((t) => value(t, unit))) : null);
    const study = part(inBucket.filter((t) => t.entryTime < cut));
    const validation = part(inBucket.filter((t) => t.entryTime >= cut));
    candidates.push({
      kind,
      bucket: pick,
      avgAll,
      avgWithout: (totalAll - pick.total) / (n - pick.trades),
      study,
      validation,
      steady: study !== null && validation !== null && sign * study > 0 && sign * validation > 0,
    });
  }
  candidates.sort((a, b) => sign * (b.bucket.total - a.bucket.total));

  return { unit, avg: avgAll, byHour: hourRows, byWeekday: weekdayRows, bySide: sideRows, byExit, events, findings: candidates.slice(0, 2) };
}

// ---------------------------------------------------------------------------
// Excursions: how far each trade went against you, and in your favour

export interface Band {
  /** Bounds in R, as distances from entry (both ≥ 0). `to` null = and beyond. */
  from: number;
  to: number | null;
  wins: number;
  losses: number;
}

export interface Excursions {
  winners: number;
  losers: number;
  /** Trades by their worst moment (MAE), in R below entry. */
  depth: Band[];
  /** Trades by their best moment (MFE), in R above entry. */
  peak: Band[];
  /** 80 % of winners never went further against you than this many R. */
  winnersDepthP80: number | null;
  /** Losers that were first at least 1R in profit. */
  losersPast1R: number;
  /** Average share of their best moment that winners kept at the exit, 0 to 1. */
  winnersKept: number | null;
}

const DEPTH_EDGES = [0, 0.25, 0.5, 0.75, 1];
const PEAK_EDGES = [0, 0.5, 1, 2, 3];

function bands(edges: number[], xs: { x: number; win: boolean }[]): Band[] {
  return edges.map((lo, i) => {
    const hi = i + 1 < edges.length ? edges[i + 1] : null;
    const inside = xs.filter((p) => p.x >= lo && (hi === null || p.x < hi));
    return { from: lo, to: hi, wins: inside.filter((p) => p.win).length, losses: inside.filter((p) => !p.win).length };
  });
}

/** Needs a stop on every trade: excursions are read in R. */
export function excursions(trades: Trade[]): Excursions | null {
  if (tradeUnit(trades) !== "R" || trades.length < 10) return null;
  const points = trades.map((t) => {
    // maePercent / mfePercent are % of equity at entry; the planned risk turns them into R.
    const toR = t.equityBefore / 100 / t.riskAmount!;
    return { win: t.pnl > 0, r: t.r!, depth: Math.max(0, -t.maePercent * toR), peak: Math.max(0, t.mfePercent * toR) };
  });
  const winners = points.filter((p) => p.win);
  const losers = points.filter((p) => !p.win);
  const kept = winners.filter((p) => p.peak > 0).map((p) => Math.min(1, Math.max(0, p.r / p.peak)));
  return {
    winners: winners.length,
    losers: losers.length,
    depth: bands(DEPTH_EDGES, points.map((p) => ({ x: p.depth, win: p.win }))),
    peak: bands(PEAK_EDGES, points.map((p) => ({ x: p.peak, win: p.win }))),
    winnersDepthP80: winners.length ? percentile(winners.map((p) => p.depth).sort((a, b) => a - b), 80) : null,
    losersPast1R: losers.filter((p) => p.peak >= 1).length,
    winnersKept: kept.length ? avg(kept) : null,
  };
}

// ---------------------------------------------------------------------------
// How much to risk per trade

export interface RiskLevel {
  /** % of equity risked per trade. */
  risk: number;
  medianReturn: number;
  /** Largest drop from a peak, median and unlucky case (95th percentile) of the simulations. */
  drawdownP50: number;
  drawdownP95: number;
  /** Share of simulations that lost more than 20 % / 50 % from a peak at some point. */
  probDrawdown20: number;
  probDrawdown50: number;
}

export interface BreakEven {
  /** Share of winners the strategy needs to break even, with its average win and loss. */
  needed: number;
  /** The same, as if trading were free (null when costs exceed the gross result of every trade). */
  neededWithoutCosts: number | null;
  actual: number;
}

export interface RiskSizing {
  unit: Unit;
  trades: number;
  iterations: number;
  /** Risk per trade levels; empty without a stop, where the risk of a trade is not defined. */
  levels: RiskLevel[];
  /** Longest run of losers over as many trades as the test, median and p95 of the simulations. */
  streakP50: number;
  streakP95: number;
  /** Kelly fraction W − (1 − W) / (avg win ÷ avg loss), in % of capital per trade (0 when there is no edge). null without a stop. */
  kelly: number | null;
  breakEven: BreakEven;
  /** Average cost per trade, and its share of the average trade before costs (null when that is ≤ 0). */
  costPerTrade: number;
  costShareOfEdge: number | null;
}

export const RISK_LEVELS = [0.5, 1, 2, 3, 5];

/**
 * Replays the trades in random orders at several risk levels. Each trade's
 * result is rescaled from the backtest's risk (`baseRisk`), as in the prop firm
 * simulation, and every level uses the same random orders so they compare fairly.
 */
export function riskSizing(trades: Trade[], baseRisk: number, iterations = 1000, seed = 5): RiskSizing | null {
  const n = trades.length;
  if (n < 10 || !(baseRisk > 0)) return null;
  const unit = tradeUnit(trades);
  const levels = unit === "R" ? [...new Set([...RISK_LEVELS, baseRisk])].sort((a, b) => a - b) : [];
  // Long scalping tests have thousands of trades: fewer paths keep the page responsive.
  const runs = Math.max(200, Math.min(iterations, Math.floor(3_000_000 / (n * Math.max(1, levels.length)))));
  const returns = trades.map((t) => t.pnlPercent / 100);
  const rand = rng(seed);
  const finals = levels.map(() => [] as number[]);
  const drawdowns = levels.map(() => [] as number[]);
  const streaks: number[] = [];
  const eq = new Float64Array(levels.length);
  const peak = new Float64Array(levels.length);
  const dd = new Float64Array(levels.length);
  const scale = levels.map((l) => l / baseRisk);
  for (let k = 0; k < runs; k++) {
    eq.fill(1);
    peak.fill(1);
    dd.fill(0);
    let streak = 0;
    let longest = 0;
    for (let i = 0; i < n; i++) {
      const x = returns[Math.floor(rand() * n)];
      streak = x <= 0 ? streak + 1 : 0;
      if (streak > longest) longest = streak;
      for (let j = 0; j < levels.length; j++) {
        eq[j] = Math.max(0, eq[j] * (1 + x * scale[j]));
        if (eq[j] > peak[j]) peak[j] = eq[j];
        const d = (peak[j] - eq[j]) / peak[j];
        if (d > dd[j]) dd[j] = d;
      }
    }
    streaks.push(longest);
    for (let j = 0; j < levels.length; j++) {
      finals[j].push((eq[j] - 1) * 100);
      drawdowns[j].push(dd[j] * 100);
    }
  }
  streaks.sort((a, b) => a - b);
  const share = (xs: number[], limit: number) => (xs.filter((x) => x > limit).length / xs.length) * 100;

  const xs = trades.map((t) => value(t, unit));
  const wins = xs.filter((x) => x > 0);
  const losses = xs.filter((x) => x <= 0);
  const avgWin = avg(wins);
  const avgLoss = -avg(losses);
  const winRate = wins.length / n;
  let kelly: number | null = null;
  // Without a single real loss, Kelly has nothing to weigh the wins against.
  if (unit === "R" && avgLoss > 0) {
    const f = avgWin > 0 ? winRate - (1 - winRate) / (avgWin / avgLoss) : 0;
    kelly = Math.max(0, f * 100);
  }
  const costs = trades.map((t) => costOf(t, unit));
  const gross = xs.map((x, i) => x + costs[i]);
  const grossWin = avg(gross.filter((_, i) => xs[i] > 0));
  const grossLoss = Math.max(0, -avg(gross.filter((_, i) => xs[i] <= 0)));
  const grossAvg = avg(gross);
  const costPerTrade = avg(costs);

  return {
    unit,
    trades: n,
    iterations: runs,
    levels: levels.map((risk, j) => {
      const f = [...finals[j]].sort((a, b) => a - b);
      const d = [...drawdowns[j]].sort((a, b) => a - b);
      return {
        risk,
        medianReturn: percentile(f, 50),
        drawdownP50: percentile(d, 50),
        drawdownP95: percentile(d, 95),
        probDrawdown20: share(d, 20),
        probDrawdown50: share(d, 50),
      };
    }),
    streakP50: percentile(streaks, 50),
    streakP95: percentile(streaks, 95),
    kelly,
    breakEven: {
      needed: avgWin + avgLoss > 0 ? (avgLoss / (avgWin + avgLoss)) * 100 : 100,
      neededWithoutCosts: grossWin + grossLoss > 0 ? (grossLoss / (grossWin + grossLoss)) * 100 : null,
      actual: winRate * 100,
    },
    costPerTrade,
    costShareOfEdge: grossAvg > 0 ? (costPerTrade / grossAvg) * 100 : null,
  };
}

/** The highest tested risk whose unlucky-case drawdown stays within `maxDrawdown` %, or null if even the lowest exceeds it. */
export function safeRisk(levels: RiskLevel[], maxDrawdown = 20): number | null {
  const ok = levels.filter((l) => l.drawdownP95 <= maxDrawdown && l.probDrawdown50 < 1);
  return ok.length ? ok[ok.length - 1].risk : null;
}
