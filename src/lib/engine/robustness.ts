import type { Candles } from "../types";
import type { BacktestConfig, Operand, Strategy } from "../strategy/schema";
import { runBacktest, type Trade } from "./backtest";
import { SeriesContext } from "./evaluate";
import { avg, computeMetrics, percentile } from "./metrics";

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MonteCarloResult {
  iterations: number;
  finalReturn: Record<"p5" | "p25" | "p50" | "p75" | "p95", number>;
  maxDrawdown: Record<"p5" | "p50" | "p95", number>;
  probabilityOfLoss: number;
  probabilityDrawdownOver: Record<"20" | "30" | "50", number>;
}

/** Resamples the trade returns with replacement and compounds them, to see the range of outcomes the same edge could give. */
export function monteCarlo(trades: Trade[], iterations = 2000, seed = 42): MonteCarloResult | null {
  if (trades.length < 5) return null;
  const rand = rng(seed);
  const returns = trades.map((t) => t.pnlPercent / 100);
  const finals: number[] = [];
  const dds: number[] = [];
  for (let k = 0; k < iterations; k++) {
    let eq = 1;
    let peak = 1;
    let dd = 0;
    for (let i = 0; i < returns.length; i++) {
      eq *= 1 + returns[Math.floor(rand() * returns.length)];
      if (eq > peak) peak = eq;
      dd = Math.max(dd, (peak - eq) / peak);
    }
    finals.push((eq - 1) * 100);
    dds.push(dd * 100);
  }
  finals.sort((a, b) => a - b);
  dds.sort((a, b) => a - b);
  const share = (xs: number[], pred: (x: number) => boolean) => (xs.filter(pred).length / xs.length) * 100;
  return {
    iterations,
    finalReturn: {
      p5: percentile(finals, 5),
      p25: percentile(finals, 25),
      p50: percentile(finals, 50),
      p75: percentile(finals, 75),
      p95: percentile(finals, 95),
    },
    maxDrawdown: { p5: percentile(dds, 5), p50: percentile(dds, 50), p95: percentile(dds, 95) },
    probabilityOfLoss: share(finals, (x) => x < 0),
    probabilityDrawdownOver: {
      "20": share(dds, (x) => x > 20),
      "30": share(dds, (x) => x > 30),
      "50": share(dds, (x) => x > 50),
    },
  };
}

export interface EdgeTest {
  unit: "R" | "%";
  mean: number;
  ci90: [number, number];
  /** Bootstrap probability that the true average trade is zero or negative. */
  probabilityNoEdge: number;
}

export function edgeTest(trades: Trade[], iterations = 5000, seed = 7): EdgeTest | null {
  if (trades.length < 10) return null;
  const useR = trades.every((t) => t.r !== null);
  const xs = trades.map((t) => (useR ? t.r! : t.pnlPercent));
  const rand = rng(seed);
  const means: number[] = [];
  for (let k = 0; k < iterations; k++) {
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += xs[Math.floor(rand() * xs.length)];
    means.push(s / xs.length);
  }
  means.sort((a, b) => a - b);
  return {
    unit: useR ? "R" : "%",
    mean: avg(xs),
    ci90: [percentile(means, 5), percentile(means, 95)],
    probabilityNoEdge: (means.filter((m) => m <= 0).length / means.length) * 100,
  };
}

export interface SplitStats {
  label: string;
  from: number;
  to: number;
  trades: number;
  winRate: number;
  avgTradePercent: number;
  avgR: number | null;
  returnPercent: number;
}

/** First 70% of the period vs the last 30%: does the result hold on data that came after? */
export function inOutSample(trades: Trade[], from: number, to: number, share = 0.7): SplitStats[] {
  const cut = from + (to - from) * share;
  const part = (label: string, a: number, b: number): SplitStats => {
    const ts = trades.filter((t) => t.entryTime >= a && t.entryTime < b);
    const useR = ts.length > 0 && ts.every((t) => t.r !== null);
    return {
      label,
      from: a,
      to: b,
      trades: ts.length,
      winRate: ts.length ? (ts.filter((t) => t.pnl > 0).length / ts.length) * 100 : 0,
      avgTradePercent: avg(ts.map((t) => t.pnlPercent)),
      avgR: useR ? avg(ts.map((t) => t.r!)) : null,
      returnPercent: (ts.reduce((eq, t) => eq * (1 + t.pnlPercent / 100), 1) - 1) * 100,
    };
  };
  return [part("Période d'étude (70 %)", from, cut), part("Période de validation (30 %)", cut, to + 1)];
}

