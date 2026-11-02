import type { Trade } from "./backtest";
import { percentile, avg } from "./metrics";
import { rng } from "./robustness";
import { localTime } from "./time";

export interface PropPhase {
  name: string;
  targetPercent: number;
  /** Calendar days allowed for this phase, null = unlimited. */
  maxDays: number | null;
}

export interface PropRules {
  name: string;
  phases: PropPhase[];
  /** Loss allowed in a day, from the balance at the daily reset, in % of the starting balance. */
  maxDailyLossPercent: number;
  /** Loss allowed overall, in % of the starting balance. */
  maxTotalLossPercent: number;
  /** "static": the floor stays at start − max loss. "eod-trailing": it rises with the best end-of-day balance (FTMO 1-Step). */
  maxLossType: "static" | "eod-trailing";
  /** Days needed in each phase before it can pass. */
  minDays: number;
  /** Which days count: any day with a trade, or a day that made at least `profitableDayPercent` (The5ers). */
  minDaysKind: "trading" | "profitable";
  profitableDayPercent: number;
  /** The best day may not exceed this share of the profit when the phase passes (FTMO 1-Step: 50); null = no such rule. */
  bestDayPercent: number | null;
  /** Time zone of the daily reset. */
  dayZone: string;
  /** Days without a trade after which the account expires (The5ers: 30); null = no such rule. */
  maxInactiveDays: number | null;
}

/** A challenge that hasn't passed after a year doesn't count as a success, even without a time limit. */
export const PROP_HORIZON_DAYS = 365;

/** Usual shapes of a challenge, not any firm's in particular (those are in `prop-firms.ts`). */
export const PROP_PRESETS: PropRules[] = [
  {
    name: "Challenge 2 phases classique (10 % puis 5 %)",
    phases: [
      { name: "Phase 1", targetPercent: 10, maxDays: null },
      { name: "Phase 2", targetPercent: 5, maxDays: null },
    ],
    maxDailyLossPercent: 5,
    maxTotalLossPercent: 10,
    maxLossType: "static",
    minDays: 4,
    minDaysKind: "trading",
    profitableDayPercent: 0.5,
    bestDayPercent: null,
    dayZone: "UTC",
    maxInactiveDays: null,
  },
  {
    name: "Challenge 1 phase (10 %, pertes 4 % / 8 %)",
    phases: [{ name: "Évaluation", targetPercent: 10, maxDays: null }],
    maxDailyLossPercent: 4,
    maxTotalLossPercent: 8,
    maxLossType: "static",
    minDays: 3,
    minDaysKind: "trading",
    profitableDayPercent: 0.5,
    bestDayPercent: null,
    dayZone: "UTC",
    maxInactiveDays: null,
  },
  {
    name: "Challenge 2 phases avec limite de 30 / 60 jours",
    phases: [
      { name: "Phase 1", targetPercent: 8, maxDays: 30 },
      { name: "Phase 2", targetPercent: 5, maxDays: 60 },
    ],
    maxDailyLossPercent: 5,
    maxTotalLossPercent: 10,
    maxLossType: "static",
    minDays: 4,
    minDaysKind: "trading",
    profitableDayPercent: 0.5,
    bestDayPercent: null,
    dayZone: "UTC",
    maxInactiveDays: null,
  },
];

/** "too_slow": still going after the horizon; "unfinished": the trades ran out first. */
export type Outcome = "pass" | "fail_daily" | "fail_total" | "fail_time" | "fail_inactive" | "too_slow" | "unfinished";

export interface Run {
  outcome: Outcome;
  /** Calendar days from the first trade to the pass or the failure. */
  days: number;
  /** Phases passed. */
  phaseReached: number;
}

interface SimTrade {
  /** Day index of the entry, in the rules' time zone. */
  day: number;
  pnlPercent: number;
  maePercent: number;
}

function simulate(seq: SimTrade[], rules: PropRules, horizonDays: number | null): Run {
  if (!seq.length) return { outcome: "unfinished", days: 0, phaseReached: 0 };
  const firstDay = seq[0].day;
  let phase = 0;
  let balance = 100;
  let dayStart = 100;
  let currentDay = -Infinity;
  let bestClose = 100;
  let floor = 100 - rules.maxTotalLossPercent;
  let phaseStartDay = firstDay;
  let lastDay = firstDay;
  // Profit of each day traded in the current phase.
  const days = new Map<number, number>();
  for (const t of seq) {
    if (horizonDays !== null && t.day - firstDay >= horizonDays) return { outcome: "too_slow", days: t.day - firstDay, phaseReached: phase };
    const limit = rules.phases[phase].maxDays;
    if (limit !== null && t.day - phaseStartDay >= limit) return { outcome: "fail_time", days: t.day - firstDay, phaseReached: phase };
    if (rules.maxInactiveDays !== null && t.day - lastDay > rules.maxInactiveDays) return { outcome: "fail_inactive", days: t.day - firstDay, phaseReached: phase };
    lastDay = t.day;
    if (t.day !== currentDay) {
      // The previous trading day has closed: a trailing floor follows its balance, never down.
      if (rules.maxLossType === "eod-trailing" && currentDay !== -Infinity && balance > bestClose) {
        bestClose = balance;
        floor = bestClose - rules.maxTotalLossPercent;
      }
      currentDay = t.day;
      dayStart = balance;
    }
    const low = balance + Math.min(0, t.maePercent, t.pnlPercent);
    if (dayStart - low >= rules.maxDailyLossPercent) return { outcome: "fail_daily", days: t.day - firstDay, phaseReached: phase };
    if (low <= floor) return { outcome: "fail_total", days: t.day - firstDay, phaseReached: phase };
    balance += t.pnlPercent;
    days.set(t.day, (days.get(t.day) ?? 0) + t.pnlPercent);

    const profit = balance - 100;
    if (profit < rules.phases[phase].targetPercent) continue;
    const counted = rules.minDaysKind === "trading" ? days.size : [...days.values()].filter((p) => p >= rules.profitableDayPercent).length;
    if (counted < rules.minDays) continue;
    if (rules.bestDayPercent !== null && Math.max(...days.values()) > (profit * rules.bestDayPercent) / 100) continue;
    phase++;
    if (phase === rules.phases.length) return { outcome: "pass", days: t.day - firstDay + 1, phaseReached: phase };
    // The next phase is a new account: fresh balance, limits and day count.
    balance = 100;
    dayStart = 100;
    currentDay = -Infinity;
    bestClose = 100;
    floor = 100 - rules.maxTotalLossPercent;
    days.clear();
    phaseStartDay = t.day + 1;
  }
  return { outcome: "unfinished", days: seq[seq.length - 1].day - firstDay, phaseReached: phase };
}

