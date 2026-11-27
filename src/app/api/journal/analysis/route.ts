import { z } from "zod";
import { PLAN_CHECKS } from "@/lib/journal";
import { requireUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { langOf } from "@/lib/server/lang";
import { UserError } from "@/lib/server/errors";
import { queryOne } from "@/lib/server/db";
import { aiEnabled } from "@/lib/server/ai";
import { analyseChart, checkCapture } from "@/lib/server/journal-capture";
import { readImage } from "@/lib/server/journal-media";
import { captureUsage, consumeJournalCapture, recordAiUsage, type AiUsage } from "@/lib/server/quotas";

const price = z.number().positive().max(1e12).nullable();

const Body = z
  .object({
    // A chart kept with the trade, or one picked in the form and not saved yet.
    imageId: z.string().max(64).optional(),
    image: z
      .string()
      .max(2_000_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/, "base64 attendu")
      .optional(),
    setupId: z.string().max(64).nullable(),
    trade: z.object({
      market: z.string().trim().min(1).max(40),
      side: z.enum(["long", "short"]),
      entry: price,
      stop: price,
      noStop: z.boolean(),
      target: price,
      exit: price,
      r: z.number().min(-1000).max(1000).nullable(),
      checks: z.array(z.enum(PLAN_CHECKS)).max(PLAN_CHECKS.length),
    }),
  })
  .refine((b) => Boolean(b.imageId) !== Boolean(b.image), "une image à analyser");

/** The AI's reading of a trade's chart against its setup: the form keeps it with the trade. Counted with the screenshots. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    if (!aiEnabled()) throw new UserError("L'analyse par l'IA n'est pas configurée.");
    const body = Body.parse(await req.json());
    let data = body.image ?? "";
    if (body.imageId) {
      const kept = await readImage(user.id, body.imageId);
      if (!kept) throw new UserError("Image introuvable");
      data = kept.data.toString("base64");
    }
    checkCapture(data, "image/jpeg");
    const setup = body.setupId
      ? await queryOne<{ name: string; description: string | null }>("SELECT name, description FROM journal_setups WHERE id = $1 AND user_id = $2", [body.setupId, user.id])
      : null;
    const eventId = await consumeJournalCapture(user);
    const usage: AiUsage = { inputTokens: 0, outputTokens: 0, model: null };
    try {
      const result = await analyseChart(data, "image/jpeg", { ...body.trade, setup }, usage, langOf(req));
      return Response.json({ analysis: { ...result, at: Date.now() }, captures: await captureUsage(user) });
    } finally {
      await recordAiUsage(eventId, usage).catch((e) => console.error("[journal] analyse non enregistrée", e));
    }
  });
}
