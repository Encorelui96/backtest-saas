import { connection } from "next/server";
import { handle } from "@/lib/server/http";
import { requestT } from "@/lib/server/lang";
import { limitVisitor } from "@/lib/server/rate-limit";
import { sharedBacktest } from "@/lib/server/shares";

/** A shared link gets opened in bursts: 60 a minute per visitor is far more than a reader needs. */
const PER_MINUTE = 60;
/**
 * The last reports served, already serialized: unpacking one costs several MB of work each time.
 * Kept a minute, like the browser cache below, so a withdrawn link still dies within that minute.
 */
const CACHE_MS = 60_000;
const MAX_CACHED = 4;
const cache = new Map<string, { at: number; body: string }>();

async function reportJson(id: string): Promise<string | null> {
  const now = Date.now();
  const hit = cache.get(id);
  if (hit && now - hit.at < CACHE_MS) return hit.body;
  const shared = await sharedBacktest(id);
  if (!shared) {
    cache.delete(id);
    return null;
  }
  const body = JSON.stringify(shared);
  cache.delete(id);
  cache.set(id, { at: now, body });
  // The oldest entry goes first: a Map keeps its keys in insertion order.
  while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  return body;
}

/** A shared report, for anyone who has its link. */
export async function GET(req: Request, ctx: RouteContext<"/api/r/[id]">) {
  await connection();
  return handle(async () => {
    limitVisitor(req.headers, "shared-report", PER_MINUTE);
    const body = await reportJson((await ctx.params).id);
    if (body === null) return Response.json({ error: (await requestT())("Ce lien de partage n'existe pas ou a été retiré par son auteur.") }, { status: 404 });
    // A report is several MB once unpacked, and a shared link gets opened in bursts. A minute of cache
    // spares the database and the unpacking; a withdrawn link still dies within that minute.
    return new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60, stale-while-revalidate=60" } });
  });
}
