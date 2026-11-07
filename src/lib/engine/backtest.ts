import type { Candles } from "../types";
import { INTERVAL_MS } from "../types";
import type { BacktestConfig, Strategy } from "../strategy/schema";
import { SeriesContext } from "./evaluate";
import { parseHHMM } from "./time";
import * as ind from "./indicators";

export type ExitReason = "stop" | "target" | "trailing" | "breakeven" | "signal" | "reverse" | "time" | "max_bars" | "liquidation" | "end";

export interface Trade {
  side: "long" | "short";
  entryIndex: number;
  exitIndex: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  stopPrice: number | null;
  targetPrice: number | null;
  exitReason: ExitReason;
  qty: number;
  notional: number;
  /** Net P&L in account currency, after fees, spread, slippage and funding. */
  pnl: number;
  /** Net P&L as % of equity at entry. */
  pnlPercent: number;
  /** Net P&L in R (multiples of the planned risk). null when the trade had no stop. */
  r: number | null;
  riskAmount: number | null;
  costs: number;
  bars: number;
  /** Worst / best unrealised move, as % of equity at entry. */
  maePercent: number;
  mfePercent: number;
  equityBefore: number;
  equityAfter: number;
}

export interface EquityPoint {
  t: number;
  equity: number;
}

export interface BacktestRun {
  trades: Trade[];
  /** Mark-to-market equity at every bar close. */
  equity: Float64Array;
  candlesTime: Float64Array;
  initialCapital: number;
  finalEquity: number;
  skippedSignals: number;
  buyAndHoldPercent: number;
}

