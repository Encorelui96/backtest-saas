import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { CaptureResult } from "../journal-capture";
import type { AiUsage } from "./quotas";
import { UserError } from "./errors";
import type { Lang } from "@/lib/i18n";

/** What the AI must answer: the trades it copied, nothing worked out (see lib/journal-capture.ts). */
const CaptureTradeSchema = z.object({
  market: z.string().min(1).max(40).describe("Symbol exactly as written, e.g. BTCUSD, EURUSD, US100.cash"),
  side: z.enum(["long", "short"]).describe("buy = long, sell = short"),
  size: z.number().positive().nullable().describe("Volume (lots) as shown"),
  entry: z.number().positive().nullable().describe("Open price"),
  exit: z.number().positive().nullable().describe("Close price"),
  openedAt: z.string().max(25).nullable().describe("Open date and time as shown, YYYY-MM-DDTHH:MM:SS, no time zone conversion"),
  closedAt: z.string().max(25).nullable().describe("Close date and time as shown, YYYY-MM-DDTHH:MM:SS, no time zone conversion"),
  stop: z.number().positive().nullable().describe("S/L shown; null when it reads '-' or isn't shown"),
  target: z.number().positive().nullable().describe("T/P shown; null when it reads '-' or isn't shown"),
  profit: z.number().nullable().describe("The trade's profit in the account currency as shown, sign included, without commission and swap"),
  commission: z.number().nullable().describe("Commission with the sign shown (negative = paid)"),
  swap: z.number().nullable().describe("Swap with the sign shown"),
  ticket: z.string().max(40).nullable().describe("Order or position number, without #"),
});

const CaptureResultSchema = z.object({
  trades: z.array(CaptureTradeSchema).max(50),
  notes: z.string().max(500).nullable().describe("One or two short sentences for the trader, in the requested language, on what couldn't be read; null if nothing"),
});

const SYSTEM = `You read screenshots of trading platforms (MetaTrader 4 and 5 on desktop or phone, cTrader, TradingView, broker apps) and copy the CLOSED trades they show into JSON, for a trading journal.

Rules:
- A trade detail view is one trade. A history list is one trade per row. Skip deposits, withdrawals, balance or credit operations, pending orders and positions still open (no close price).
- side: buy = long, sell = short. On a closed MetaTrader row "BTCUSD sell 4 / 60385.23 → 60423.90", sell is the trade's side, 4 the volume, the first price the open and the second the close.
- Copy every number exactly as shown, digit for digit; never compute, round or guess one. Write null for anything not visible.
- Dates and times as shown on the screen ("2026.11.26 17:00:25" becomes "2026-11-26T17:00:25"), without converting time zones. A history list often shows only the close time: openedAt is then null.
- stop and target: the S/L and T/P shown, null when they read "-" or are missing.
- profit: the trade's profit or loss in the account currency, with its sign; commission and swap apart, with the sign shown.
- ticket: the order or position number (#593516600 → "593516600").
- If the image isn't a trading platform, or shows no closed trade, return an empty trades list and say why in notes.`;

const OUTPUT_FORMAT = `Answer with ONE JSON object and nothing else (no Markdown, no code fence), matching this JSON Schema:\n${JSON.stringify(z.toJSONSchema(CaptureResultSchema))}`;

/** The model that reads (AI_CAPTURE_MODEL to try another without a deploy). */
const MODEL = process.env.AI_CAPTURE_MODEL || process.env.AI_MODEL || "claude-opus-5-5";

export const CAPTURE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type CaptureType = (typeof CAPTURE_TYPES)[number];

/** The first bytes of each accepted format: a file renamed .jpg is refused before it costs a call or a capture of the quota. */
export function checkCapture(data: string, type: CaptureType) {
  if (!looksLike(data, type)) throw new UserError("Ce fichier n'est pas une image JPEG, PNG ou WebP.");
}

function looksLike(data: string, type: CaptureType): boolean {
  const head = Buffer.from(data.slice(0, 24), "base64");
  if (type === "image/jpeg") return head[0] === 0xff && head[1] === 0xd8;
  if (type === "image/png") return head.subarray(0, 4).toString("latin1") === "\x89PNG";
  return head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP";
}

function readJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON object");
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * Reads a platform screenshot. The image is sent to the AI and kept nowhere: neither in the
 * database nor on disk. `usage` adds up the tokens of every attempt, even when reading fails.
 */
export async function readTradeCapture(data: string, type: CaptureType, usage: AiUsage, lang: Lang = "fr"): Promise<CaptureResult> {
  checkCapture(data, type);
  const client = new Anthropic();
  const ask = lang === "en" ? "Copy the closed trades of this screenshot. Notes in English." : "Copie les trades clôturés de cette capture. Notes en français.";
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: type, data } },
        { type: "text", text: ask },
      ],
    },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: [{ type: "text", text: `${SYSTEM}\n\n${OUTPUT_FORMAT}`, cache_control: { type: "ephemeral" } }],
      messages,
    });
    const u = response.usage;
    usage.inputTokens += Math.round(u.input_tokens + 1.25 * (u.cache_creation_input_tokens ?? 0) + 0.1 * (u.cache_read_input_tokens ?? 0));
    usage.outputTokens += u.output_tokens;
    usage.model = response.model;
    if (response.stop_reason === "refusal") throw new UserError("L'IA n'a pas pu lire cette image. Essaie une autre capture, ou note le trade à la main.");
    const raw = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    let error: string;
    try {
      const parsed = CaptureResultSchema.safeParse(readJson(raw));
      if (parsed.success) return parsed.data;
      error = z.prettifyError(parsed.error);
    } catch {
      error = "The answer is not a valid JSON object.";
    }
    messages.push(
      { role: "assistant", content: raw || "(empty)" },
      { role: "user", content: `Your JSON does not match the schema:\n${error}\nSend the corrected JSON object only.` },
    );
  }
  throw new UserError("L'IA n'a pas réussi à lire cette capture. Réessaie avec une capture plus nette, ou note le trade à la main.");
}

