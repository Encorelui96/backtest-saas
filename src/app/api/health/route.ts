import { connection } from "next/server";
import { query } from "@/lib/server/db";

/**
 * For an outside monitor (UptimeRobot, Better Stack…): 200 when the site answers and reaches its database,
 * 503 otherwise. Render's own health check stays on /api/me, which needs no database: a short database
 * outage must not make Render restart a web server that is fine.
 */
export async function GET() {
  await connection();
  const headers = { "Cache-Control": "no-store" };
  try {
    await query("SELECT 1");
    return Response.json({ ok: true }, { headers });
  } catch (e) {
    console.error("[health] base injoignable", e);
    return Response.json({ ok: false }, { status: 503, headers });
  }
}
