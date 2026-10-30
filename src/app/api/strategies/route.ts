import { connection } from "next/server";
import { z } from "zod";
import { StrategySchema } from "@/lib/strategy/schema";
import { listStrategies, saveStrategy } from "@/lib/server/strategies";
import { handle } from "@/lib/server/http";

export async function GET() {
  await connection();
  return handle(async () => Response.json(listStrategies()));
}

const Body = z.object({ id: z.string().nullable().optional(), strategy: StrategySchema, sourceText: z.string().nullable().optional() });

export async function POST(req: Request) {
  return handle(async () => {
    const body = Body.parse(await req.json());
    return Response.json(saveStrategy(body.strategy, body.sourceText ?? null, body.id ?? undefined));
  });
}
