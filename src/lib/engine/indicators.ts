/**
 * Indicator functions over plain number arrays. Every output has the input's
 * length, with NaN during the warm-up period.
 */

type Arr = Float64Array;

function nanArray(n: number): Arr {
  return new Float64Array(n).fill(NaN);
}

export function sma(src: Arr, period: number): Arr {
  const out = nanArray(src.length);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < src.length; i++) {
    const x = src[i];
    if (Number.isNaN(x)) {
      sum = 0;
      count = 0;
      continue;
    }
    sum += x;
    count++;
    if (count > period) sum -= src[i - period];
    if (count >= period) out[i] = sum / period;
  }
  return out;
}

export function ema(src: Arr, period: number): Arr {
  const out = nanArray(src.length);
  const k = 2 / (period + 1);
  let prev = NaN;
  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < src.length; i++) {
    const x = src[i];
    if (Number.isNaN(x)) continue;
    if (Number.isNaN(prev)) {
      seedSum += x;
      seedCount++;
      if (seedCount === period) {
        prev = seedSum / period;
        out[i] = prev;
      }
      continue;
    }
    prev = x * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's smoothing (RMA), used by RSI, ATR and ADX. */
export function rma(src: Arr, period: number): Arr {
  const out = nanArray(src.length);
  let prev = NaN;
  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < src.length; i++) {
    const x = src[i];
    if (Number.isNaN(x)) continue;
    if (Number.isNaN(prev)) {
      seedSum += x;
      seedCount++;
      if (seedCount === period) {
        prev = seedSum / period;
        out[i] = prev;
      }
      continue;
    }
    prev = (prev * (period - 1) + x) / period;
    out[i] = prev;
  }
  return out;
}

export function rsi(src: Arr, period: number): Arr {
  const n = src.length;
  const gains = nanArray(n);
  const losses = nanArray(n);
  for (let i = 1; i < n; i++) {
    const d = src[i] - src[i - 1];
    gains[i] = d > 0 ? d : 0;
    losses[i] = d < 0 ? -d : 0;
  }
  const g = rma(gains, period);
  const l = rma(losses, period);
  const out = nanArray(n);
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(g[i]) || Number.isNaN(l[i])) continue;
    out[i] = l[i] === 0 ? (g[i] === 0 ? 50 : 100) : 100 - 100 / (1 + g[i] / l[i]);
  }
  return out;
}

export function trueRange(h: Arr, l: Arr, c: Arr): Arr {
  const n = c.length;
  const out = nanArray(n);
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      out[i] = h[i] - l[i];
      continue;
    }
    const pc = c[i - 1];
    out[i] = Math.max(h[i] - l[i], Math.abs(h[i] - pc), Math.abs(l[i] - pc));
  }
  return out;
}

export function atr(h: Arr, l: Arr, c: Arr, period: number): Arr {
  return rma(trueRange(h, l, c), period);
}

export function stdev(src: Arr, period: number): Arr {
  const out = nanArray(src.length);
  const mean = sma(src, period);
  for (let i = period - 1; i < src.length; i++) {
    const m = mean[i];
    if (Number.isNaN(m)) continue;
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (src[j] - m) ** 2;
    out[i] = Math.sqrt(s / period);
  }
  return out;
}

export function bollinger(src: Arr, period: number, mult: number) {
  const mid = sma(src, period);
  const sd = stdev(src, period);
  const upper = nanArray(src.length);
  const lower = nanArray(src.length);
  for (let i = 0; i < src.length; i++) {
    upper[i] = mid[i] + mult * sd[i];
    lower[i] = mid[i] - mult * sd[i];
  }
  return { upper, mid, lower };
}

export function macd(src: Arr, fast: number, slow: number, signal: number) {
  const f = ema(src, fast);
  const s = ema(src, slow);
  const line = nanArray(src.length);
  for (let i = 0; i < src.length; i++) line[i] = f[i] - s[i];
  const sig = ema(line, signal);
  const hist = nanArray(src.length);
  for (let i = 0; i < src.length; i++) hist[i] = line[i] - sig[i];
  return { line, signal: sig, hist };
}

