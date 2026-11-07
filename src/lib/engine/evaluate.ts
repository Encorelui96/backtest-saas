import type { Candles, Interval } from "../types";
import { INTERVAL_MS, emptyCandles } from "../types";
import type { Condition, Group, Operand } from "../strategy/schema";
import * as ind from "./indicators";
import { localTimes, parseHHMM, type LocalTimes } from "./time";

/**
 * Computes operand series over a candle set, with memoization so that
 * parameter sweeps re-use every series they share with the base run.
 */
export class SeriesContext {
  readonly n: number;
  private cache = new Map<string, Float64Array>();
  private htf = new Map<Interval, { ctx: SeriesContext; map: Int32Array }>();
  private _local: LocalTimes | null = null;
  private _closeLocal: LocalTimes | null = null;
  private fvg: ReturnType<typeof ind.fairValueGaps> | null = null;
  private ha: ReturnType<typeof ind.heikinAshi> | null = null;

  constructor(
    readonly candles: Candles,
    readonly interval: Interval,
    readonly timezone: string,
  ) {
    this.n = candles.t.length;
  }

  /** Local time of each bar's open, as typed arrays (see LocalTimes). */
  get local(): LocalTimes {
    if (!this._local) this._local = localTimes(this.timezone, this.candles.t);
    return this._local;
  }

  /** Local time of each bar's close, the moment entry and exit decisions are made. Cached for parameter sweeps. */
  get closeLocal(): LocalTimes {
    if (!this._closeLocal) this._closeLocal = localTimes(this.timezone, this.candles.t, INTERVAL_MS[this.interval]);
    return this._closeLocal;
  }

  /**
   * Runs `fn`, then forgets every series it added to the cache, here and on the
   * higher timeframes. A parameter sweep tries dozens of variants on one context:
   * kept, each variant's series would stay in memory until the end of the report
   * (several MB each on a year of 1-minute bars), which is what used to exhaust
   * the worker. The base strategy's series, computed before, stay cached.
   */
  scoped<T>(fn: () => T): T {
    const before = new Set(this.cache.keys());
    const htfBefore = new Map<Interval, Set<string>>();
    for (const [tf, e] of this.htf) htfBefore.set(tf, new Set(e.ctx.cache.keys()));
    try {
      return fn();
    } finally {
      for (const key of this.cache.keys()) if (!before.has(key)) this.cache.delete(key);
      for (const [tf, e] of this.htf) {
        const keep = htfBefore.get(tf);
        // A higher timeframe first built inside the scope goes with it.
        if (!keep) this.htf.delete(tf);
        else for (const key of e.ctx.cache.keys()) if (!keep.has(key)) e.ctx.cache.delete(key);
      }
    }
  }

  /**
   * Supplies real higher-timeframe candles (e.g. downloaded 1d bars) instead of
   * rebuilding them from this candle set, so filters like a daily MM200 work
   * even when this set covers only a few hundred bars.
   */
  attachHigherTimeframe(tf: Interval, htf: Candles) {
    if (INTERVAL_MS[tf] <= INTERVAL_MS[this.interval]) return;
    this.htf.set(tf, { ctx: new SeriesContext(htf, tf, this.timezone), map: mapCompleted(this.candles, this.interval, htf, tf) });
    // Series already computed from the rebuilt candles are stale.
    for (const key of [...this.cache.keys()]) if (key.includes(`"timeframe":"${tf}"`)) this.cache.delete(key);
  }

  /** The operand's value at every bar, offset already applied. */
  series(op: Operand): Float64Array {
    const key = JSON.stringify(op);
    const hit = this.cache.get(key);
    if (hit) return hit;
    let out: Float64Array;
    if (op.timeframe && INTERVAL_MS[op.timeframe] > INTERVAL_MS[this.interval]) {
      out = this.higherTimeframe(op);
    } else {
      const base = this.baseSeries(op);
      out = op.offset > 0 ? shift(base, op.offset) : base;
    }
    this.cache.set(key, out);
    return out;
  }

