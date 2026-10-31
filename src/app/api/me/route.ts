import { connection } from "next/server";
import { currentUser, emailLinksEnabled, googleEnabled, hasPassword } from "@/lib/server/auth";
import { usageOf } from "@/lib/server/quotas";
import { handle } from "@/lib/server/http";

export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    const user = await currentUser(req.headers);
    return Response.json({
      user,
      usage: user ? await usageOf(user) : null,
      hasPassword: user ? await hasPassword(req.headers) : false,
      googleEnabled,
      emailLinksEnabled,
    });
  });
}
