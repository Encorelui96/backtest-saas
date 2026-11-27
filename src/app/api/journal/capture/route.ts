import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { langOf } from "@/lib/server/lang";
import { UserError } from "@/lib/server/errors";
import { aiEnabled } from "@/lib/server/ai";
import { CAPTURE_TYPES, checkCapture, readTradeCapture } from "@/lib/server/journal-capture";
import { captureUsage, consumeJournalCapture, recordAiUsage, type AiUsage } from "@/lib/server/quotas";

/** About 4.5 MB of image once decoded: the AI takes 5 MB at most, and the page sends it shrunk to 1 568 px. */
const Body = z.object({
  image: z
    .string()
    .max(6_000_000)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "base64 attendu"),
  type: z.enum(CAPTURE_TYPES),
});

/** Reads a platform screenshot into trades for the form. The image goes to the AI and is kept nowhere. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    if (!aiEnabled()) throw new UserError("La lecture des captures n'est pas configurée : note le trade à la main.");
    const body = Body.parse(await req.json());
    checkCapture(body.image, body.type);
    const eventId = await consumeJournalCapture(user);
    const usage: AiUsage = { inputTokens: 0, outputTokens: 0, model: null };
    try {
      const result = await readTradeCapture(body.image, body.type, usage, langOf(req));
      return Response.json({ ...result, captures: await captureUsage(user) });
    } finally {
      await recordAiUsage(eventId, usage).catch((e) => console.error("[journal] lecture de capture non enregistrée", e));
    }
  });
}