  private src(name: Operand["source"], fallback: "close" | "high" | "low" | "hlc3" = "close"): Float64Array {
    const c = this.candles;
    switch (name ?? fallback) {
      case "open":
        return c.o;
      case "high":
        return c.h;
      case "low":
        return c.l;
      case "volume":
        return c.v;
      case "hl2":
        return this.memo("src:hl2", () => c.h.map((h, i) => (h + c.l[i]) / 2));
      case "hlc3":
        return this.memo("src:hlc3", () => c.h.map((h, i) => (h + c.l[i] + c.c[i]) / 3));
      case "ohlc4":
        return this.memo("src:ohlc4", () => c.o.map((o, i) => (o + c.h[i] + c.l[i] + c.c[i]) / 4));
      default:
        return c.c;
    }
  }

  private memo(key: string, fn: () => Float64Array) {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const v = fn();
    this.cache.set(key, v);
    return v;
  }

  private baseSeries(op: Operand): Float64Array {
    const c = this.candles;
    const p = op.period ?? 14;
    switch (op.indicator) {
      case "close":
        return c.c;
      case "open":
        return c.o;
      case "high":
        return c.h;
      case "low":
        return c.l;
      case "volume":
        return c.v;
      case "number":
        return new Float64Array(this.n).fill(op.value ?? 0);
      case "sma":
        return ind.sma(this.src(op.source), op.period ?? 20);
      case "ema":
        return ind.ema(this.src(op.source), op.period ?? 20);
      case "rsi":
        return ind.rsi(this.src(op.source), p);
      case "atr":
        return this.memo(`atr:${p}`, () => ind.atr(c.h, c.l, c.c, p));
      case "atr_percent": {
        const a = this.memo(`atr:${p}`, () => ind.atr(c.h, c.l, c.c, p));
        return a.map((x, i) => (x / c.c[i]) * 100);
      }
      case "bb_upper":
      case "bb_middle":
      case "bb_lower": {
        const bb = ind.bollinger(this.src(op.source), op.period ?? 20, op.multiplier ?? 2);
        return op.indicator === "bb_upper" ? bb.upper : op.indicator === "bb_lower" ? bb.lower : bb.mid;
      }
      case "macd":
      case "macd_signal":
      case "macd_hist": {
        const m = ind.macd(this.src(op.source), op.period ?? 12, op.period2 ?? 26, op.period3 ?? 9);
        return op.indicator === "macd" ? m.line : op.indicator === "macd_signal" ? m.signal : m.hist;
      }
      case "stoch_k":
      case "stoch_d": {
        const s = ind.stochastic(c.h, c.l, c.c, p, op.period2 ?? 3, op.period3 ?? 3);
        return op.indicator === "stoch_k" ? s.k : s.d;
      }
      case "adx":
      case "plus_di":
      case "minus_di": {
        const d = this.memo(`dmi:${p}`, () => {
          const r = ind.dmi(c.h, c.l, c.c, p);
          this.cache.set(`dmi:${p}:plus`, r.plus);
          this.cache.set(`dmi:${p}:minus`, r.minus);
          return r.adx;
        });
        return op.indicator === "adx" ? d : this.cache.get(`dmi:${p}:${op.indicator === "plus_di" ? "plus" : "minus"}`)!;
      }
      case "wma":
        return ind.wma(this.src(op.source), op.period ?? 20);
      case "hma":
        return ind.hma(this.src(op.source), op.period ?? 20);
      case "cci":
        return ind.cci(this.src(op.source, "hlc3"), op.period ?? 20);
      case "williams_r":
        return ind.williamsR(c.h, c.l, c.c, p);
      case "swing_high":
      case "swing_low": {
        const s = this.memo(`swings:${op.period ?? 5}:${op.period2 ?? 5}`, () => {
          const r = ind.swings(c.h, c.l, op.period ?? 5, op.period2 ?? 5);
          this.cache.set(`swings:${op.period ?? 5}:${op.period2 ?? 5}:low`, r.low);
          return r.high;
        });
        return op.indicator === "swing_high" ? s : this.cache.get(`swings:${op.period ?? 5}:${op.period2 ?? 5}:low`)!;
      }
      case "bos":
      case "structure": {
        const r = ind.structure(c.h, c.l, c.c, op.period ?? 5, op.period2 ?? 5);
        return op.indicator === "bos" ? r.bos : r.trend;
      }
      case "fvg":
      case "fvg_bull_top":
      case "fvg_bull_bottom":
      case "fvg_bear_top":
      case "fvg_bear_bottom": {
        const g = this.fvg ?? (this.fvg = ind.fairValueGaps(c.h, c.l, c.c));
        return { fvg: g.signal, fvg_bull_top: g.bullTop, fvg_bull_bottom: g.bullBottom, fvg_bear_top: g.bearTop, fvg_bear_bottom: g.bearBottom }[op.indicator];
      }
      case "ha_open":
      case "ha_high":
      case "ha_low":
      case "ha_close": {
        const k = this.ha ?? (this.ha = ind.heikinAshi(c.o, c.h, c.l, c.c));
        return { ha_open: k.open, ha_high: k.high, ha_low: k.low, ha_close: k.close }[op.indicator];
      }
      case "rsi_divergence":
        return ind.divergence(ind.rsi(this.src(op.source), p), c.h, c.l, op.period2 ?? 5);
      case "macd_divergence":
        return ind.divergence(ind.macd(this.src(op.source), op.period ?? 12, op.period2 ?? 26, 9).line, c.h, c.l, op.period3 ?? 5);
      case "stoch_rsi_k":
      case "stoch_rsi_d": {
        const r = ind.stochRsi(this.src(op.source), p, op.period2 ?? 14, op.period3 ?? 3);
        return op.indicator === "stoch_rsi_k" ? r.k : r.d;
      }
      case "aroon_up":
      case "aroon_down": {
        const r = ind.aroon(c.h, c.l, p);
        return op.indicator === "aroon_up" ? r.up : r.down;
      }
      case "cmf":
        return ind.cmf(c.h, c.l, c.c, c.v, op.period ?? 20);
      case "roc":
        return ind.roc(this.src(op.source), op.period ?? 10);
      case "highest":
        return ind.highest(this.src(op.source, "high"), op.period ?? 20);
      case "lowest":
        return ind.lowest(this.src(op.source, "low"), op.period ?? 20);
      case "ibs": {
        const out = new Float64Array(this.n);
        for (let i = 0; i < this.n; i++) {
          const r = c.h[i] - c.l[i];
          out[i] = r > 0 ? (c.c[i] - c.l[i]) / r : 0.5;
        }
        return out;
      }
      case "vwap":
        return this.vwap();
      case "supertrend":
        return ind.supertrend(c.h, c.l, c.c, op.period ?? 10, op.multiplier ?? 3);
      case "psar":
        return ind.psar(c.h, c.l, op.multiplier ?? 0.02, 0.2);
      case "ichimoku_tenkan":
      case "ichimoku_kijun":
      case "ichimoku_span_a":
      case "ichimoku_span_b": {
        const k = ind.ichimoku(c.h, c.l, op.period ?? 9, op.period2 ?? 26, op.period3 ?? 52);
        return { ichimoku_tenkan: k.tenkan, ichimoku_kijun: k.kijun, ichimoku_span_a: k.spanA, ichimoku_span_b: k.spanB }[op.indicator];
      }
      case "keltner_upper":
      case "keltner_middle":
      case "keltner_lower": {
        const k = ind.keltner(c.h, c.l, c.c, op.period ?? 20, op.period2 ?? 10, op.multiplier ?? 2);
        return op.indicator === "keltner_upper" ? k.upper : op.indicator === "keltner_lower" ? k.lower : k.mid;
      }
      case "bb_percent":
      case "bb_width": {
        const b = ind.bollingerPosition(this.src(op.source), op.period ?? 20, op.multiplier ?? 2);
        return op.indicator === "bb_percent" ? b.percentB : b.width;
      }
      case "squeeze":
        return ind.squeeze(c.h, c.l, c.c, op.period ?? 20, op.multiplier ?? 1.5);
      case "chop":
        return ind.choppiness(c.h, c.l, c.c, p);
      case "obv":
        return ind.obv(c.c, c.v);
      case "mfi":
        return ind.mfi(c.h, c.l, c.c, c.v, p);
      case "zscore":
        return ind.zscore(this.src(op.source), op.period ?? 20);
      case "inside_bar":
        return ind.insideBar(c.h, c.l);
      case "engulfing":
        return ind.engulfing(c.o, c.c);
      case "pin_bar":
        return ind.pinBar(c.o, c.h, c.l, c.c);
      case "narrow_range":
        return ind.narrowRange(c.h, c.l, op.period ?? 7);
      case "day_open":
      case "prev_day_high":
      case "prev_day_low":
      case "prev_day_close":
        return this.dailyLevels()[op.indicator];
      case "prev_week_high":
      case "prev_week_low":
        return this.weeklyLevels()[op.indicator];
      case "range_high":
      case "range_low": {
        const r = this.timeRange(op.window ?? null);
        return op.indicator === "range_high" ? r.high : r.low;
      }
      case "pivot":
      case "pivot_r1":
      case "pivot_s1":
      case "pivot_r2":
      case "pivot_s2":
      case "cam_r3":
      case "cam_s3":
      case "cam_r4":
      case "cam_s4":
        return this.pivots()[op.indicator];
      case "hour":
        return Float64Array.from(this.local.minuteOfDay, (m) => Math.floor(m / 60));
      case "minute":
        return Float64Array.from(this.local.minuteOfDay, (m) => m % 60);
      case "weekday":
        return Float64Array.from(this.local.weekday);
    }
  }

