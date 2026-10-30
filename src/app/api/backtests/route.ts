import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { BacktestConfigSchema, StrategySchema } from "@/lib/strategy/schema";
import { listBacktests, runAndSaveBacktest } from "@/lib/server/backtests";
import { handle } from "@/lib/server/http";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  await connection();
  return handle(async () => Response.json(listBacktests(req.nextUrl.searchParams.get("strategyId") ?? undefined)));
}

const Body = z.object({ strategy: StrategySchema, config: BacktestConfigSchema, strategyId: z.string().nullable().optional() });

export async function POST(req: Request) {
  return handle(async () => {
    const body = Body.parse(await req.json());
    return Response.json(await runAndSaveBacktest(body.strategy, body.config, body.strategyId ?? null));
  });
}
