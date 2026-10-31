import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

const Body = z.object({ plan: z.enum(["trader", "pro"]), billing: z.enum(["month", "year"]) });

/** "I want this offer": records the interest while online payment isn't open. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    const body = Body.parse(await req.json());
    await query(
      `INSERT INTO plan_interest (user_id, plan, billing) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, plan) DO UPDATE SET billing = EXCLUDED.billing, created_at = now()`,
      [user.id, body.plan, body.billing],
    );
    return Response.json({ ok: true });
  });
}
