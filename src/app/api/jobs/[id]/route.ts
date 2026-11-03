import { connection } from "next/server";
import { getJob } from "@/lib/server/jobs";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { requestT } from "@/lib/server/lang";
import type { T } from "@/lib/i18n";

export async function GET(req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  await connection();
  return handle(async () => {
    const user = await requireUser(req.headers);
    const job = await getJob(user.id, (await ctx.params).id);
    if (!job) return Response.json({ error: (await requestT())("Tâche introuvable") }, { status: 404 });
    const { status, progress, message, resultId, error, ahead } = job;
    const t = await requestT();
    return Response.json({ status, progress, message: message && t(message), resultId, error: error && jobError(error, t), ahead });
  });
}

/** The worker stores {text, values} (older jobs: the French message itself). */
function jobError(error: string, t: T) {
  try {
    const e = JSON.parse(error) as { text?: unknown; values?: unknown };
    if (typeof e.text === "string") return t(e.text, Array.isArray(e.values) ? e.values : []);
  } catch {}
  return t(error);
}