interface Knob {
  label: string;
  base: number;
  integer: boolean;
  apply: (s: Strategy, v: number) => void;
}

const OPERAND_LABEL: Partial<Record<Operand["indicator"], string>> = {
  sma: "MM",
  ema: "MME",
  rsi: "RSI",
  atr: "ATR",
  bb_upper: "Bollinger",
  bb_lower: "Bollinger",
  bb_middle: "Bollinger",
  highest: "Plus haut",
  lowest: "Plus bas",
  adx: "ADX",
  roc: "ROC",
  stoch_k: "Stoch",
  stoch_d: "Stoch",
  supertrend: "Supertrend",
  keltner_upper: "Keltner",
  keltner_middle: "Keltner",
  keltner_lower: "Keltner",
  bb_percent: "Bollinger %B",
  bb_width: "Largeur Bollinger",
  squeeze: "Squeeze",
  chop: "Choppiness",
  mfi: "MFI",
  zscore: "Score z",
  narrow_range: "NR",
  wma: "WMA",
  hma: "HMA",
  cci: "CCI",
  williams_r: "Williams %R",
  plus_di: "+DI",
  minus_di: "−DI",
  swing_high: "Swing",
  swing_low: "Swing",
  bos: "BOS",
  structure: "Structure",
  order_block: "Order block",
  ob_bull_top: "Order block",
  ob_bull_bottom: "Order block",
  ob_bear_top: "Order block",
  ob_bear_bottom: "Order block",
  rsi_divergence: "Divergence RSI",
  macd_divergence: "Divergence MACD",
  stoch_rsi_k: "Stoch RSI",
  stoch_rsi_d: "Stoch RSI",
  aroon_up: "Aroon",
  aroon_down: "Aroon",
  cmf: "CMF",
};

/** Yes/no or −1/0/1 signals: the numbers they are compared with are categories, not thresholds to wiggle. */
const SIGNALS = new Set<Operand["indicator"]>(["hour", "minute", "weekday", "inside_bar", "engulfing", "pin_bar", "narrow_range", "squeeze", "bos", "structure", "fvg", "order_block", "rsi_divergence", "macd_divergence"]);

/** Every numeric setting worth wiggling: indicator periods, thresholds, stop and target sizes. */
export function strategyKnobs(s: Strategy): Knob[] {
  const knobs: Knob[] = [];
  const seen = new Set<string>();
  const ruleSets = ["entryLong", "entryShort", "exitLong", "exitShort"] as const;
  for (const rs of ruleSets) {
    s[rs].forEach((g) =>
      g.conditions.forEach((c) => {
        (["left", "right"] as const).forEach((side) => {
          const o = c[side];
          if (o.indicator === "number" && o.value !== null && o.value !== 0) {
            const otherSide = side === "left" ? "right" : "left";
            const other = c[otherSide];
            // Times, days and yes/no signals (patterns, squeeze) have no neighbouring values worth testing.
            if (SIGNALS.has(other.indicator)) return;
            // The same threshold used in several rules (e.g. ADX > 20 for longs and shorts) moves as one setting.
            const key = `v-${JSON.stringify(other)}-${c.op}-${o.value}`;
            if (seen.has(key)) return;
            seen.add(key);
            const base = o.value;
            knobs.push({
              label: `Seuil ${OPERAND_LABEL[other.indicator] ?? other.indicator} ${c.op} ${base}`,
              base,
              integer: Number.isInteger(base) && Math.abs(base) >= 5,
              apply: (x, v) => {
                for (const rs2 of ruleSets)
                  for (const g2 of x[rs2])
                    for (const c2 of g2.conditions)
                      for (const [s2, os2] of [["left", "right"], ["right", "left"]] as const)
                        if (c2[s2].indicator === "number" && c2[s2].value === base && c2.op === c.op && JSON.stringify(c2[os2]) === JSON.stringify(other)) c2[s2].value = v;
              },
            });
          } else if (o.period !== null && OPERAND_LABEL[o.indicator]) {
            const key = `${o.indicator}-${o.period}-${o.timeframe}`;
            if (seen.has(key)) return;
            seen.add(key);
            knobs.push({
              label: `Période ${OPERAND_LABEL[o.indicator]}(${o.period})`,
              base: o.period,
              integer: true,
              // A period change applies to every operand sharing it, so e.g. both sides of a cross move together.
              apply: (x, v) => {
                for (const rs2 of ruleSets)
                  for (const g2 of x[rs2])
                    for (const c2 of g2.conditions)
                      for (const o2 of [c2.left, c2.right])
                        if (o2.indicator === o.indicator && o2.period === o.period && o2.timeframe === o.timeframe) o2.period = v;
              },
            });
          }
        });
      }),
    );
  }
  if (s.stop.type !== "none" && s.stop.value) {
    knobs.push({ label: `Stop (${s.stop.type}) ${s.stop.value}`, base: s.stop.value, integer: s.stop.type === "swing", apply: (x, v) => (x.stop.value = v) });
  }
  if (s.takeProfit.type !== "none" && s.takeProfit.value) {
    knobs.push({ label: `Objectif (${s.takeProfit.type}) ${s.takeProfit.value}`, base: s.takeProfit.value, integer: false, apply: (x, v) => (x.takeProfit.value = v) });
  }
  if (s.trailingStop.type !== "none" && s.trailingStop.value) {
    knobs.push({ label: `Stop suiveur ${s.trailingStop.value}`, base: s.trailingStop.value, integer: false, apply: (x, v) => (x.trailingStop.value = v) });
  }
  if (s.maxBarsInTrade) {
    knobs.push({ label: `Durée max ${s.maxBarsInTrade} bougies`, base: s.maxBarsInTrade, integer: true, apply: (x, v) => (x.maxBarsInTrade = v) });
  }
  return knobs.slice(0, 12);
}

