import { INTERVAL_MS, type Interval } from "../types";
import type { Operand, Strategy } from "./schema";

function operands(s: Strategy): Operand[] {
  const out: Operand[] = [];
  for (const groups of [s.entryLong, s.entryShort, s.exitLong, s.exitShort])
    for (const g of groups) for (const c of g.conditions) out.push(c.left, c.right);
  return out;
}

/** Bars an operand needs before its value is fully formed. EMA, RSI and ATR need a few times their period. */
function barsNeeded(o: Operand) {
  const periods = [o.period, o.period2, o.period3].filter((p): p is number => p !== null);
  // Ichimoku's cloud is drawn kijun bars after the span B period it covers; a divergence compares two swings up to 60 bars apart;
  // the Stoch RSI stacks a stochastic and two averages on the RSI; an order block stays in play long after the swing it broke.
  const extra = o.indicator.startsWith("ichimoku_span")
    ? (o.period2 ?? 26)
    : o.indicator.endsWith("_divergence")
      ? 60
      : o.indicator.startsWith("stoch_rsi")
        ? (o.period2 ?? 14) + (o.period3 ?? 3) + 3
        : o.indicator === "order_block" || o.indicator.startsWith("ob_")
          ? 300
          : 0;
  return (periods.length ? Math.max(...periods) : 1) * 3 + extra + o.offset + 2;
}

/** Timeframes above the strategy's own that its rules read. Their candles are loaded separately. */
export function higherTimeframes(s: Strategy): Interval[] {
  const base = INTERVAL_MS[s.interval];
  return [...new Set(operands(s).map((o) => o.timeframe).filter((tf): tf is Interval => tf !== null && INTERVAL_MS[tf] > base))];
}

const DAY = 86_400_000;
/** Levels read on previous days or weeks: the history they need, whatever the bar size. */
const CALENDAR_WARMUP: Partial<Record<Operand["indicator"], number>> = {
  day_open: 2 * DAY,
  prev_day_high: 2 * DAY,
  prev_day_low: 2 * DAY,
  prev_day_close: 2 * DAY,
  range_high: 2 * DAY,
  range_low: 2 * DAY,
  pivot: 2 * DAY,
  pivot_r1: 2 * DAY,
  pivot_s1: 2 * DAY,
  pivot_r2: 2 * DAY,
  pivot_s2: 2 * DAY,
  cam_r3: 2 * DAY,
  cam_s3: 2 * DAY,
  cam_r4: 2 * DAY,
  cam_s4: 2 * DAY,
  prev_week_high: 15 * DAY,
  prev_week_low: 15 * DAY,
};

/** History needed before the start date on the strategy's own timeframe, in ms. */
export function warmupMs(s: Strategy): number {
  const base = INTERVAL_MS[s.interval];
  let worst = 50 * base;
  for (const o of operands(s)) {
    if (o.timeframe && INTERVAL_MS[o.timeframe] > base) continue;
    worst = Math.max(worst, barsNeeded(o) * base, CALENDAR_WARMUP[o.indicator] ?? 0);
  }
  for (const p of [s.stop.atrPeriod, s.takeProfit.atrPeriod, s.trailingStop.atrPeriod, s.stop.type === "swing" ? s.stop.value : null]) {
    if (p) worst = Math.max(worst, p * 3 * base);
  }
  return worst;
}

/** History needed before the start date for one higher timeframe, in ms. */
export function higherTimeframeWarmupMs(s: Strategy, tf: Interval): number {
  const bars = Math.max(50, ...operands(s).filter((o) => o.timeframe === tf).map(barsNeeded));
  return (bars + 2) * INTERVAL_MS[tf];
}
