import { connection } from "next/server";
import { currentUser, emailLinksEnabled, googleEnabled, hasPassword } from "@/lib/server/auth";
import { query } from "@/lib/server/db";
import { isAdmin, usageOf } from "@/lib/server/quotas";
import { handle } from "@/lib/server/http";

export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    const user = await currentUser(req.headers);
    const [surveyed, interests] = user
      ? await Promise.all([
          query<{ n: string }>("SELECT count(*) AS n FROM feedback WHERE user_id = $1 AND kind = 'pmf'", [user.id]),
          query<{ plan: string }>("SELECT plan FROM plan_interest WHERE user_id = $1", [user.id]),
        ])
      : [[], []];
    return Response.json({
      user,
      usage: user ? await usageOf(user) : null,
      hasPassword: user ? await hasPassword(req.headers) : false,
      isAdmin: user ? isAdmin(user) : false,
      surveyAnswered: Number(surveyed[0]?.n ?? 0) > 0,
      interests: interests.map((i) => i.plan),
      googleEnabled,
      emailLinksEnabled,
    });
  });
}
