export const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type Interval = (typeof INTERVALS)[number];

export const INTERVAL_MS: Record<Interval, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

/** Largest history we allow per interval, so a 1m backtest doesn't try to load 8 years of data. */
export const MAX_HISTORY_DAYS: Record<Interval, number> = {
  "1m": 400,
  "5m": 1100,
  "15m": 2200,
  "1h": 3000,
  "4h": 3000,
  "1d": 3000,
};

/** Columnar candles: one typed array per field, `t` is the open time in ms (UTC). */
export interface Candles {
  t: Float64Array;
  o: Float64Array;
  h: Float64Array;
  l: Float64Array;
  c: Float64Array;
  v: Float64Array;
}

export function emptyCandles(n = 0): Candles {
  return {
    t: new Float64Array(n),
    o: new Float64Array(n),
    h: new Float64Array(n),
    l: new Float64Array(n),
    c: new Float64Array(n),
    v: new Float64Array(n),
  };
}

export function sliceCandles(c: Candles, from: number, to: number): Candles {
  return {
    t: c.t.slice(from, to),
    o: c.o.slice(from, to),
    h: c.h.slice(from, to),
    l: c.l.slice(from, to),
    c: c.c.slice(from, to),
    v: c.v.slice(from, to),
  };
}

export interface CandleRow {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export function rowsToCandles(rows: CandleRow[]): Candles {
  const out = emptyCandles(rows.length);
  rows.forEach((r, i) => {
    out.t[i] = r.t;
    out.o[i] = r.o;
    out.h[i] = r.h;
    out.l[i] = r.l;
    out.c[i] = r.c;
    out.v[i] = r.v;
  });
  return out;
}
