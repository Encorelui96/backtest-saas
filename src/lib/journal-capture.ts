/**
 * Turning what the AI read on a platform screenshot (MetaTrader, cTrader…) into journal trades.
 * Pure: shared by the trade form and the tests. The AI copies what it sees; everything worked out
 * from it (point value, fees, exit reason, times) is done here, where it can be tested.
 */

import { defaultPointValue, type ExitReason, type Side } from "./journal";

/** One closed trade as the AI copied it from the screenshot (schema in server/journal-capture.ts). null: not visible. */
export interface CaptureTrade {
  market: string;
  side: Side;
  size: number | null;
  entry: number | null;
  exit: number | null;
  /** As shown on the platform, "2026-11-26T17:00:25", no time zone. */
  openedAt: string | null;
  closedAt: string | null;
  stop: number | null;
  target: number | null;
  /** In the account's currency, without commission and swap. */
  profit: number | null;
  commission: number | null;
  swap: number | null;
  ticket: string | null;
}

export interface CaptureResult {
  trades: CaptureTrade[];
  /** What the AI couldn't read, for the trader. */
  notes: string | null;
}

/** The largest side of the image sent to the AI, in pixels: beyond it the model scales it down anyway. */
export const CAPTURE_MAX_SIDE = 1568;

/** What one unit of size gains when the price moves by 1, worked out from the profit shown: it holds the broker's contract size and the currency conversion. */
export function pointValueFromProfit(t: Pick<CaptureTrade, "side" | "size" | "entry" | "exit" | "profit">): number | null {
  if (t.profit === null || !t.size || !t.entry || !t.exit || t.exit === t.entry) return null;
  const v = t.profit / ((t.exit - t.entry) * (t.side === "long" ? 1 : -1) * t.size);
  return Number.isFinite(v) && v > 0 ? Number(v.toPrecision(6)) : null;
}

/** Commission and swap paid, as the journal's fees (never negative: a swap received only lowers them). */
export function feesOf(t: Pick<CaptureTrade, "commission" | "swap">): number {
  const paid = -((t.commission ?? 0) + (t.swap ?? 0));
  return paid > 0 ? Math.round(paid * 100) / 100 : 0;
}

/**
 * A wall time read on the platform, "2026-11-26T17:00:25", to milliseconds. `offsetHours`: how far
 * the platform's clock runs ahead of the account's time zone (MT5 servers often show +1 h from Paris).
 */
export function platformTime(wall: string | null, timeZone: string, offsetHours = 0): number | null {
  const m = wall ? /^(\d{4})[-.](\d{2})[-.](\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(wall.trim()) : null;
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map((x) => Number(x ?? 0));
  const asUtc = Date.UTC(y, mo - 1, d, h - offsetHours, mi, s);
  if (!Number.isFinite(asUtc)) return null;
  // The zone's offset at that moment, read twice so a change of summer time between the two guesses settles.
  let t = asUtc - zoneOffset(asUtc, timeZone);
  t = asUtc - zoneOffset(t, timeZone);
  return t;
}

/** How far a time zone runs ahead of UTC at a moment, in milliseconds. */
function zoneOffset(t: number, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(t))
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - Math.floor(t / 1000) * 1000;
}

/** The most likely exit reason, for the form to propose: the trader corrects it in "More details". */
export function guessExitReason(r: number | null, noStop: boolean, hitTarget: boolean): ExitReason {
  if (hitTarget) return "target";
  if (r === null) return "manual-plan";
  if (!noStop && r <= -0.95) return "stop";
  if (Math.abs(r) < 0.1) return "breakeven";
  return "manual-plan";
}

/** Whether the exit reached the target. */
export function reachedTarget(side: Side, exit: number | null, target: number | null): boolean {
  if (exit === null || target === null) return false;
  return (side === "long" ? exit - target : target - exit) >= -Math.abs(target) * 1e-6;
}

/**
 * The stop that makes 1R equal the planned risk, for a trade taken without a stop: the planned
 * amount spread over the size. null when it can't be placed (no size, no point value, no risk).
 */
export function plannedStop(side: Side, entry: number | null, size: number | null, pointValue: number | null, plannedRisk: number | null): number | null {
  if (!entry || !size || !pointValue || !plannedRisk || plannedRisk <= 0) return null;
  const distance = plannedRisk / (size * pointValue);
  const stop = side === "long" ? entry - distance : entry + distance;
  return stop > 0 ? Number(stop.toPrecision(10)) : null;
}

/** What the form takes from a read trade. Times in milliseconds; null where the screenshot didn't say. */
export interface CaptureDraft {
  market: string;
  side: Side;
  size: number | null;
  entry: number | null;
  exit: number | null;
  stop: number | null;
  target: number | null;
  pointValue: number | null;
  fees: number;
  openedAt: number | null;
  closedAt: number | null;
  ticket: string | null;
}

export function captureDraft(t: CaptureTrade, timeZone: string, offsetHours = 0): CaptureDraft {
  const closedAt = platformTime(t.closedAt, timeZone, offsetHours);
  return {
    market: t.market.trim(),
    side: t.side,
    size: t.size,
    entry: t.entry,
    exit: t.exit,
    stop: t.stop,
    target: t.target,
    pointValue: pointValueFromProfit(t) ?? defaultPointValue(t.market),
    fees: feesOf(t),
    // A history list only shows the close: the entry is then put at the same moment.
    openedAt: platformTime(t.openedAt, timeZone, offsetHours) ?? closedAt,
    closedAt,
    ticket: t.ticket?.replace(/^#/, "").trim() || null,
  };
}