export function runBacktest(
  candles: Candles,
  strategy: Strategy,
  config: BacktestConfig,
  ctx: SeriesContext = new SeriesContext(candles, strategy.interval, strategy.timezone),
  /** Index of the first bar allowed to trade (earlier bars only warm up indicators). */
  startIndex = 0,
): BacktestRun {
  const n = candles.t.length;
  const { o, h, l, c, t } = candles;
  const barMs = INTERVAL_MS[strategy.interval];

  const enterLong = strategy.direction !== "short" ? ctx.groupsSignal(strategy.entryLong) : new Uint8Array(n);
  const enterShort = strategy.direction !== "long" ? ctx.groupsSignal(strategy.entryShort) : new Uint8Array(n);
  const exitLong = ctx.groupsSignal(strategy.exitLong);
  const exitShort = ctx.groupsSignal(strategy.exitShort);

  const stopAtr = strategy.stop.type === "atr" ? ctxAtr(ctx, strategy.stop.atrPeriod ?? 14) : null;
  const tpAtr = strategy.takeProfit.type === "atr" ? ctxAtr(ctx, strategy.takeProfit.atrPeriod ?? 14) : null;
  const trailAtr = strategy.trailingStop.type === "atr" ? ctxAtr(ctx, strategy.trailingStop.atrPeriod ?? 14) : null;
  const swingLow = strategy.stop.type === "swing" ? ind.lowest(l, Math.max(1, Math.round(strategy.stop.value ?? 10))) : null;
  const swingHigh = strategy.stop.type === "swing" ? ind.highest(h, Math.max(1, Math.round(strategy.stop.value ?? 10))) : null;

  const fee = config.feePercent / 100;
  const halfSpread = config.spreadPercent / 200;
  const slip = config.slippagePercent / 100;
  const fundingPerMs = config.fundingPercentPer8h / 100 / (8 * 3_600_000);

  const windowStart = strategy.tradingWindow ? parseHHMM(strategy.tradingWindow.start) : null;
  const windowEnd = strategy.tradingWindow ? parseHHMM(strategy.tradingWindow.end) : null;
  const exitMinute = strategy.exitAtTime ? parseHHMM(strategy.exitAtTime) : null;
  const allowedDays = new Set(strategy.tradingDays);
  const needsTime = windowStart !== null || exitMinute !== null || allowedDays.size < 7;
  const closeLocal = needsTime ? ctx.closeLocal : null;

  const equityCurve = new Float64Array(n);
  const trades: Trade[] = [];
  let equity = config.initialCapital;
  let skipped = 0;

  type Pos = {
    side: 1 | -1;
    entryIndex: number;
    entryPrice: number;
    qty: number;
    notional: number;
    stop: number | null;
    initialStopDist: number | null;
    target: number | null;
    /** Exchange fee paid at entry. Spread and slippage are already in entryPrice. */
    entryFee: number;
    /** Spread and slippage paid at entry, for the costs column only. */
    entrySpreadCost: number;
    riskAmount: number | null;
    equityBefore: number;
    worst: number;
    best: number;
    stopKind: "stop" | "trailing" | "breakeven";
  };
  let pos: Pos | null = null;
  let pendingEntry: { side: 1 | -1; signalIndex: number } | null = null;
  let pendingExit: ExitReason | null = null;

  const canEnterAt = (i: number) => {
    if (i < startIndex) return false;
    if (!closeLocal) return true;
    if (!allowedDays.has(closeLocal.weekday[i])) return false;
    const m = closeLocal.minuteOfDay[i];
    if (exitMinute !== null && m >= exitMinute) return false;
    if (windowStart !== null && windowEnd !== null) {
      const inside = windowStart <= windowEnd ? m >= windowStart && m <= windowEnd : m >= windowStart || m <= windowEnd;
      if (!inside) return false;
    }
    return true;
  };

  /**
   * Closes the position at bar i. `atOpen` exits (pending orders) happen before
   * bar i trades, so bar i is not part of the holding period.
   */
  const close = (i: number, rawPrice: number, reason: ExitReason, isLimit: boolean, atOpen: boolean) => {
    const p = pos!;
    const adverse = isLimit ? halfSpread : halfSpread + slip;
    const exitPrice = p.side === 1 ? rawPrice * (1 - adverse) : rawPrice * (1 + adverse);
    const exitNotional = p.qty * exitPrice;
    const exitFee = exitNotional * fee;
    const bars = Math.max(1, i - p.entryIndex + (atOpen ? 0 : 1));
    const funding = p.notional * fundingPerMs * bars * barMs;
    const gross = p.side * p.qty * (exitPrice - p.entryPrice);
    const pnl = gross - p.entryFee - exitFee - funding;
    equity += pnl;
    trades.push({
      side: p.side === 1 ? "long" : "short",
      entryIndex: p.entryIndex,
      exitIndex: i,
      entryTime: t[p.entryIndex],
      exitTime: t[i],
      entryPrice: p.entryPrice,
      exitPrice,
      stopPrice: p.stop,
      targetPrice: p.target,
      exitReason: reason,
      qty: p.qty,
      notional: p.notional,
      pnl,
      pnlPercent: (pnl / p.equityBefore) * 100,
      r: p.riskAmount ? pnl / p.riskAmount : null,
      riskAmount: p.riskAmount,
      costs: p.entryFee + p.entrySpreadCost + exitFee + funding + Math.abs(p.qty * (rawPrice - exitPrice)),
      bars,
      maePercent: (p.worst / p.equityBefore) * 100,
      mfePercent: (p.best / p.equityBefore) * 100,
      equityBefore: p.equityBefore,
      equityAfter: equity,
    });
    pos = null;
  };

  const open = (i: number, side: 1 | -1, signalIndex: number) => {
    const raw = o[i];
    const entryPrice = side === 1 ? raw * (1 + halfSpread + slip) : raw * (1 - halfSpread - slip);
    let stop: number | null = null;
    const s = strategy.stop;
    if (s.type === "percent") stop = entryPrice * (1 - side * (s.value! / 100));
    else if (s.type === "atr") stop = entryPrice - side * s.value! * stopAtr![signalIndex];
    else if (s.type === "swing") stop = side === 1 ? swingLow![signalIndex] : swingHigh![signalIndex];
    if (stop !== null && (Number.isNaN(stop) || side * (entryPrice - stop) <= 0)) {
      skipped++;
      return;
    }
    const stopDist = stop !== null ? Math.abs(entryPrice - stop) : null;
    let target: number | null = null;
    const tp = strategy.takeProfit;
    if (tp.type === "percent") target = entryPrice * (1 + side * (tp.value! / 100));
    else if (tp.type === "atr") target = entryPrice + side * tp.value! * tpAtr![signalIndex];
    else if (tp.type === "r_multiple" && stopDist) target = entryPrice + side * tp.value! * stopDist;
    if (target !== null && Number.isNaN(target)) target = null;

    const maxNotional = equity * strategy.maxLeverage;
    let notional: number;
    let riskAmount: number | null = null;
    if (stopDist) {
      riskAmount = (equity * strategy.riskPerTradePercent) / 100;
      notional = Math.min((riskAmount / stopDist) * entryPrice, maxNotional);
    } else {
      notional = Math.min((equity * strategy.positionSizePercent) / 100, maxNotional);
    }
    if (!(notional > 0) || equity <= 0) {
      skipped++;
      return;
    }
    const qty = notional / entryPrice;
    pos = {
      side,
      entryIndex: i,
      entryPrice,
      qty,
      notional,
      stop,
      initialStopDist: stopDist,
      target,
      entryFee: notional * fee,
      entrySpreadCost: qty * Math.abs(entryPrice - raw),
      riskAmount,
      equityBefore: equity,
      worst: 0,
      best: 0,
      stopKind: "stop",
    };
  };

  for (let i = 0; i < n; i++) {
    // 1. Orders decided at the previous close fill at this bar's open.
    if (pendingExit && pos) {
      close(i, o[i], pendingExit, false, true);
    }
    pendingExit = null;
    if (pendingEntry && !pos) open(i, pendingEntry.side, pendingEntry.signalIndex);
    pendingEntry = null;

    // 2. Stops, targets and liquidation inside the bar. When the stop and the target are both touched, the stop is assumed first.
    if (pos) {
      const p: Pos = pos;
      const adverseExtreme = p.side === 1 ? l[i] : h[i];
      const favourableExtreme = p.side === 1 ? h[i] : l[i];
      const move = (price: number) => p.side * p.qty * (price - p.entryPrice);
      // The price at which the position's loss wipes out the account.
      const liquidation = p.entryPrice - (p.side * (p.equityBefore - p.entryFee)) / p.qty;
      const touches = (level: number) => p.side * (adverseExtreme - level) <= 0;
      const fillAt = (level: number) => (i > p.entryIndex && p.side * (o[i] - level) <= 0 ? o[i] : level);
      let exit: { price: number; reason: ExitReason; limit: boolean } | null = null;
      if (p.stop !== null && touches(p.stop) && p.side * (p.stop - liquidation) > 0) {
        exit = { price: fillAt(p.stop), reason: p.stopKind, limit: false };
      } else if (touches(liquidation)) {
        exit = { price: liquidation, reason: "liquidation", limit: false };
      } else if (p.target !== null && p.side * (favourableExtreme - p.target) >= 0) {
        const gapBeyond = i > p.entryIndex && p.side * (o[i] - p.target) >= 0;
        exit = { price: gapBeyond ? o[i] : p.target, reason: "target", limit: true };
      }
      // Excursions stop at the exit: the rest of the bar's range happened without the position.
      const worstPrice = exit && exit.reason !== "target" ? exit.price : adverseExtreme;
      const bestPrice = exit && exit.reason === "target" ? exit.price : favourableExtreme;
      p.worst = Math.min(p.worst, move(worstPrice));
      p.best = Math.max(p.best, move(bestPrice));
      if (exit) close(i, exit.price, exit.reason, exit.limit, false);
    }

    // 3. Decisions at the bar close.
    if (pos) {
      const p: Pos = pos;
      const held = i - p.entryIndex + 1;
      if (closeLocal && exitMinute !== null && closeLocal.minuteOfDay[i] >= exitMinute) {
        close(i, c[i], "time", false, false);
      } else if (strategy.maxBarsInTrade && held >= strategy.maxBarsInTrade) {
        close(i, c[i], "max_bars", false, false);
      } else if (i === n - 1) {
        close(i, c[i], "end", false, false);
      } else {
        const opposite = p.side === 1 ? enterShort[i] : enterLong[i];
        const exitSig = p.side === 1 ? exitLong[i] : exitShort[i];
        if (opposite && canEnterAt(i)) {
          pendingExit = "reverse";
          pendingEntry = { side: p.side === 1 ? -1 : 1, signalIndex: i };
        } else if (exitSig) {
          pendingExit = "signal";
        } else {
          // Trailing stop and break-even, applied from the next bar on.
          const tr = strategy.trailingStop;
          if (tr.type !== "none") {
            const extreme = p.side === 1 ? h[i] : l[i];
            const dist = tr.type === "percent" ? extreme * (tr.value! / 100) : tr.value! * trailAtr![i];
            if (!Number.isNaN(dist)) {
              const candidate = extreme - p.side * dist;
              if (p.stop === null || p.side * (candidate - p.stop) > 0) {
                p.stop = candidate;
                p.stopKind = "trailing";
              }
            }
          }
          if (strategy.breakEvenAtR && p.initialStopDist) {
            const extreme = p.side === 1 ? h[i] : l[i];
            const reachedR = (p.side * (extreme - p.entryPrice)) / p.initialStopDist;
            if (reachedR >= strategy.breakEvenAtR && (p.stop === null || p.side * (p.entryPrice - p.stop) > 0)) {
              p.stop = p.entryPrice;
              p.stopKind = "breakeven";
            }
          }
        }
      }
    }
    if (!pos && !pendingEntry && i < n - 1 && canEnterAt(i)) {
      if (enterLong[i]) pendingEntry = { side: 1, signalIndex: i };
      else if (enterShort[i]) pendingEntry = { side: -1, signalIndex: i };
    }

    // Assigned inside closures, so TypeScript narrows it too eagerly.
    const open_ = pos as Pos | null;
    equityCurve[i] = open_
      ? equity + open_.side * open_.qty * (c[i] - open_.entryPrice) - open_.entryFee
      : equity;
  }

  const first = Math.min(startIndex, n - 1);
  return {
    trades,
    equity: equityCurve,
    candlesTime: t,
    initialCapital: config.initialCapital,
    finalEquity: equity,
    skippedSignals: skipped,
    buyAndHoldPercent: n > 0 ? ((c[n - 1] - o[first]) / o[first]) * 100 : 0,
  };
}

function ctxAtr(ctx: SeriesContext, period: number) {
  return ctx.series({
    indicator: "atr",
    period,
    period2: null,
    period3: null,
    multiplier: null,
    source: null,
    value: null,
    offset: 0,
    timeframe: null,
    window: null,
  });
}
