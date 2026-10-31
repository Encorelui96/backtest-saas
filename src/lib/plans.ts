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
    backtestsPerMonth: 5,
    aiPerMonth: 3,
    minInterval: "1h",
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
    concurrentJobs: 2,
    alerts: 3,
  },
  // "Without a fixed quota" for customers, with a ceiling that protects the AI bill.
  pro: {
    id: "pro",
    label: "Pro",
    pitch: "Pour ceux qui testent tous les jours ou préparent un challenge prop firm.",
    monthly: 39,
    yearly: 390,
    backtestsPerMonth: 1000,
    aiPerMonth: 400,
    minInterval: "1m",
    concurrentJobs: 3,
    alerts: 20,
  },
};

export const PAID_PLANS = [PLANS.trader, PLANS.pro];

/** "12,50 €": French price formatting, without decimals when the price is whole. */
export function euros(n: number) {
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;
}
