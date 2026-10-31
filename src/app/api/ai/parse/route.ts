import { z } from "zod";
import { StrategySchema } from "@/lib/strategy/schema";
import { aiEnabled, parseStrategyText } from "@/lib/server/ai";
import { handle } from "@/lib/server/http";
import { UserError } from "@/lib/server/backtests";
import { requireUser } from "@/lib/server/auth";
import { consumeAi, recordAiUsage, type AiUsage } from "@/lib/server/quotas";

const Body = z.object({ text: z.string().min(5).max(3000), current: StrategySchema.nullable().optional() });

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    if (!aiEnabled()) throw new UserError("L'IA n'est pas configurée : ajoute ANTHROPIC_API_KEY dans le fichier .env.local, ou utilise le constructeur manuel.");
    const body = Body.parse(await req.json());
    const eventId = await consumeAi(user);
    const usage: AiUsage = { inputTokens: 0, outputTokens: 0, model: null };
    try {
      return Response.json(await parseStrategyText(body.text, body.current ?? undefined, usage));
    } finally {
      await recordAiUsage(eventId, usage).catch((e) => console.error("[ai] usage non enregistré", e));
    }
  });
}
