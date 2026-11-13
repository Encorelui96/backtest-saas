import type { NextRequest } from "next/server";
import { listSymbols } from "@/lib/server/binance";
import { handle } from "@/lib/server/http";
import { MARKETS } from "@/lib/markets";
import { limitVisitor } from "@/lib/server/rate-limit";

/** The market picker searches at each keystroke: 120 a minute per visitor leaves room, a loop doesn't fit. */
const PER_MINUTE = 120;

export async function GET(req: NextRequest) {
  return handle(async () => {
    limitVisitor(req.headers, "symbols", PER_MINUTE);
    const q = (req.nextUrl.searchParams.get("q") ?? "").toUpperCase();
    // Forex, gold and the Nasdaq come first: there are few of them and they are easy to miss among Binance pairs.
    const markets = MARKETS.filter((m) => !q || m.symbol.includes(q) || q.includes(m.symbol)).map((m) => ({ symbol: m.symbol }));
    const all = await listSymbols().catch(() => []);
    const hits = q ? all.filter((s) => s.symbol.includes(q)) : all;
    return Response.json([...markets, ...hits].slice(0, 30));
  });
}
