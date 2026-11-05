import { isDeepStrictEqual } from "node:util";
import { normalizeStrategy, type Strategy } from "./schema";

/** Whether two strategies trade the same way. Their names don't count: a test can be renamed. */
export function sameRules(a: Strategy, b: Strategy) {
  const rules = (s: Strategy) => ({ ...normalizeStrategy(s).strategy, name: "", description: "" });
  return isDeepStrictEqual(rules(a), rules(b));
}