export interface SensitivityRow {
  label: string;
  base: number;
  variants: { value: number; trades: number; returnPercent: number; avgTradePercent: number; avgR: number | null; profitFactor: number | null }[];
}

const FACTORS = [0.6, 0.8, 1, 1.2, 1.4];

/** Called after each step of a long computation, with the share done (0 to 1). Awaited, so callers can save progress. */
export type Progress = (done: number) => void | Promise<void>;

export async function sensitivity(
  candles: Candles,
  strategy: Strategy,
  config: BacktestConfig,
  startIndex: number,
  ctx: SeriesContext,
  onProgress?: Progress,
): Promise<{ rows: SensitivityRow[]; profitableShare: number }> {
  const rows: SensitivityRow[] = [];
  let profitable = 0;
  let total = 0;
  const knobs = strategyKnobs(strategy);
  for (const [k, knob] of knobs.entries()) {
    const values = [...new Set(FACTORS.map((f) => roundKnob(knob.base * f, knob.integer)))];
    const variants: SensitivityRow["variants"] = [];
    for (const value of values) {
      const s = structuredClone(strategy);
      knob.apply(s, value);
      // Scoped: the variant's own series are dropped once it is measured, so the sweep's memory stays flat.
      const m = ctx.scoped(() => computeMetrics(runBacktest(candles, s, config, ctx, startIndex), startIndex));
      if (value !== knob.base) {
        total++;
        if (m.totalReturnPercent > 0) profitable++;
      }
      variants.push({
        value,
        trades: m.trades,
        returnPercent: m.totalReturnPercent,
        avgTradePercent: m.avgTradePercent,
        avgR: m.avgR,
        profitFactor: m.profitFactor,
      });
      // A breath between variants: the worker also answers the Telegram bot and the alerts in this process.
      await new Promise((r) => setTimeout(r, 0));
    }
    rows.push({ label: knob.label, base: knob.base, variants });
    await onProgress?.((k + 1) / knobs.length);
  }
  return { rows, profitableShare: total ? (profitable / total) * 100 : 0 };
}

function roundKnob(v: number, integer: boolean) {
  if (integer) return Math.max(1, Math.round(v));
  const mag = Math.abs(v) >= 10 ? 1 : Math.abs(v) >= 1 ? 10 : 100;
  return Math.round(v * mag) / mag;
}

export function costStress(candles: Candles, strategy: Strategy, config: BacktestConfig, startIndex: number, ctx: SeriesContext) {
  const doubled: BacktestConfig = {
    ...config,
    feePercent: config.feePercent * 2,
    spreadPercent: config.spreadPercent * 2,
    slippagePercent: config.slippagePercent * 2,
    fundingPercentPer8h: config.fundingPercentPer8h * 2,
  };
  const m = computeMetrics(runBacktest(candles, strategy, doubled, ctx, startIndex), startIndex);
  return { returnPercent: m.totalReturnPercent, avgTradePercent: m.avgTradePercent, avgR: m.avgR, profitFactor: m.profitFactor };
}