// ---------- Reading a chart against the setup ----------

const AnalysisSchema = z.object({
  verdict: z.enum(["respected", "partly", "not", "unclear"]).describe("Was the trader's strategy followed on this trade, judged on the chart and the data"),
  summary: z.string().max(600).describe("One or two sentences that justify the verdict, in the requested language"),
  remarks: z.array(z.string().max(300)).min(1).max(3).describe("Three short remarks, in the requested language: the entry, the stop, the target or the management, each against the setup"),
});
export type AnalysisResult = z.infer<typeof AnalysisSchema>;

const COACH = `You review one real trade for a trader's journal, as a demanding but fair trading coach. You get a chart screenshot of the trade (often TradingView) and the trade's data: market, side, entry, stop, target, exit, result in R, the rules of the trader's plan the journal found broken, and the description of the setup the trader says the trade belongs to.

Judge whether the trade followed the trader's OWN strategy, not yours:
- Compare what the chart shows (trend, levels, zones, where the entry, stop and target sit, how the trade was managed) with the setup's description, condition by condition.
- verdict: "respected" when the entry, stop and management match the setup; "partly" when one point departs from it; "not" when the trade isn't the setup or breaks it clearly; "unclear" when the chart doesn't show enough to tell (no setup description, unreadable chart, levels not visible).
- A losing trade can respect the strategy and a winning one break it: judge the decision, never the result.
- summary: one or two sentences giving the reason for the verdict.
- remarks: exactly three short, concrete remarks (entry, stop, target or management), each saying what matched the setup or what to do differently next time.
- Never invent a price or a level you can't see or weren't given. Don't give financial advice beyond the trader's own rules.`;

const ANALYSIS_FORMAT = `Answer with ONE JSON object and nothing else (no Markdown, no code fence), matching this JSON Schema:\n${JSON.stringify(z.toJSONSchema(AnalysisSchema))}`;

export interface AnalysisContext {
  market: string;
  side: "long" | "short";
  entry: number | null;
  stop: number | null;
  noStop: boolean;
  target: number | null;
  exit: number | null;
  r: number | null;
  checks: string[];
  setup: { name: string; description: string | null } | null;
}

/** Reads a chart against the trade's setup. The image is sent to the AI and kept by this call nowhere. */
export async function analyseChart(data: string, type: CaptureType, context: AnalysisContext, usage: AiUsage, lang: Lang = "fr"): Promise<AnalysisResult> {
  checkCapture(data, type);
  const client = new Anthropic();
  const facts = [
    `Market: ${context.market}. Side: ${context.side === "long" ? "buy" : "sell"}.`,
    `Entry: ${context.entry ?? "not given"}. Stop: ${context.noStop ? "none (no stop on this trade)" : (context.stop ?? "not given")}. Target: ${context.target ?? "not given"}. Exit: ${context.exit ?? "still open"}.`,
    `Result: ${context.r === null ? "unknown" : `${context.r.toFixed(2)} R`}.`,
    `Plan rules the journal found broken: ${context.checks.length ? context.checks.join(", ") : "none"}.`,
    context.setup
      ? `Setup: "${context.setup.name}". Its description by the trader: ${context.setup.description?.trim() || "(none written)"}`
      : "Setup: none, the trader filed this trade off plan.",
  ].join("\n");
  const ask = lang === "en" ? "Review this trade. Write summary and remarks in English." : "Analyse ce trade. Écris summary et remarks en français, en tutoyant le trader.";
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: type, data } },
        { type: "text", text: `${facts}\n\n${ask}` },
      ],
    },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 3000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: [{ type: "text", text: `${COACH}\n\n${ANALYSIS_FORMAT}`, cache_control: { type: "ephemeral" } }],
      messages,
    });
    const u = response.usage;
    usage.inputTokens += Math.round(u.input_tokens + 1.25 * (u.cache_creation_input_tokens ?? 0) + 0.1 * (u.cache_read_input_tokens ?? 0));
    usage.outputTokens += u.output_tokens;
    usage.model = response.model;
    if (response.stop_reason === "refusal") throw new UserError("L'IA n'a pas pu analyser cette image. Essaie une autre capture du graphique.");
    const raw = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    let error: string;
    try {
      const parsed = AnalysisSchema.safeParse(readJson(raw));
      if (parsed.success) return parsed.data;
      error = z.prettifyError(parsed.error);
    } catch {
      error = "The answer is not a valid JSON object.";
    }
    messages.push(
      { role: "assistant", content: raw || "(empty)" },
      { role: "user", content: `Your JSON does not match the schema:\n${error}\nSend the corrected JSON object only.` },
    );
  }
  throw new UserError("L'IA n'a pas réussi à analyser ce graphique. Réessaie dans un instant.");
}
