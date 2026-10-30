import { connection } from "next/server";
import { z } from "zod";
import { StrategySchema } from "@/lib/strategy/schema";
import { listStrategies, saveStrategy } from "@/lib/server/strategies";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";

export async function GET(req: Request) {
  await connection();
  return handle(async () => {
    const user = await requireUser(req.headers);
    return Response.json(await listStrategies(user.id));
  });
}

const Body = z.object({ id: z.string().nullable().optional(), strategy: StrategySchema, sourceText: z.string().max(6000).nullable().optional() });

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    const body = Body.parse(await req.json());
    return Response.json(await saveStrategy(user.id, body.strategy, body.sourceText ?? null, body.id ?? undefined));
  });
}
