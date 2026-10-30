import type { Trade } from "./backtest";
import { percentile, avg } from "./metrics";
import { rng } from "./robustness";

export interface PropRules {
  name: string;
  phases: { name: string; targetPercent: number }[];
  maxDailyLossPercent: number;
  maxTotalLossPercent: number;
  minTradingDays: number;
  /** Calendar days allowed per phase, null = unlimited. */
  maxDaysPerPhase: number | null;
}

export const PROP_PRESETS: PropRules[] = [
  {
    name: "Challenge 2 phases classique (10 % puis 5 %)",
    phases: [
      { name: "Phase 1", targetPercent: 10 },
      { name: "Phase 2", targetPercent: 5 },
    ],
    maxDailyLossPercent: 5,
    maxTotalLossPercent: 10,
    minTradingDays: 4,
    maxDaysPerPhase: null,
  },
  {
    name: "Challenge 1 phase (10 %, pertes 4 % / 8 %)",
    phases: [{ name: "Évaluation", targetPercent: 10 }],
    maxDailyLossPercent: 4,
    maxTotalLossPercent: 8,
    minTradingDays: 3,
    maxDaysPerPhase: null,
  },
  {
    name: "Challenge 2 phases avec limite de 30 / 60 jours",
    phases: [
      { name: "Phase 1", targetPercent: 8 },
      { name: "Phase 2", targetPercent: 5 },
    ],
    maxDailyLossPercent: 5,
    maxTotalLossPercent: 10,
    minTradingDays: 4,
    maxDaysPerPhase: 45,
  },
];

export type Outcome = "pass" | "fail_daily" | "fail_total" | "fail_time" | "unfinished";

interface SimTrade {
  /** Day index of the entry (days since epoch, UTC). */
  day: number;
  pnlPercent: number;
  maePercent: number;
}

const DAY = 86_400_000;

function simulate(seq: SimTrade[], rules: PropRules): { outcome: Outcome; days: number; phaseReached: number } {
  if (!seq.length) return { outcome: "unfinished", days: 0, phaseReached: 0 };
  let phase = 0;
  let balance = 100;
  let dayStart = 100;
  let currentDay = -Infinity;
  let phaseStartDay = seq[0].day;
  const tradingDays = new Set<number>();
  const firstDay = seq[0].day;
  for (const t of seq) {
    if (rules.maxDaysPerPhase !== null && t.day - phaseStartDay >= rules.maxDaysPerPhase) {
      return { outcome: "fail_time", days: t.day - firstDay, phaseReached: phase };
    }
    if (t.day !== currentDay) {
      currentDay = t.day;
      dayStart = balance;
    }
    tradingDays.add(t.day);
    const low = balance + Math.min(0, t.maePercent, t.pnlPercent);
    if (dayStart - low >= rules.maxDailyLossPercent) return { outcome: "fail_daily", days: t.day - firstDay, phaseReached: phase };
    if (100 - low >= rules.maxTotalLossPercent) return { outcome: "fail_total", days: t.day - firstDay, phaseReached: phase };
    balance += t.pnlPercent;
    if (balance - 100 >= rules.phases[phase].targetPercent && tradingDays.size >= rules.minTradingDays) {
      phase++;
      if (phase === rules.phases.length) return { outcome: "pass", days: t.day - firstDay + 1, phaseReached: phase };
      balance = 100;
      dayStart = 100;
      currentDay = -Infinity;
      tradingDays.clear();
      phaseStartDay = t.day + 1;
    }
  }
  return { outcome: "unfinished", days: seq[seq.length - 1].day - firstDay, phaseReached: phase };
}

export interface PropSummary {
  runs: number;
  passRate: number;
  failDaily: number;
  failTotal: number;
  failTime: number;
  unfinished: number;
  medianDaysToPass: number | null;
  p75DaysToPass: number | null;
}

function summarize(results: { outcome: Outcome; days: number }[]): PropSummary {
  const finished = results.filter((r) => r.outcome !== "unfinished");
  const pct = (o: Outcome) => (finished.length ? (finished.filter((r) => r.outcome === o).length / finished.length) * 100 : 0);
  const passDays = results.filter((r) => r.outcome === "pass").map((r) => r.days).sort((a, b) => a - b);
  return {
    runs: results.length,
    passRate: pct("pass"),
    failDaily: pct("fail_daily"),
    failTotal: pct("fail_total"),
    failTime: pct("fail_time"),
    unfinished: results.length ? (results.filter((r) => r.outcome === "unfinished").length / results.length) * 100 : 0,
    medianDaysToPass: passDays.length ? percentile(passDays, 50) : null,
    p75DaysToPass: passDays.length ? percentile(passDays, 75) : null,
  };
}

export interface PropResult {
  rules: PropRules;
  riskScale: number;
  historical: PropSummary;
  monteCarlo: PropSummary;
  /** Same simulation with the average trade forced to zero: what luck alone gives. */
  noEdge: PropSummary;
}

/**
 * Replays the backtest's trades against prop-firm rules, with every trade
 * resized by `riskScale` (chosen risk ÷ backtest risk). Losses inside a trade
 * use its worst unrealised move, so a trade that dipped through the daily
 * limit fails the challenge even if it closed in profit.
 */
export function simulatePropFirm(trades: Trade[], rules: PropRules, riskScale: number, iterations = 3000, seed = 11): PropResult {
  const base: SimTrade[] = trades.map((t) => ({
    day: Math.floor(t.entryTime / DAY),
    pnlPercent: t.pnlPercent * riskScale,
    maePercent: t.maePercent * riskScale,
  }));

  // Historical: start a challenge at every trade in the history.
  const historical = base.map((_, k) => simulate(base.slice(k), rules));

  const gaps = base.map((t, i) => (i === 0 ? 1 : Math.max(0, t.day - base[i - 1].day)));
  const mc = (seq: SimTrade[], s: number) => {
    const rand = rng(s);
    const out: { outcome: Outcome; days: number }[] = [];
    if (seq.length < 5) return out;
    const horizon = Math.max(seq.length * 4, 400);
    for (let k = 0; k < iterations; k++) {
      let day = 0;
      const path: SimTrade[] = [];
      for (let i = 0; i < horizon; i++) {
        const j = Math.floor(rand() * seq.length);
        day += gaps[j];
        path.push({ day, pnlPercent: seq[j].pnlPercent, maePercent: seq[j].maePercent });
      }
      out.push(simulate(path, rules));
    }
    return out;
  };
  const mean = avg(base.map((t) => t.pnlPercent));
  const demeaned = base.map((t) => ({ ...t, pnlPercent: t.pnlPercent - mean, maePercent: Math.min(0, t.maePercent - Math.max(0, mean)) }));

  return {
    rules,
    riskScale,
    historical: summarize(historical),
    monteCarlo: summarize(mc(base, seed)),
    noEdge: summarize(mc(demeaned, seed + 1)),
  };
}
