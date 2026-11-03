import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { queryOne } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { UserError } from "@/lib/server/backtests";
import { grantCredits, isAdmin } from "@/lib/server/quotas";
import { PACK_BY_ID } from "@/lib/plans";

const Body = z.object({ account: z.string().trim().min(3).max(200), pack: z.enum(["ai50", "bt100", "combo"]) });

/** Credits a recharge to an account by hand (e-mail or account id), until online payment opens. Admins only. */
export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireUser(req.headers);
    if (!isAdmin(admin)) return Response.json({ error: "Réservé à l'administrateur." }, { status: 403 });
    const { account, pack } = Body.parse(await req.json());
    const user = await queryOne<{ id: string; email: string }>(`SELECT id, email FROM "user" WHERE id = $1 OR lower(email) = lower($1)`, [account]);
    if (!user) throw new UserError("Aucun compte avec cet e-mail ou cet identifiant.");
    const p = PACK_BY_ID[pack];
    await grantCredits(user.id, p.credits, `admin:${admin.id}:pack:${pack}`);
    return Response.json({ ok: true, email: user.email, label: p.label });
  });
}