export function highest(src: Arr, period: number): Arr {
  const out = nanArray(src.length);
  // Monotonic deque for O(n).
  const dq: number[] = [];
  for (let i = 0; i < src.length; i++) {
    while (dq.length && src[dq[dq.length - 1]] <= src[i]) dq.pop();
    dq.push(i);
    if (dq[0] <= i - period) dq.shift();
    if (i >= period - 1) out[i] = src[dq[0]];
  }
  return out;
}

export function lowest(src: Arr, period: number): Arr {
  const out = nanArray(src.length);
  const dq: number[] = [];
  for (let i = 0; i < src.length; i++) {
    while (dq.length && src[dq[dq.length - 1]] >= src[i]) dq.pop();
    dq.push(i);
    if (dq[0] <= i - period) dq.shift();
    if (i >= period - 1) out[i] = src[dq[0]];
  }
  return out;
}

export function stochastic(h: Arr, l: Arr, c: Arr, period: number, smoothK: number, smoothD: number) {
  const hh = highest(h, period);
  const ll = lowest(l, period);
  const raw = nanArray(c.length);
  for (let i = 0; i < c.length; i++) {
    const range = hh[i] - ll[i];
    raw[i] = range > 0 ? ((c[i] - ll[i]) / range) * 100 : 50;
    if (Number.isNaN(hh[i])) raw[i] = NaN;
  }
  const k = smoothK > 1 ? sma(raw, smoothK) : raw;
  const d = sma(k, smoothD);
  return { k, d };
}

export function adx(h: Arr, l: Arr, c: Arr, period: number): Arr {
  const n = c.length;
  const plusDM = nanArray(n);
  const minusDM = nanArray(n);
  for (let i = 1; i < n; i++) {
    const up = h[i] - h[i - 1];
    const down = l[i - 1] - l[i];
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
  }
  const tr = trueRange(h, l, c);
  tr[0] = NaN;
  const trS = rma(tr, period);
  const pS = rma(plusDM, period);
  const mS = rma(minusDM, period);
  const dx = nanArray(n);
  for (let i = 0; i < n; i++) {
    if (!(trS[i] > 0)) continue;
    const pdi = (100 * pS[i]) / trS[i];
    const mdi = (100 * mS[i]) / trS[i];
    const sum = pdi + mdi;
    dx[i] = sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum;
  }
  return rma(dx, period);
}

export function roc(src: Arr, period: number): Arr {
  const out = nanArray(src.length);
  for (let i = period; i < src.length; i++) out[i] = ((src[i] - src[i - period]) / src[i - period]) * 100;
  return out;
}

/** Value `k` bars earlier, NaN before. */
function lag(src: Arr, k: number): Arr {
  const out = nanArray(src.length);
  for (let i = k; i < src.length; i++) out[i] = src[i - k];
  return out;
}

/**
 * Line at `mult` ATR from the bar's midpoint: under the price in an uptrend,
 * above it in a downtrend. Each band only tightens while the trend lasts, and
 * the trend flips when the close crosses the opposite band.
 */
export function supertrend(h: Arr, l: Arr, c: Arr, period: number, mult: number): Arr {
  const n = c.length;
  const a = atr(h, l, c, period);
  const out = nanArray(n);
  let upper = NaN;
  let lower = NaN;
  let up = true;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(a[i])) continue;
    const mid = (h[i] + l[i]) / 2;
    const basicUpper = mid + mult * a[i];
    const basicLower = mid - mult * a[i];
    if (Number.isNaN(upper)) {
      upper = basicUpper;
      lower = basicLower;
      up = c[i] >= mid;
    } else {
      const pc = c[i - 1];
      upper = basicUpper < upper || pc > upper ? basicUpper : upper;
      lower = basicLower > lower || pc < lower ? basicLower : lower;
      if (up && c[i] < lower) up = false;
      else if (!up && c[i] > upper) up = true;
    }
    out[i] = up ? lower : upper;
  }
  return out;
}

