import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { query, queryOne } from "@/lib/server/db";
import { handle } from "@/lib/server/http";
import { requestT } from "@/lib/server/lang";
import { UserError } from "@/lib/server/backtests";
import { isAdmin } from "@/lib/server/quotas";
import { PLANS } from "@/lib/plans";

const Body = z.object({ account: z.string().trim().min(3).max(200), plan: z.enum(["free", "trader", "pro"]) });

/**
 * Gives an account an offer by hand (e-mail or account id): a tester, a partner, a customer
 * who paid another way. "free" takes a given offer back. Admins only. Online payment will
 * write the same table (plans) through Stripe's webhook.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requireUser(req.headers);
    if (!isAdmin(admin)) return Response.json({ error: (await requestT())("Réservé à l'administrateur.") }, { status: 403 });
    const { account, plan } = Body.parse(await req.json());
    const user = await queryOne<{ id: string; email: string }>(`SELECT id, email FROM "user" WHERE id = $1 OR lower(email) = lower($1)`, [account]);
    if (!user) throw new UserError("Aucun compte avec cet e-mail ou cet identifiant.");
    await query(
      `INSERT INTO plans (user_id, plan, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET plan = EXCLUDED.plan, updated_at = now()`,
      [user.id, plan],
    );
    console.log(`[admin] offre ${plan} appliquée au compte ${user.id} par ${admin.id}`);
    return Response.json({ ok: true, email: user.email, label: PLANS[plan].label });
  });
}
