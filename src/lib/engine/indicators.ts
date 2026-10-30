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