  private vwap(): Float64Array {
    return this.memo("vwap", () => {
      const c = this.candles;
      const out = new Float64Array(this.n);
      let day = -1;
      let pv = 0;
      let vol = 0;
      for (let i = 0; i < this.n; i++) {
        const d = this.local.dayKey[i];
        if (d !== day) {
          day = d;
          pv = 0;
          vol = 0;
        }
        const tp = (c.h[i] + c.l[i] + c.c[i]) / 3;
        pv += tp * c.v[i];
        vol += c.v[i];
        out[i] = vol > 0 ? pv / vol : tp;
      }
      return out;
    });
  }

  private _daily: Record<"day_open" | "prev_day_high" | "prev_day_low" | "prev_day_close", Float64Array> | null = null;

  private dailyLevels() {
    if (this._daily) return this._daily;
    const c = this.candles;
    const n = this.n;
    const dayOpen = new Float64Array(n).fill(NaN);
    const pdh = new Float64Array(n).fill(NaN);
    const pdl = new Float64Array(n).fill(NaN);
    const pdc = new Float64Array(n).fill(NaN);
    let day = -1;
    let curOpen = NaN,
      curHigh = -Infinity,
      curLow = Infinity,
      curClose = NaN;
    let prevHigh = NaN,
      prevLow = NaN,
      prevClose = NaN;
    for (let i = 0; i < n; i++) {
      const d = this.local.dayKey[i];
      if (d !== day) {
        if (day !== -1) {
          prevHigh = curHigh;
          prevLow = curLow;
          prevClose = curClose;
        }
        day = d;
        curOpen = c.o[i];
        curHigh = -Infinity;
        curLow = Infinity;
      }
      curHigh = Math.max(curHigh, c.h[i]);
      curLow = Math.min(curLow, c.l[i]);
      curClose = c.c[i];
      dayOpen[i] = curOpen;
      pdh[i] = prevHigh;
      pdl[i] = prevLow;
      pdc[i] = prevClose;
    }
    this._daily = { day_open: dayOpen, prev_day_high: pdh, prev_day_low: pdl, prev_day_close: pdc };
    return this._daily;
  }

