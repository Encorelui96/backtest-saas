/** The report's "Et maintenant ?" card and the first steps: one suggestion at a time for someone new. */

export type NextStep = "few-trades" | "losing" | "fragile" | "solid";

/** Under 30 trades nothing can be concluded, whatever the return says. */
export const MIN_TRADES = 30;

export function nextStep(trades: number, totalReturnPercent: number, solid: boolean): NextStep {
  if (trades < MIN_TRADES) return "few-trades";
  if (totalReturnPercent <= 0) return "losing";
  return solid ? "solid" : "fragile";
}

/** The report's tabs in beginner mode; the others stay one click away in expert mode. */
export const BEGINNER_TABS: readonly string[] = ["overview", "trades", "prop"];

export interface FirstStepsState {
  strategies: number;
  backtests: number;
  verdictSeen: boolean;
  challengeSeen: boolean;
}

/** Which of the four first steps are done. Someone with several tests has read a verdict, even before this list existed. */
export function firstStepsDone({ strategies, backtests, verdictSeen, challengeSeen }: FirstStepsState) {
  return {
    model: strategies > 0 || backtests > 0,
    run: backtests > 0,
    verdict: verdictSeen || backtests >= 3,
    challenge: challengeSeen,
  };
}
