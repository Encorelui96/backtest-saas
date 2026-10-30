import type { Candles, Interval } from "../types";
import { INTERVAL_MS, emptyCandles } from "../types";
import type { Condition, Group, Operand } from "../strategy/schema";
import * as ind from "./indicators";
import { localTime, type LocalTime } from "./time";

/**
 * Computes operand series over a candle set, with memoization so that
 * parameter sweeps re-use every series they share with the base run.
 */
export class SeriesContext {
  readonly n: number;
  private cache = new Map<string, Float64Array>();
  private htf = new Map<Interval, { ctx: SeriesContext; map: Int32Array }>();
  private _local: LocalTime[] | null = null;

  constructor(
    readonly candles: Candles,
    readonly interval: Interval,
    readonly timezone: string,
  ) {
    this.n = candles.t.length;
  }

  get local(): LocalTime[] {
    if (!this._local) {
      const out: LocalTime[] = new Array(this.n);
      for (let i = 0; i < this.n; i++) out[i] = localTime(this.timezone, this.candles.t[i]);
      this._local = out;
    }
    return this._local;
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

  private src(name: Operand["source"], fallback: "close" | "high" | "low" = "close"): Float64Array {
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
        return ind.adx(c.h, c.l, c.c, p);
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
      case "day_open":
      case "prev_day_high":
      case "prev_day_low":
      case "prev_day_close":
        return this.dailyLevels()[op.indicator];
      case "hour":
        return Float64Array.from(this.local, (lt) => lt.hour);
      case "minute":
        return Float64Array.from(this.local, (lt) => lt.minute);
      case "weekday":
        return Float64Array.from(this.local, (lt) => lt.weekday);
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
        const d = this.local[i].dayKey;
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
      const d = this.local[i].dayKey;
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

  conditionSeries(cond: Condition): Uint8Array {
    const a = this.series(cond.left);
    const b = this.series(cond.right);
    const out = new Uint8Array(this.n);
    for (let i = 0; i < this.n; i++) {
      const x = a[i];
      const y = b[i];
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
          ok = i > 0 && x > y && a[i - 1] <= b[i - 1];
          break;
        case "crosses_below":
          ok = i > 0 && x < y && a[i - 1] >= b[i - 1];
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
