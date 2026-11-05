import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { limitPerMinute } from "@/lib/server/rate-limit";
import { requestedMarket } from "@/lib/markets";

const Body = z.object({ market: z.string().max(40).transform(requestedMarket).pipe(z.string().min(2)) });

/** "I'd like this market on the site": one line per account and market, counted on the admin page. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    limitPerMinute(user.id, "market-requests", 5);
    const { market } = Body.parse(await req.json());
    await query("INSERT INTO market_requests (user_id, market) VALUES ($1, $2) ON CONFLICT DO NOTHING", [user.id, market]);
    return Response.json({ ok: true });
  });
}
