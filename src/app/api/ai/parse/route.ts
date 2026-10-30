import { z } from "zod";
import { StrategySchema } from "@/lib/strategy/schema";
import { aiEnabled, parseStrategyText } from "@/lib/server/ai";
import { handle } from "@/lib/server/http";
import { UserError } from "@/lib/server/backtests";

const Body = z.object({ text: z.string().min(5).max(6000), current: StrategySchema.nullable().optional() });

export async function POST(req: Request) {
  return handle(async () => {
    if (!aiEnabled()) throw new UserError("L'IA n'est pas configurée : ajoute ANTHROPIC_API_KEY dans le fichier .env.local, ou utilise le constructeur manuel.");
    const body = Body.parse(await req.json());
    return Response.json(await parseStrategyText(body.text, body.current ?? undefined));
  });
}
