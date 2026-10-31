import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

const Body = z.object({
  answer: z.enum(["very", "somewhat", "not"]),
  comment: z.string().trim().max(1000).optional(),
});

/** Answer to "how would you feel if you could no longer use Backtest Lab?": one per user, the last one wins. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    const body = Body.parse(await req.json());
    await query(
      `INSERT INTO feedback (user_id, kind, answer, comment) VALUES ($1, 'pmf', $2, $3)
       ON CONFLICT (user_id, kind) DO UPDATE SET answer = EXCLUDED.answer, comment = EXCLUDED.comment, created_at = now()`,
      [user.id, body.answer, body.comment || null],
    );
    return Response.json({ ok: true });
  });
}
