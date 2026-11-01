import type { NextRequest } from "next/server";
import { INTERVALS, INTERVAL_MS, type Interval } from "@/lib/types";
import { getCandles } from "@/lib/server/candles";
import { handle } from "@/lib/server/http";
import { UserError } from "@/lib/server/backtests";
import { requireUser } from "@/lib/server/auth";
import { limitPerMinute } from "@/lib/server/rate-limit";

const MAX_BARS = 20_000;
/** The dashboard's ticker asks for 6 markets at once and a report one chart per trade viewed: 120 a minute leaves room. */
const PER_MINUTE = 120;

/** Cached candles for charts, as rows. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    limitPerMinute(user.id, "candles", PER_MINUTE);
    const p = req.nextUrl.searchParams;
    const symbol = (p.get("symbol") ?? "").toUpperCase();
    const interval = p.get("interval") as Interval;
    if (!symbol || !INTERVALS.includes(interval)) throw new UserError("symbol et interval requis");
    const to = Number(p.get("to") ?? Date.now());
    let from = Number(p.get("from") ?? to - 500 * INTERVAL_MS[interval]);
    from = Math.max(from, to - MAX_BARS * INTERVAL_MS[interval]);
    const c = await getCandles(symbol, interval, from, to);
    const rows = Array.from(c.t, (t, i) => ({ t, o: c.o[i], h: c.h[i], l: c.l[i], c: c.c[i], v: c.v[i] }));
    return Response.json(rows);
  });
}
