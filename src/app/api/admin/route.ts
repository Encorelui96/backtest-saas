import { connection } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { adminMetrics } from "@/lib/server/admin";
import { handle } from "@/lib/server/http";
import { requestT } from "@/lib/server/lang";
import { isAdmin } from "@/lib/server/quotas";

/** The admin page's figures, for administrators only (see isAdmin). */
export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    const user = await requireUser(req.headers);
    if (!isAdmin(user)) return Response.json({ error: (await requestT())("Page réservée à l'administrateur.") }, { status: 403 });
    return Response.json(await adminMetrics());
  });
}
