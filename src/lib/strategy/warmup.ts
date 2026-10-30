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
  return (periods.length ? Math.max(...periods) : 1) * 3 + o.offset + 2;
}

/** Timeframes above the strategy's own that its rules read. Their candles are loaded separately. */
export function higherTimeframes(s: Strategy): Interval[] {
  const base = INTERVAL_MS[s.interval];
  return [...new Set(operands(s).map((o) => o.timeframe).filter((tf): tf is Interval => tf !== null && INTERVAL_MS[tf] > base))];
}

/** History needed before the start date on the strategy's own timeframe, in ms. */
export function warmupMs(s: Strategy): number {
  const base = INTERVAL_MS[s.interval];
  let worst = 50 * base;
  for (const o of operands(s)) {
    if (o.timeframe && INTERVAL_MS[o.timeframe] > base) continue;
    const daily = ["prev_day_high", "prev_day_low", "prev_day_close", "day_open"].includes(o.indicator) ? 2 * 86_400_000 : 0;
    worst = Math.max(worst, barsNeeded(o) * base, daily);
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
