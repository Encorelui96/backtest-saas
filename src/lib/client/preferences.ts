/**
 * Choices made in the welcome questions, kept in this browser only (like the
 * beginner/expert level). Every access is guarded: storage can be blocked.
 */

const MARKET_KEY = "backtest-lab:market";
const WELCOME_KEY = "backtest-lab:welcome-done";

/** The market a new strategy starts on, or null to keep the default. */
export function preferredMarket(): string | null {
  try {
    return localStorage.getItem(MARKET_KEY);
  } catch {
    return null;
  }
}

export function setPreferredMarket(symbol: string) {
  try {
    localStorage.setItem(MARKET_KEY, symbol);
  } catch {}
}

/** Pages of the report opened at least once: they tick the first steps on the dashboard. */
export type SeenStep = "verdict" | "challenge";

export function stepSeen(step: SeenStep): boolean {
  try {
    return localStorage.getItem(`backtest-lab:seen-${step}`) === "1";
  } catch {
    return false;
  }
}

export function setStepSeen(step: SeenStep) {
  try {
    localStorage.setItem(`backtest-lab:seen-${step}`, "1");
  } catch {}
}

export function welcomeDone(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === "1";
  } catch {
    return true;
  }
}

export function setWelcomeDone() {
  try {
    localStorage.setItem(WELCOME_KEY, "1");
  } catch {}
}