  private _weekly: Record<"prev_week_high" | "prev_week_low", Float64Array> | null = null;

  /** High and low of the previous local week, Monday to Sunday. */
  private weeklyLevels() {
    if (this._weekly) return this._weekly;
    const c = this.candles;
    const pwh = new Float64Array(this.n).fill(NaN);
    const pwl = new Float64Array(this.n).fill(NaN);
    let week = NaN;
    let curHigh = -Infinity;
    let curLow = Infinity;
    let prevHigh = NaN;
    let prevLow = NaN;
    for (let i = 0; i < this.n; i++) {
      // Day 0 of the epoch is a Thursday: shifting by 3 makes weeks start on Monday.
      const w = Math.floor((this.local.dayKey[i] + 3) / 7);
      if (w !== week) {
        if (!Number.isNaN(week)) {
          prevHigh = curHigh;
          prevLow = curLow;
        }
        week = w;
        curHigh = -Infinity;
        curLow = Infinity;
      }
      curHigh = Math.max(curHigh, c.h[i]);
      curLow = Math.min(curLow, c.l[i]);
      pwh[i] = prevHigh;
      pwl[i] = prevLow;
    }
    this._weekly = { prev_week_high: pwh, prev_week_low: pwl };
    return this._weekly;
  }

  private _pivots: Record<"pivot" | "pivot_r1" | "pivot_s1" | "pivot_r2" | "pivot_s2" | "cam_r3" | "cam_s3" | "cam_r4" | "cam_s4", Float64Array> | null = null;

