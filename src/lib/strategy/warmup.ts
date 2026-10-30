import { INTERVAL_MS } from "../types";
import type { Operand, Strategy } from "./schema";

/** How much history before the start date indicators need to be fully formed, in ms. */
export function warmupMs(s: Strategy): number {
  const base = INTERVAL_MS[s.interval];
  let worst = 50 * base;
  const visit = (o: Operand) => {
    const periods = [o.period, o.period2, o.period3].filter((p): p is number => p !== null);
    // EMA, RSI and ATR need a few times their period to settle.
    const longest = (periods.length ? Math.max(...periods) : 1) * 3 + o.offset + 2;
    const barMs = o.timeframe ? Math.max(INTERVAL_MS[o.timeframe], base) : base;
    const daily = ["prev_day_high", "prev_day_low", "prev_day_close", "day_open"].includes(o.indicator) ? 2 * 86_400_000 : 0;
    worst = Math.max(worst, longest * barMs, daily);
  };
  for (const groups of [s.entryLong, s.entryShort, s.exitLong, s.exitShort])
    for (const g of groups) for (const c of g.conditions) [c.left, c.right].forEach(visit);
  for (const p of [s.stop.atrPeriod, s.takeProfit.atrPeriod, s.trailingStop.atrPeriod, s.stop.type === "swing" ? s.stop.value : null]) {
    if (p) worst = Math.max(worst, p * 3 * base);
  }
  return worst;
}
