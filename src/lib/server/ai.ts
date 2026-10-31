import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { StrategySchema, normalizeStrategy, type Strategy } from "../strategy/schema";

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const ParseResultSchema = z.object({
  strategy: StrategySchema,
  explanation: z.string().describe("Short French explanation of the rules as they will be tested, for a trader."),
  assumptions: z.array(z.string()).describe("French list of every choice made that the user did not state explicitly."),
  questions: z.array(z.string()).describe("French questions to ask the user when something important is ambiguous. Empty if none."),
});
export type ParseResult = z.infer<typeof ParseResultSchema>;

const SYSTEM = `You translate trading strategies written in French (sometimes English) into a strict JSON rule format used by a backtesting engine. Markets: Binance spot crypto pairs (BTCUSDT, ETHUSDT…), forex (EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, EURGBP, EURJPY, GBPJPY), gold (XAUUSD; "or", "gold") and the Nasdaq 100 (NAS100; "nasdaq", "US100", "NQ"). Forex, gold and the Nasdaq are closed on weekends. Write every human-readable field (name, description, explanation, assumptions, questions) in French.

How the engine works:
- Signals are evaluated at each bar close. Orders fill at the next bar's open. Stops and targets are checked inside each bar using high/low; if both are touched in the same bar, the stop is assumed first.
- One position at a time. With direction "both", an opposite entry signal reverses the position.
- entryLong / entryShort / exitLong / exitShort are lists of groups. A group fires when ALL its conditions are true; a rule fires when ANY group fires. Use one group for a plain "A and B" rule, several groups for "A or B".
- A condition compares two operands with >, >=, <, <=, ==, crosses_above, crosses_below.
- Operand fields: indicator, period, period2, period3, multiplier, source, value, offset, timeframe. Set every field you don't use to null (offset to 0).
  - "number": a constant in value (e.g. RSI threshold 30).
  - close/open/high/low/volume: raw bar values.
  - sma/ema(period, source), rsi(period, source), atr(period), atr_percent(period) = ATR as % of price.
  - bb_upper/bb_middle/bb_lower(period, multiplier).
  - macd/macd_signal/macd_hist(period = fast, period2 = slow, period3 = signal).
  - stoch_k/stoch_d(period, period2 = %K smoothing, period3 = %D smoothing). adx(period). roc(period) in %.
  - highest(period, source default high) and lowest(period, source default low) INCLUDE the current bar. For a breakout of the previous N bars, compare close with highest(N) at offset 1.
  - ibs = (close - low) / (high - low), between 0 and 1.
  - vwap: session VWAP reset every local day.
  - day_open, prev_day_high, prev_day_low, prev_day_close: daily levels in the strategy timezone.
  - hour, minute, weekday (1 = Monday … 7 = Sunday): of the bar OPEN time, in the strategy timezone.
  - offset: bars back (0 = the bar that just closed).
  - timeframe: compute the operand on a higher timeframe (e.g. a daily 200 SMA trend filter on a 15m strategy: sma, period 200, timeframe "1d"). Only completed higher-timeframe bars are used. Leave null for the strategy timeframe.
- Prefer tradingWindow (HH:MM–HH:MM on the signal bar close, local time) and tradingDays to express sessions, and exitAtTime to flatten intraday positions, rather than hour conditions.
- stop: percent (% from entry), atr (multiple of ATR at the signal bar), swing (value = lookback bars: below the lowest low for longs, above the highest high for shorts), or none.
- takeProfit: percent, atr, r_multiple (multiple of the stop distance, requires a stop), or none.
- trailingStop: percent or atr distance from the best price since entry, or none. breakEvenAtR moves the stop to entry after that many R.
- maxBarsInTrade: time stop in bars.
- Sizing: with a stop, riskPerTradePercent of equity is lost at the stop. Without stop, positionSizePercent of equity is invested. maxLeverage caps the notional.

Defaults when the user doesn't say (list each one you apply in assumptions):
- symbol BTCUSDT, timezone Europe/Paris, tradingDays all 7 days (crypto trades every day), riskPerTradePercent 1, positionSizePercent 100, maxLeverage 5.
- style: scalp → 1m or 5m, day → 15m or 1h with exitAtTime, swing → 4h or 1d.
- If the user gives no stop, use none, and say so in assumptions; never invent a target the user didn't imply.
- Name the strategy briefly in French.

Translate faithfully: don't add filters the user didn't ask for. If a part of the strategy can't be expressed with these building blocks (order flow, news, chart patterns, discretionary judgement), approximate it with the closest rule, say so in assumptions, and ask about it in questions.`;

// The strategy schema repeats the operand object 8 times, which compiles to a grammar
// too large for strict structured outputs. So the schema goes in the prompt and the
// answer is checked with Zod here, with one retry that shows the model its mistakes.
const OUTPUT_FORMAT = `Answer with ONE JSON object and nothing else (no Markdown, no code fence), matching this JSON Schema:\n${JSON.stringify(z.toJSONSchema(ParseResultSchema))}`;

function readJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON object");
  return JSON.parse(raw.slice(start, end + 1));
}

export async function parseStrategyText(text: string, current?: Strategy): Promise<ParseResult & { problems: string[] }> {
  const client = new Anthropic();
  const userContent = current
    ? `Stratégie actuelle (JSON) à modifier selon la demande :\n${JSON.stringify(current)}\n\nDemande :\n${text}`
    : text;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: userContent }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: `${SYSTEM}\n\n${OUTPUT_FORMAT}`,
      messages,
    });
    if (response.stop_reason === "refusal") {
      throw new Error("L'IA a refusé de traiter cette demande. Reformule la stratégie ou utilise le constructeur manuel.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("La réponse de l'IA est incomplète. Réessaie avec une description plus courte.");
    }
    const raw = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    let error: string;
    try {
      const parsed = ParseResultSchema.safeParse(readJson(raw));
      if (parsed.success) {
        const { strategy, problems } = normalizeStrategy(parsed.data.strategy);
        return { ...parsed.data, strategy, problems };
      }
      error = z.prettifyError(parsed.error);
    } catch {
      error = "The answer is not a valid JSON object.";
    }
    messages.push(
      { role: "assistant", content: raw || "(empty)" },
      { role: "user", content: `Your JSON does not match the schema:\n${error}\nSend the corrected JSON object only.` },
    );
  }
  throw new Error("La réponse de l'IA est invalide. Réessaie, ou utilise le constructeur manuel.");
}