  /** Classic floor pivots and Camarilla levels, from the previous local day's high, low and close. */
  private pivots() {
    if (this._pivots) return this._pivots;
    const { prev_day_high: H, prev_day_low: L, prev_day_close: C } = this.dailyLevels();
    const make = (f: (h: number, l: number, c: number, p: number) => number) =>
      Float64Array.from(H, (h, i) => f(h, L[i], C[i], (h + L[i] + C[i]) / 3));
    this._pivots = {
      pivot: make((_h, _l, _c, p) => p),
      pivot_r1: make((_h, l, _c, p) => 2 * p - l),
      pivot_s1: make((h, _l, _c, p) => 2 * p - h),
      pivot_r2: make((h, l, _c, p) => p + (h - l)),
      pivot_s2: make((h, l, _c, p) => p - (h - l)),
      cam_r3: make((h, l, c) => c + ((h - l) * 1.1) / 4),
      cam_s3: make((h, l, c) => c - ((h - l) * 1.1) / 4),
      cam_r4: make((h, l, c) => c + ((h - l) * 1.1) / 2),
      cam_s4: make((h, l, c) => c - ((h - l) * 1.1) / 2),
    };
    return this._pivots;
  }

  /**
   * High and low of a daily time window (e.g. the first 15 minutes of the New
   * York session, or the night from 00:00 to 08:00). NaN while the window is
   * still forming; available from the bar that closes on its end until the
   * end of the local day, or until the next window when it spans midnight.
   */
  private timeRange(w: Operand["window"]): { high: Float64Array; low: Float64Array } {
    const key = `range:${w?.start}-${w?.end}`;
    const high = this.cache.get(`${key}:h`);
    const low = this.cache.get(`${key}:l`);
    if (high && low) return { high, low };
    const outHigh = new Float64Array(this.n).fill(NaN);
    const outLow = new Float64Array(this.n).fill(NaN);
    if (!w) return { high: outHigh, low: outLow };
    const start = parseHHMM(w.start);
    const end = parseHHMM(w.end);
    const spansMidnight = start > end;
    const inside = (m: number) => (spansMidnight ? m >= start || m < end : m >= start && m < end);
    const c = this.candles;
    let forming = false;
    let hi = -Infinity;
    let lo = Infinity;
    let doneHigh = NaN;
    let doneLow = NaN;
    let doneDay = NaN;
    for (let i = 0; i < this.n; i++) {
      const dayKey = this.local.dayKey[i];
      if (inside(this.local.minuteOfDay[i])) {
        if (!forming) {
          forming = true;
          hi = -Infinity;
          lo = Infinity;
          doneHigh = doneLow = NaN;
        }
        hi = Math.max(hi, c.h[i]);
        lo = Math.min(lo, c.l[i]);
        // The bar that closes on the window's end completes the range.
        if (!inside(this.closeLocal.minuteOfDay[i])) {
          forming = false;
          [doneHigh, doneLow, doneDay] = [hi, lo, dayKey];
        }
      } else if (forming) {
        // A gap skipped the window's last bars: settle on what was traded.
        forming = false;
        [doneHigh, doneLow, doneDay] = [hi, lo, dayKey];
      }
      if (spansMidnight || dayKey === doneDay) {
        outHigh[i] = doneHigh;
        outLow[i] = doneLow;
      }
    }
    this.cache.set(`${key}:h`, outHigh);
    this.cache.set(`${key}:l`, outLow);
    return { high: outHigh, low: outLow };
  }

  /** Computes the operand on resampled candles and maps back, using only completed higher-timeframe bars. */
  private higherTimeframe(op: Operand): Float64Array {
    const tf = op.timeframe!;
    let entry = this.htf.get(tf);
    if (!entry) {
      entry = resample(this.candles, this.interval, tf, this.timezone);
      this.htf.set(tf, entry);
    }
    const htfSeries = entry.ctx.series({ ...op, timeframe: null });
    const out = new Float64Array(this.n).fill(NaN);
    for (let i = 0; i < this.n; i++) {
      const k = entry.map[i];
      if (k >= 0) out[i] = htfSeries[k];
    }
    return out;
  }

  /** The operand's series, or its value when it is a plain number (the same at every bar). */
  private operand(op: Operand): Float64Array | number {
    return op.indicator === "number" ? (op.value ?? 0) : this.series(op);
  }

