import { PLANS, type PlanId } from "./plans";

/**
 * The figures of the admin page, computed from one row per user. A user is
 * "activated" once a backtest has finished: it is the first moment the product
 * delivers what it promises. Times are epoch milliseconds.
 */

const DAY = 86_400_000;

export interface UserRow {
  createdAt: number;
  firstBacktest: number | null;
  /** Latest backtest or AI translation. */
  lastActivity: number | null;
}

export interface Ratio {
  n: number;
  /** Users old enough to be counted. */
  of: number;
}

export interface Funnel {
  users: number;
  signups7d: number;
  signups30d: number;
  activated: Ratio;
  activatedWithinDay: Ratio;
  /** Median delay between sign-up and first finished backtest, in hours. */
  medianHoursToValue: number | null;
  /** Activated users still active 7 (30) days or more after signing up. */
  back7: Ratio;
  back30: Ratio;
}

export interface Cohort {
  /** Monday of the sign-up week, YYYY-MM-DD (UTC). */
  week: string;
  signups: number;
  activated: number;
  back7: Ratio;
  back30: Ratio;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Among activated users who signed up at least `days` ago, those active `days` or more after signing up. */
function back(rows: UserRow[], days: number, now: number): Ratio {
  const eligible = rows.filter((r) => r.firstBacktest !== null && now - r.createdAt >= days * DAY);
  return { n: eligible.filter((r) => r.lastActivity !== null && r.lastActivity - r.createdAt >= days * DAY).length, of: eligible.length };
}

export function funnel(rows: UserRow[], now: number): Funnel {
  const activated = rows.filter((r) => r.firstBacktest !== null);
  const dayOld = rows.filter((r) => now - r.createdAt >= DAY);
  return {
    users: rows.length,
    signups7d: rows.filter((r) => now - r.createdAt < 7 * DAY).length,
    signups30d: rows.filter((r) => now - r.createdAt < 30 * DAY).length,
    activated: { n: activated.length, of: rows.length },
    activatedWithinDay: { n: dayOld.filter((r) => r.firstBacktest !== null && r.firstBacktest - r.createdAt < DAY).length, of: dayOld.length },
    medianHoursToValue: median(activated.map((r) => (r.firstBacktest! - r.createdAt) / 3_600_000)),
    back7: back(rows, 7, now),
    back30: back(rows, 30, now),
  };
}

export function weekOf(t: number): string {
  const d = new Date(t);
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * DAY;
  return new Date(monday).toISOString().slice(0, 10);
}

/** One line per sign-up week, newest first. */
export function cohorts(rows: UserRow[], now: number, weeks = 8): Cohort[] {
  const byWeek = new Map<string, UserRow[]>();
  for (const r of rows) {
    const w = weekOf(r.createdAt);
    byWeek.set(w, [...(byWeek.get(w) ?? []), r]);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, weeks)
    .map(([week, rs]) => ({
      week,
      signups: rs.length,
      activated: rs.filter((r) => r.firstBacktest !== null).length,
      back7: back(rs, 7, now),
      back30: back(rs, 30, now),
    }));
}

export interface MonthUse {
  plan: PlanId;
  backtests: number;
  ai: number;
}

/** Users near (80 %) or at their monthly limit: the moment to show them the paid offers. */
export function quotaPressure(rows: MonthUse[]) {
  const share = (r: MonthUse) => Math.max(r.backtests / PLANS[r.plan].backtestsPerMonth, r.ai / PLANS[r.plan].aiPerMonth);
  return { near: rows.filter((r) => share(r) >= 0.8 && share(r) < 1).length, at: rows.filter((r) => share(r) >= 1).length };
}

/** One account in the admin's list of sign-ups. */
export interface Signup {
  email: string;
  emailVerified: boolean;
  createdAt: number;
  plan: PlanId;
  /** Backtests saved since the account was opened. */
  backtests: number;
  lastActivity: number | null;
}

/** Newest sign-ups first, at most `limit` of them: the page stays light however many accounts there are. */
export function latestSignups(rows: Signup[], limit = 200): Signup[] {
  return [...rows].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export interface AdminMetrics {
  generatedAt: number;
  funnel: Funnel;
  cohorts: Cohort[];
  signups: Signup[];
  quotas: { near: number; at: number };
  ai: {
    /** Translations this month, and how many have their tokens recorded. */
    calls: number;
    measured: number;
    costUsd: number;
    /** Average cost of a measured translation, in dollars. */
    perCallUsd: number | null;
    topUsers: { email: string; calls: number; costUsd: number }[];
  };
  pmf: {
    answers: { very: number; somewhat: number; not: number };
    comments: { answer: string; comment: string; createdAt: number }[];
  };
  /** A plan id, or "pack:<id>" for a recharge. */
  interest: { plan: string; billing: string; n: number }[];
  /** Most requested first. */
  marketRequests: { market: string; n: number }[];
}
