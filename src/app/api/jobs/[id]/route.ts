import { connection } from "next/server";
import { getJob } from "@/lib/server/jobs";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";

export async function GET(req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  await connection();
  return handle(async () => {
    const user = await requireUser(req.headers);
    const job = await getJob(user.id, (await ctx.params).id);
    if (!job) return Response.json({ error: "Tâche introuvable" }, { status: 404 });
    const { status, progress, message, resultId, error, ahead } = job;
    return Response.json({ status, progress, message, resultId, error, ahead });
  });
}
