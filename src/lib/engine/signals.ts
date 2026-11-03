import type { Strategy } from "../strategy/schema";
import type { SeriesContext } from "./evaluate";

export type SignalKind = "long" | "short" | "exit_long" | "exit_short";

/**
 * The signals a strategy gives at the close of bar `i`: an entry (long or
 * short, as the engine would open it at the next open) and, separately, its
 * exit rules, since an alert can't know whether the trader is in a position.
 */
export function signalsAt(ctx: SeriesContext, strategy: Strategy, i = ctx.n - 1): SignalKind[] {
  if (i < 0) return [];
  const out: SignalKind[] = [];
  const fires = (groups: Strategy["entryLong"]) => groups.some((g) => g.conditions.length > 0) && ctx.groupsSignal(groups)[i] === 1;
  if (strategy.direction !== "short" && fires(strategy.entryLong)) out.push("long");
  else if (strategy.direction !== "long" && fires(strategy.entryShort)) out.push("short");
  if (strategy.direction !== "short" && fires(strategy.exitLong)) out.push("exit_long");
  if (strategy.direction !== "long" && fires(strategy.exitShort)) out.push("exit_short");
  return out;
}
