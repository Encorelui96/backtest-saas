import type { NextRequest } from "next/server";
import { listSymbols } from "@/lib/server/binance";
import { handle } from "@/lib/server/http";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const q = (req.nextUrl.searchParams.get("q") ?? "").toUpperCase();
    const all = await listSymbols();
    const hits = q ? all.filter((s) => s.symbol.includes(q)) : all;
    return Response.json(hits.slice(0, 30));
  });
}