/** EMA of the close with bands at `mult` ATR. */
export function keltner(h: Arr, l: Arr, c: Arr, period: number, atrPeriod: number, mult: number) {
  const mid = ema(c, period);
  const a = atr(h, l, c, atrPeriod);
  const upper = nanArray(c.length);
  const lower = nanArray(c.length);
  for (let i = 0; i < c.length; i++) {
    upper[i] = mid[i] + mult * a[i];
    lower[i] = mid[i] - mult * a[i];
  }
  return { upper, mid, lower };
}

/** 1 while the Bollinger bands (period, 2) sit inside the Keltner channel (period, `kcMult` ATR): volatility is unusually low. */
export function squeeze(h: Arr, l: Arr, c: Arr, period: number, kcMult: number): Arr {
  const bb = bollinger(c, period, 2);
  const kc = keltner(h, l, c, period, period, kcMult);
  const out = nanArray(c.length);
  for (let i = 0; i < c.length; i++) {
    if (Number.isNaN(bb.upper[i]) || Number.isNaN(kc.upper[i])) continue;
    out[i] = bb.upper[i] < kc.upper[i] && bb.lower[i] > kc.lower[i] ? 1 : 0;
  }
  return out;
}

/** Where the close sits between the Bollinger bands (0 = lower band, 1 = upper band), and their width in % of the middle. */
export function bollingerPosition(src: Arr, period: number, mult: number) {
  const bb = bollinger(src, period, mult);
  const percentB = nanArray(src.length);
  const width = nanArray(src.length);
  for (let i = 0; i < src.length; i++) {
    const span = bb.upper[i] - bb.lower[i];
    percentB[i] = span > 0 ? (src[i] - bb.lower[i]) / span : 0.5;
    width[i] = bb.mid[i] !== 0 ? (span / bb.mid[i]) * 100 : NaN;
    if (Number.isNaN(bb.mid[i])) percentB[i] = width[i] = NaN;
  }
  return { percentB, width };
}

/** Choppiness index: near 100 when the price zigzags in place, near 0 when it travels in a straight line. */
export function choppiness(h: Arr, l: Arr, c: Arr, period: number): Arr {
  const tr = trueRange(h, l, c);
  const sumTr = sma(tr, period);
  const hh = highest(h, period);
  const ll = lowest(l, period);
  const out = nanArray(c.length);
  for (let i = 0; i < c.length; i++) {
    const span = hh[i] - ll[i];
    if (Number.isNaN(sumTr[i]) || !(span > 0)) continue;
    out[i] = (100 * Math.log10((sumTr[i] * period) / span)) / Math.log10(period);
  }
  return out;
}

/**
 * Ichimoku lines. The cloud spans are those drawn under the current bar,
 * i.e. computed `kijunPeriod` bars earlier, so they never use future prices.
 */
export function ichimoku(h: Arr, l: Arr, tenkanPeriod: number, kijunPeriod: number, spanBPeriod: number) {
  const mid = (p: number) => {
    const hh = highest(h, p);
    const ll = lowest(l, p);
    return hh.map((x, i) => (x + ll[i]) / 2);
  };
  const tenkan = mid(tenkanPeriod);
  const kijun = mid(kijunPeriod);
  const spanA = tenkan.map((x, i) => (x + kijun[i]) / 2);
  return { tenkan, kijun, spanA: lag(spanA, kijunPeriod), spanB: lag(mid(spanBPeriod), kijunPeriod) };
}

/** Wilder's Parabolic SAR: the stop level of the current trend, under the price in an uptrend, above it in a downtrend. */
export function psar(h: Arr, l: Arr, step: number, max: number): Arr {
  const n = h.length;
  const out = nanArray(n);
  if (n < 3) return out;
  let up = h[1] >= h[0];
  let sar = up ? Math.min(l[0], l[1]) : Math.max(h[0], h[1]);
  let ep = up ? Math.max(h[0], h[1]) : Math.min(l[0], l[1]);
  let af = step;
  for (let i = 2; i < n; i++) {
    sar += af * (ep - sar);
    if (up) {
      sar = Math.min(sar, l[i - 1], l[i - 2]);
      if (l[i] < sar) {
        up = false;
        sar = ep;
        ep = l[i];
        af = step;
      } else if (h[i] > ep) {
        ep = h[i];
        af = Math.min(max, af + step);
      }
    } else {
      sar = Math.max(sar, h[i - 1], h[i - 2]);
      if (h[i] > sar) {
        up = true;
        sar = ep;
        ep = h[i];
        af = step;
      } else if (l[i] < ep) {
        ep = l[i];
        af = Math.min(max, af + step);
      }
    }
    out[i] = sar;
  }
  return out;
}

