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
    // A report is several MB once unpacked, and a shared link gets opened in bursts. A minute of cache
    // spares the database and the unpacking; a withdrawn link still dies within that minute.
    return Response.json(shared, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=60" } });
  });
}
