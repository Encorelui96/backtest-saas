import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { handle } from "@/lib/server/http";

const Body = z.object({ enabled: z.boolean() });

/** Turns the e-mail at the end of a long test on or off. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    const { enabled } = Body.parse(await req.json());
    await query(
      `INSERT INTO user_settings (user_id, test_emails) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET test_emails = EXCLUDED.test_emails`,
      [user.id, enabled],
    );
    return Response.json({ ok: true });
  });
}