/** On-balance volume: volume added on up closes, subtracted on down closes. Only its direction matters. */
export function obv(c: Arr, v: Arr): Arr {
  const out = new Float64Array(c.length);
  for (let i = 1; i < c.length; i++) out[i] = out[i - 1] + (c[i] > c[i - 1] ? v[i] : c[i] < c[i - 1] ? -v[i] : 0);
  return out;
}

/** Money flow index: an RSI of the typical price weighted by volume, 0 to 100. */
export function mfi(h: Arr, l: Arr, c: Arr, v: Arr, period: number): Arr {
  const n = c.length;
  const pos = new Float64Array(n);
  const neg = new Float64Array(n);
  let prevTp = NaN;
  for (let i = 0; i < n; i++) {
    const tp = (h[i] + l[i] + c[i]) / 3;
    if (tp > prevTp) pos[i] = tp * v[i];
    else if (tp < prevTp) neg[i] = tp * v[i];
    prevTp = tp;
  }
  const out = nanArray(n);
  let p = 0;
  let m = 0;
  for (let i = 1; i < n; i++) {
    p += pos[i];
    m += neg[i];
    if (i > period) {
      p -= pos[i - period];
      m -= neg[i - period];
    }
    if (i >= period) out[i] = m > 0 ? 100 - 100 / (1 + p / m) : p > 0 ? 100 : 50;
  }
  return out;
}

/** How many standard deviations the value sits from its N-bar mean. */
export function zscore(src: Arr, period: number): Arr {
  const mean = sma(src, period);
  const sd = stdev(src, period);
  return mean.map((m, i) => (Number.isNaN(m) ? NaN : sd[i] > 0 ? (src[i] - m) / sd[i] : 0));
}

// Candle patterns: 1 (bullish), −1 (bearish) or 0. Read on the bar that just closed.

/** 1 when the bar's range sits inside the previous bar's. */
export function insideBar(h: Arr, l: Arr): Arr {
  const out = nanArray(h.length);
  for (let i = 1; i < h.length; i++) out[i] = h[i] < h[i - 1] && l[i] > l[i - 1] ? 1 : 0;
  return out;
}

/** 1 when a rising body swallows the previous falling body, −1 for the reverse. */
export function engulfing(o: Arr, c: Arr): Arr {
  const out = nanArray(c.length);
  for (let i = 1; i < c.length; i++) {
    const prevBody = c[i - 1] - o[i - 1];
    const body = c[i] - o[i];
    if (prevBody < 0 && body > 0 && o[i] <= c[i - 1] && c[i] >= o[i - 1] && body > -prevBody) out[i] = 1;
    else if (prevBody > 0 && body < 0 && o[i] >= c[i - 1] && c[i] <= o[i - 1] && -body > prevBody) out[i] = -1;
    else out[i] = 0;
  }
  return out;
}

/** 1 when the lower wick makes at least 2/3 of the range (prices below were rejected), −1 for the upper wick. */
export function pinBar(o: Arr, h: Arr, l: Arr, c: Arr): Arr {
  const out = new Float64Array(c.length);
  for (let i = 0; i < c.length; i++) {
    const range = h[i] - l[i];
    if (!(range > 0)) continue;
    if (Math.min(o[i], c[i]) - l[i] >= (range * 2) / 3) out[i] = 1;
    else if (h[i] - Math.max(o[i], c[i]) >= (range * 2) / 3) out[i] = -1;
  }
  return out;
}

/** 1 when the bar has the smallest range of the last N (NR7 with N = 7): a calm that often precedes a move. */
export function narrowRange(h: Arr, l: Arr, period: number): Arr {
  const range = h.map((x, i) => x - l[i]);
  const low = lowest(range, period);
  return low.map((x, i) => (Number.isNaN(x) ? NaN : range[i] <= x ? 1 : 0));
}
