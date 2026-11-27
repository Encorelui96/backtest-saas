import { connection } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { loadJournal } from "@/lib/server/journal";
import { imageUsage } from "@/lib/server/journal-media";
import { captureUsage, planOf } from "@/lib/server/quotas";

/** The whole journal of the signed-in user, with what the plan allows. */
export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    const user = await requireUser(req.headers);
    const [plan, journal, captures, images] = await Promise.all([planOf(user), loadJournal(user.id), captureUsage(user), imageUsage(user)]);
    return Response.json({ ...journal, plan: { id: plan.id, label: plan.label, accounts: plan.journalAccounts, dashboard: plan.journalDashboard, captures, images } });
  });
}