  conditionSeries(cond: Condition): Uint8Array {
    // A constant ("RSI < 30") is compared as a number: a full series for each threshold a sweep tries would cost 8 bytes a bar for nothing.
    const a = this.operand(cond.left);
    const b = this.operand(cond.right);
    const out = new Uint8Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const x = typeof a === "number" ? a : a[i];
      const y = typeof b === "number" ? b : b[i];
      if (Number.isNaN(x) || Number.isNaN(y)) continue;
      let ok = false;
      switch (cond.op) {
        case ">":
          ok = x > y;
          break;
        case ">=":
          ok = x >= y;
          break;
        case "<":
          ok = x < y;
          break;
        case "<=":
          ok = x <= y;
          break;
        case "==":
          ok = Math.abs(x - y) < 1e-9;
          break;
        case "crosses_above":
          ok = i > 0 && x > y && (typeof a === "number" ? a : a[i - 1]) <= (typeof b === "number" ? b : b[i - 1]);
          break;
        case "crosses_below":
          ok = i > 0 && x < y && (typeof a === "number" ? a : a[i - 1]) >= (typeof b === "number" ? b : b[i - 1]);
          break;
      }
      out[i] = ok ? 1 : 0;
    }
    return out;
  }

  /** 1 where any group has all its conditions true. Empty groups never fire. */
  groupsSignal(groups: Group[]): Uint8Array {
    const out = new Uint8Array(this.n);
    for (const g of groups) {
      if (g.conditions.length === 0) continue;
      const parts = g.conditions.map((c) => this.conditionSeries(c));
      for (let i = 0; i < this.n; i++) {
        if (out[i]) continue;
        let all = 1;
        for (const p of parts) {
          if (!p[i]) {
            all = 0;
            break;
          }
        }
        out[i] = all;
      }
    }
    return out;
  }
}

/** For every base bar, the index of the latest higher-timeframe bar closed by the base bar's close (-1 when none). */
function mapCompleted(base: Candles, baseInterval: Interval, htf: Candles, tf: Interval): Int32Array {
  const baseMs = INTERVAL_MS[baseInterval];
  const tfMs = INTERVAL_MS[tf];
  const map = new Int32Array(base.t.length).fill(-1);
  let k = -1;
  for (let i = 0; i < base.t.length; i++) {
    const closeTime = base.t[i] + baseMs;
    while (k + 1 < htf.t.length && htf.t[k + 1] + tfMs <= closeTime) k++;
    map[i] = k;
  }
  return map;
}

function shift(src: Float64Array, k: number): Float64Array {
  const out = new Float64Array(src.length).fill(NaN);
  for (let i = k; i < src.length; i++) out[i] = src[i - k];
  return out;
}

/**
 * Builds higher-timeframe candles (UTC-aligned buckets, like Binance) and, for
 * every base bar, the index of the latest higher-timeframe bar that is complete
 * at that base bar's close (-1 when none).
 */
export function resample(c: Candles, base: Interval, tf: Interval, timezone: string) {
  const tfMs = INTERVAL_MS[tf];
  const baseMs = INTERVAL_MS[base];
  const n = c.t.length;
  const buckets: number[] = [];
  const bucketIndex = new Map<number, number>();
  const rows: { t: number; o: number; h: number; l: number; c: number; v: number }[] = [];
  for (let i = 0; i < n; i++) {
    const b = Math.floor(c.t[i] / tfMs);
    let k = bucketIndex.get(b);
    if (k === undefined) {
      k = rows.length;
      bucketIndex.set(b, k);
      buckets.push(b);
      rows.push({ t: b * tfMs, o: c.o[i], h: c.h[i], l: c.l[i], c: c.c[i], v: c.v[i] });
    } else {
      const r = rows[k];
      r.h = Math.max(r.h, c.h[i]);
      r.l = Math.min(r.l, c.l[i]);
      r.c = c.c[i];
      r.v += c.v[i];
    }
  }
  const out = emptyCandles(rows.length);
  rows.forEach((r, i) => {
    out.t[i] = r.t;
    out.o[i] = r.o;
    out.h[i] = r.h;
    out.l[i] = r.l;
    out.c[i] = r.c;
    out.v[i] = r.v;
  });
  const map = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const b = Math.floor(c.t[i] / tfMs);
    const k = bucketIndex.get(b)!;
    const closesBucket = (c.t[i] + baseMs) % tfMs === 0;
    map[i] = closesBucket ? k : k - 1;
  }
  return { ctx: new SeriesContext(out, tf, timezone), map };
}