export interface PropSummary {
  runs: number;
  /** Shares of the finished runs, in %. */
  passRate: number;
  failDaily: number;
  failTotal: number;
  /** Phase time limit, or the account expiring for inactivity. */
  failTime: number;
  /** Not passed within the horizon. */
  tooSlow: number;
  /** Share of all runs that ran out of trades before ending, in %. */
  unfinished: number;
  medianDaysToPass: number | null;
  p75DaysToPass: number | null;
}

function summarize(results: Run[]): PropSummary {
  const finished = results.filter((r) => r.outcome !== "unfinished");
  const pct = (o: Outcome) => (finished.length ? (finished.filter((r) => r.outcome === o).length / finished.length) * 100 : 0);
  const passDays = results.filter((r) => r.outcome === "pass").map((r) => r.days).sort((a, b) => a - b);
  return {
    runs: results.length,
    passRate: pct("pass"),
    failDaily: pct("fail_daily"),
    failTotal: pct("fail_total"),
    failTime: pct("fail_time") + pct("fail_inactive"),
    tooSlow: pct("too_slow"),
    unfinished: results.length ? (results.filter((r) => r.outcome === "unfinished").length / results.length) * 100 : 0,
    medianDaysToPass: passDays.length ? percentile(passDays, 50) : null,
    p75DaysToPass: passDays.length ? percentile(passDays, 75) : null,
  };
}

export interface PropResult {
  rules: PropRules;
  riskScale: number;
  /** The challenge started with the first trade of the test. */
  fromStart: Run;
  historical: PropSummary;
  monteCarlo: PropSummary;
  /** Same simulation with the average trade forced to zero: what luck alone gives (null when not asked for). */
  noEdge: PropSummary | null;
}

/**
 * Replays the backtest's trades against prop-firm rules, with every trade
 * resized by `riskScale` (chosen risk ÷ backtest risk). Losses inside a trade
 * use its worst unrealised move, so a trade that dipped through the daily
 * limit fails the challenge even if it closed in profit. A challenge still
 * going after `horizonDays` counts as too slow: "no time limit" doesn't make
 * a pass after ten years a success.
 */
export function simulatePropFirm(
  trades: Trade[],
  rules: PropRules,
  riskScale: number,
  {
    iterations = 3000,
    seed = 11,
    noEdge = true,
    horizonDays = PROP_HORIZON_DAYS,
  }: { iterations?: number; seed?: number; noEdge?: boolean; horizonDays?: number | null } = {},
): PropResult {
  const base: SimTrade[] = trades.map((t) => ({
    day: localTime(rules.dayZone, t.entryTime).dayKey,
    pnlPercent: t.pnlPercent * riskScale,
    maePercent: t.maePercent * riskScale,
  }));

  // Historical: start a challenge at every trade in the history.
  const historical = base.map((_, k) => simulate(base.slice(k), rules, horizonDays));

  const gaps = base.map((t, i) => (i === 0 ? 1 : Math.max(0, t.day - base[i - 1].day)));
  // Enough trades to cover the horizon at the test's pace, with room to spare.
  const span = base.length ? Math.max(1, base[base.length - 1].day - base[0].day) : 1;
  const length =
    horizonDays === null ? Math.max(base.length * 4, 400) : Math.min(50_000, Math.max(400, Math.ceil(((horizonDays + 1) * base.length * 2) / span)));
  const mc = (seq: SimTrade[], s: number) => {
    const rand = rng(s);
    const out: Run[] = [];
    if (seq.length < 5) return out;
    for (let k = 0; k < iterations; k++) {
      let day = 0;
      const path: SimTrade[] = [];
      for (let i = 0; i < length; i++) {
        const j = Math.floor(rand() * seq.length);
        day += gaps[j];
        path.push({ day, pnlPercent: seq[j].pnlPercent, maePercent: seq[j].maePercent });
        // One trade past the horizon is enough for the simulation to call it.
        if (horizonDays !== null && day - path[0].day >= horizonDays) break;
      }
      out.push(simulate(path, rules, horizonDays));
    }
    return out;
  };
  const mean = avg(base.map((t) => t.pnlPercent));
  const demeaned = base.map((t) => ({ ...t, pnlPercent: t.pnlPercent - mean, maePercent: Math.min(0, t.maePercent - Math.max(0, mean)) }));

  return {
    rules,
    riskScale,
    fromStart: historical[0] ?? { outcome: "unfinished", days: 0, phaseReached: 0 },
    historical: summarize(historical),
    monteCarlo: summarize(mc(base, seed)),
    noEdge: noEdge ? summarize(mc(demeaned, seed + 1)) : null,
  };
}
