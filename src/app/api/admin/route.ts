import { connection } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { adminMetrics } from "@/lib/server/admin";
import { handle } from "@/lib/server/http";
import { isAdmin } from "@/lib/server/quotas";

/** The admin page's figures, for the addresses listed in ADMIN_EMAILS only. */
export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    const user = await requireUser(req.headers);
    if (!isAdmin(user.email)) return Response.json({ error: "Page réservée à l'administrateur." }, { status: 403 });
    return Response.json(await adminMetrics());
  });
}
