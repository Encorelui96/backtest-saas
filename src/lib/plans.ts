import { currentLang, formatEuros, type Lang } from "@/lib/i18n";
import type { Interval } from "./types";

/**
 * The offers, shared by the quotas (server) and the pricing page (browser).
 * Prices are what a customer pays, VAT included (TTC): the customers are individuals.
 */

export type PlanId = "free" | "trader" | "pro";
export type Billing = "month" | "year";

export interface Plan {
  id: PlanId;
  label: string;
  /** One line on who the offer is for. */
  pitch: string;
  /** Euros per month when paid monthly. */
  monthly: number;
  /** Euros per year when paid yearly: two months free. */
  yearly: number;
  backtestsPerMonth: number;
  aiPerMonth: number;
  /** Shortest strategy timeframe allowed. */
  minInterval: Interval;
  /** How far back from today a backtest can start, in days; null for the whole history. */
  historyDays: number | null;
  /** Following strategies on the Live page. Plain charts stay open to all. */
  live: boolean;
  /** The detail of the robustness checks and the side-by-side prop firm comparison. */
  advanced: boolean;
  /** Backtests running or waiting at the same time. */
  concurrentJobs: number;
  alerts: number;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    label: "Découverte",
    pitch: "Pour découvrir le backtest et tester tes premières idées.",
    monthly: 0,
    yearly: 0,
    backtestsPerMonth: 30,
    aiPerMonth: 5,
    minInterval: "15m",
    historyDays: 365,
    live: false,
    advanced: false,
    concurrentJobs: 1,
    alerts: 0,
  },
  trader: {
    id: "trader",
    label: "Trader",
    pitch: "Pour tester sérieusement, y compris le scalp et le day trading.",
    monthly: 15,
    yearly: 150,
    backtestsPerMonth: 100,
    aiPerMonth: 50,
    minInterval: "1m",
    historyDays: null,
    live: true,
    advanced: true,
    concurrentJobs: 2,
    alerts: 3,
  },
  pro: {
    id: "pro",
    label: "Pro",
    pitch: "Pour ceux qui testent tous les jours ou préparent un challenge prop firm.",
    monthly: 39,
    yearly: 390,
    backtestsPerMonth: 1000,
    // About 15 € of AI at most on a 39 € plan; recharges cover the heavy months.
    aiPerMonth: 200,
    minInterval: "1m",
    historyDays: null,
    live: true,
    advanced: true,
    concurrentJobs: 3,
    alerts: 20,
  },
};

export const PAID_PLANS = [PLANS.trader, PLANS.pro];

/**
 * The offer priced on request. Not a plan: it has no quota of its own, the
 * accounts it covers stay on the plans above.
 */
export const ENTERPRISE = {
  label: "Entreprise",
  pitch: "Pour une équipe, une formation ou une société qui a besoin de plus que l'offre Pro.",
  perks: [
    "L'offre Pro pour chaque membre de ton équipe",
    "Des quotas adaptés à ton volume de tests",
    "Un seul devis et une seule facture pour ta société",
    "Un interlocuteur direct pour la prise en main",
  ],
};

/** A pre-filled e-mail asking for a quote. */
export function quoteHref(email: string, subject: string, lines: string[]) {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

const DAY = 86_400_000;

/**
 * The first day a plan can test, at midnight UTC since test periods are whole
 * days; null when the whole history is open. Counted from today, so a long
 * history can't be rebuilt one year at a time.
 */
export function earliestStart(plan: Plan, now = Date.now()): number | null {
  return plan.historyDays === null ? null : Math.floor(now / DAY) * DAY - plan.historyDays * DAY;
}

/** Moves a "YYYY-MM-DD" start date forward to what the plan allows. */
export function clampStartDate(startDate: string, plan: Plan, now = Date.now()) {
  const earliest = earliestStart(plan, now);
  if (earliest === null || Date.parse(startDate) >= earliest) return startDate;
  return new Date(earliest).toISOString().slice(0, 10);
}

/** The plan's history in months, for the messages: 12 for 365 days. */
export function historyMonths(plan: Plan) {
  return plan.historyDays === null ? null : Math.round(plan.historyDays / 30.44);
}

export type CreditKind = "ai" | "backtest";
export type PackId = "ai50" | "bt100" | "combo";

/**
 * One-off recharges, for when the month's quota runs out before the month
 * does. Credits never expire and are only used once the monthly quota is spent.
 * Priced above their cost: an AI translation costs about 5 to 10 cents.
 */
export interface Pack {
  id: PackId;
  label: string;
  price: number;
  credits: Partial<Record<CreditKind, number>>;
}

export const PACKS: Pack[] = [
  { id: "ai50", label: "+50 traductions par l'IA", price: 9, credits: { ai: 50 } },
  { id: "bt100", label: "+100 backtests", price: 5, credits: { backtest: 100 } },
  { id: "combo", label: "+50 traductions et +100 backtests", price: 12, credits: { ai: 50, backtest: 100 } },
];

export const PACK_BY_ID = Object.fromEntries(PACKS.map((p) => [p.id, p])) as Record<PackId, Pack>;

/** "12,50 €" or "€12.50", in the language of the page by default. */
export function euros(n: number, lang: Lang = currentLang()) {
  return formatEuros(n, lang);
}
