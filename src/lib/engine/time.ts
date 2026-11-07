/** Local-time helpers. Offsets are cached per UTC hour, which is exact for whole- and half-hour zones. */

const formatters = new Map<string, Intl.DateTimeFormat>();
const offsetCache = new Map<string, Map<number, number>>();

function formatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Minutes to add to UTC to get local time. */
export function tzOffsetMinutes(tz: string, t: number): number {
  let cache = offsetCache.get(tz);
  if (!cache) {
    cache = new Map();
    offsetCache.set(tz, cache);
  }
  const hourKey = Math.floor(t / 3_600_000);
  const hit = cache.get(hourKey);
  if (hit !== undefined) return hit;
  const parts = formatter(tz).formatToParts(new Date(hourKey * 3_600_000));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  const off = Math.round((asUtc - hourKey * 3_600_000) / 60_000);
  cache.set(hourKey, off);
  return off;
}

export interface LocalTime {
  /** Minutes since local midnight. */
  minuteOfDay: number;
  hour: number;
  minute: number;
  /** 1 = Monday … 7 = Sunday */
  weekday: number;
  /** Days since epoch in local time, used to group bars by day. */
  dayKey: number;
}

export function localTime(tz: string, t: number): LocalTime {
  const local = t + tzOffsetMinutes(tz, t) * 60_000;
  const dayKey = Math.floor(local / 86_400_000);
  const minuteOfDay = Math.floor((local - dayKey * 86_400_000) / 60_000);
  const jsDay = new Date(dayKey * 86_400_000).getUTCDay();
  return {
    minuteOfDay,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    weekday: jsDay === 0 ? 7 : jsDay,
    dayKey,
  };
}

/**
 * The local time of every bar, as typed arrays: 7 bytes a bar instead of an
 * object of about 80. A year of 1-minute bars is 4 MB this way, not 45.
 */
export interface LocalTimes {
  /** Minutes since local midnight. */
  minuteOfDay: Int16Array;
  /** 1 = Monday … 7 = Sunday */
  weekday: Int8Array;
  /** Days since epoch in local time, used to group bars by day. */
  dayKey: Int32Array;
}

/** localTime() for every time in `ts`, shifted by `offsetMs` (a bar's close is its open plus the bar length). */
export function localTimes(tz: string, ts: ArrayLike<number>, offsetMs = 0): LocalTimes {
  const n = ts.length;
  const minuteOfDay = new Int16Array(n);
  const weekday = new Int8Array(n);
  const dayKey = new Int32Array(n);
  let lastDay = NaN;
  let lastWeekday = 0;
  for (let i = 0; i < n; i++) {
    const t = ts[i] + offsetMs;
    const local = t + tzOffsetMinutes(tz, t) * 60_000;
    const d = Math.floor(local / 86_400_000);
    if (d !== lastDay) {
      // Day 0 of the epoch is a Thursday (4): one modulo instead of a Date per bar.
      const jsDay = (((d + 4) % 7) + 7) % 7;
      lastWeekday = jsDay === 0 ? 7 : jsDay;
      lastDay = d;
    }
    minuteOfDay[i] = Math.floor((local - d * 86_400_000) / 60_000);
    weekday[i] = lastWeekday;
    dayKey[i] = d;
  }
  return { minuteOfDay, weekday, dayKey };
}

export function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export function utcDayKey(t: number) {
  return Math.floor(t / 86_400_000);
}
