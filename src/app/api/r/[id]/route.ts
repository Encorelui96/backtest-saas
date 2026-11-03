import { connection } from "next/server";
import { handle } from "@/lib/server/http";
import { requestT } from "@/lib/server/lang";
import { sharedBacktest } from "@/lib/server/shares";

/** A shared report, for anyone who has its link. */
export async function GET(_req: Request, ctx: RouteContext<"/api/r/[id]">) {
  await connection();
  return handle(async () => {
    const shared = await sharedBacktest((await ctx.params).id);
    if (!shared) return Response.json({ error: (await requestT())("Ce lien de partage n'existe pas ou a été retiré par son auteur.") }, { status: 404 });
    return Response.json(shared);
  });
}
