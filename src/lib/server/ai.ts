import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { PRO_INDICATORS, StrategySchema, normalizeStrategy, type Strategy } from "../strategy/schema";
import type { AiUsage } from "./quotas";
import { UserError } from "./backtests";
import type { Lang } from "@/lib/i18n";

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

const SYSTEM = `You translate trading strategies written in French (sometimes English) into a strict JSON rule format used by a backtesting engine. Markets: Binance spot crypto pairs (BTCUSDT, ETHUSDT…), forex (EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, EURGBP, EURJPY, GBPJPY), gold (XAUUSD; "or", "gold") and the Nasdaq 100: NAS100 is the NQ future, trading nearly 24 hours on weekdays (use it for "nasdaq", "US100", "NQ", "NAS100"); QQQ is the fund that tracks it, only during New York market hours (use it only when the user says QQQ). Forex, gold and the Nasdaq are closed on weekends. Write every human-readable field (name, description, explanation, assumptions, questions) in French.

How the engine works:
- Signals are evaluated at each bar close. Orders fill at the next bar's open. Stops and targets are checked inside each bar using high/low; if both are touched in the same bar, the stop is assumed first.
- One position at a time. With direction "both", an opposite entry signal reverses the position.
- entryLong / entryShort / exitLong / exitShort are lists of groups. A group fires when ALL its conditions are true; a rule fires when ANY group fires. Use one group for a plain "A and B" rule, several groups for "A or B".
- A condition compares two operands with >, >=, <, <=, ==, crosses_above, crosses_below.
- Operand fields: indicator, period, period2, period3, multiplier, source, value, offset, timeframe, window. Set every field you don't use to null (offset to 0).
  - "number": a constant in value (e.g. RSI threshold 30).
  - close/open/high/low/volume: raw bar values.
  - source: close (default), open, high, low, volume, hl2 = (high + low) / 2, hlc3 = (high + low + close) / 3, ohlc4 = average of open, high, low and close. "SMA of (h+l)/2" = sma with source hl2.
  - sma/ema/wma(period, source): simple, exponential and linearly weighted moving averages. hma(period, source): Hull moving average.
  - rsi(period, source), atr(period), atr_percent(period) = ATR as % of price.
  - bb_upper/bb_middle/bb_lower(period, multiplier).
  - macd/macd_signal/macd_hist(period = fast, period2 = slow, period3 = signal).
  - stoch_k/stoch_d(period, period2 = %K smoothing, period3 = %D smoothing). adx(period). plus_di / minus_di(period): +DI and −DI of the same DMI, "plus_di > minus_di" = buyers push harder. roc(period) in %.
  - cci(period, source default hlc3): Commodity Channel Index, mostly between −100 and +100. williams_r(period): Williams %R from −100 (at the N-bar low) to 0 (at the high); below −80 = oversold, above −20 = overbought.
  - highest(period, source default high) and lowest(period, source default low) INCLUDE the current bar. For a breakout of the previous N bars, compare close with highest(N) at offset 1.
  - ibs = (close - low) / (high - low), between 0 and 1.
  - vwap: session VWAP reset every local day.
  - supertrend(period = ATR period, multiplier = ATR multiple): a line under the price in an uptrend, above it in a downtrend. "close > supertrend" = uptrend; crossing it = trend change.
  - psar(multiplier = acceleration step, default 0.02, max 0.2): Parabolic SAR, same reading as supertrend.
  - ichimoku_tenkan / ichimoku_kijun / ichimoku_span_a / ichimoku_span_b(period = tenkan 9, period2 = kijun 26, period3 = span B 52). The spans are the cloud drawn under the current bar. "Above the cloud" = close > both spans. Chikou = close compared with close at offset 26.
  - keltner_upper / keltner_middle / keltner_lower(period = EMA period, period2 = ATR period, multiplier = ATR multiple).
  - bb_percent(period, multiplier): position of the close between the Bollinger bands, 0 = lower band, 1 = upper band. bb_width(period, multiplier): band width in % of the middle band.
  - squeeze(period, multiplier = Keltner ATR multiple, default 1.5): 1 while the Bollinger bands (period, 2) are inside the Keltner channel, else 0. A squeeze release is "squeeze at offset 1 == 1 and squeeze == 0".
  - chop(period): choppiness index, above 61.8 = choppy range, below 38.2 = trending.
  - obv: on-balance volume, compare it with itself at an offset. mfi(period): money flow index 0–100. zscore(period, source): distance from the N-bar mean in standard deviations.
  - Candle patterns on the bar that just closed: inside_bar (1 or 0), engulfing (1 bullish, −1 bearish, 0), pin_bar (1 = long lower wick, −1 = long upper wick, 0), narrow_range(period, 7 for NR7: 1 when the bar has the smallest range of the last N). Compare them with a number: "engulfing == 1".
  - day_open, prev_day_high, prev_day_low, prev_day_close: daily levels in the strategy timezone. prev_week_high, prev_week_low: previous week (Monday to Sunday).
  - range_high / range_low with window {start, end} (HH:MM, strategy timezone): high and low of a daily time window, available once the window is over, until the end of that day (or the next window when it spans midnight). Opening range of New York: timezone America/New_York, window 09:30–09:45. Asian range: e.g. window 00:00–08:00 Europe/Paris.
  - pivot, pivot_r1, pivot_s1, pivot_r2, pivot_s2: classic floor pivots; cam_r3, cam_s3, cam_r4, cam_s4: Camarilla levels. Both from the previous local day's high, low and close.
  - hour, minute, weekday (1 = Monday … 7 = Sunday): of the bar OPEN time, in the strategy timezone.
  - ICT order blocks (every plan):
    - order_block, ob_bull_top, ob_bull_bottom, ob_bear_top, ob_bear_bottom(period = bars before, period2 = bars after the swing, default 5 and 5). When a close breaks the latest swing high, the last bearish candle before the rise that broke it is the bullish order block; the mirror for bearish. ob_bull_top / ob_bull_bottom: high and low of the latest bullish block, until a close goes below it or a newer bullish block replaces it (no value otherwise); ob_bear_top / ob_bear_bottom the same for bearish blocks. order_block: 1 on the first bar that comes back into the bullish block (its low reaches ob_bull_top without closing below ob_bull_bottom), −1 the same for the bearish block, 0 otherwise; each block fires once. "Buy the retest of a bullish order block" = "order_block == 1". To exit when a close goes under the block: exitLong "close < ob_bull_bottom" with offset 1 on ob_bull_bottom (the zone has no value from the bar that closes through it).
  - Pro plan only (${[...PRO_INDICATORS].join(", ")}):
    - swing_high / swing_low(period = bars before, period2 = bars after, default 5 and 5): level of the latest confirmed swing high / low, known period2 bars after it. "close crosses_above swing_high" = breakout of the last swing high.
    - bos(period, period2): break of structure on the bar that just closed, 1 = close above the latest swing high, −1 = below the latest swing low, 0 = none; each swing breaks once. structure(period, period2): side of the last break, 1 bullish, −1 bearish, 0 before any. A change of character (CHoCH) = "bos == 1 and structure at offset 1 == −1".
    - fvg: fair value gap formed by the bar that just closed (3 candles), 1 bullish (its low above the high two bars earlier), −1 bearish, 0. fvg_bull_top / fvg_bull_bottom: zone of the latest bullish gap, until a close goes below it (no value otherwise); fvg_bear_top / fvg_bear_bottom the same for bearish gaps. A retest of a bullish gap = "low <= fvg_bull_top" and "close > fvg_bull_bottom".
    - ha_open, ha_high, ha_low, ha_close: Heikin Ashi candle. Green Heikin Ashi = "ha_close > ha_open".
    - rsi_divergence(period = RSI period, period2 = bars each side of the RSI swing, default 14 and 5) and macd_divergence(period = fast, period2 = slow, period3 = swing bars, default 12, 26, 5): 1 = regular bullish divergence (lower low in price, higher low in the oscillator), −1 = regular bearish, 0 = none. Signalled when the second swing is confirmed, period2 (or period3) bars after it.
    - stoch_rsi_k / stoch_rsi_d(period = RSI period, period2 = stochastic period, period3 = %K smoothing; default 14, 14, 3; %D = 3-bar average of %K): 0 to 100.
    - aroon_up / aroon_down(period, default 14): 100 when the N-bar high (low) is on this bar, down to 0 when it is N bars old.
    - cmf(period, default 20): Chaikin Money Flow, −1 to 1, above 0 = volume traded near the highs.
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

Translate faithfully: don't add filters the user didn't ask for. If a part of the strategy can't be expressed with these building blocks (order flow, news, chart patterns other than the candle patterns above, discretionary judgement), approximate it with the closest rule, say so in assumptions, and ask about it in questions.`;

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

/** Anthropic list prices in dollars per million tokens (input, output), for the cost estimates of the admin page. */
export const AI_PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
};

/** The model that translates (AI_MODEL to try another, e.g. a Sonnet, without a deploy). */
const MODEL = process.env.AI_MODEL || "claude-opus-5-5";
/** A strategy's JSON runs 1 000 to 3 000 tokens; the explanation and questions a few hundred more. */
const MAX_TOKENS = 8000;

/** The prompt is written for the French site; the English one gets its texts in English. */
function systemPrompt(lang: Lang) {
  const prompt = `${SYSTEM}\n\n${OUTPUT_FORMAT}`;
  if (lang === "fr") return prompt;
  return prompt.replaceAll("French", "English").replace("written in English (sometimes English)", "written in English (sometimes French)");
}

/** `usage` accumulates the tokens of every attempt, even when the translation fails. */
/** Told to the AI when the user's plan doesn't include the Pro indicators. */
const NO_PRO = `This user's plan does not include the Pro plan indicators: never use them. Approximate the idea with the other building blocks when you can, and say in assumptions which indicator you replaced and that it is reserved to the Pro plan.`;

/** `usage` accumulates the tokens of every attempt, even when the translation fails. `pro`: the plan includes the Pro indicators. */
export async function parseStrategyText(text: string, current: Strategy | undefined, usage: AiUsage, lang: Lang = "fr", pro = true): Promise<ParseResult & { problems: string[] }> {
  const client = new Anthropic();
  const userContent = current
    ? lang === "en"
      ? `Current strategy (JSON), to change as requested:\n${JSON.stringify(current)}\n\nRequest:\n${text}`
      : `Stratégie actuelle (JSON) à modifier selon la demande :\n${JSON.stringify(current)}\n\nDemande :\n${text}`
    : text;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: userContent }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      // The rules and the schema (about 4 000 tokens) are the same for every call: cached, they cost a tenth from the second call on.
      system: [
        { type: "text", text: systemPrompt(lang), cache_control: { type: "ephemeral" } },
        ...(pro ? [] : [{ type: "text" as const, text: NO_PRO }]),
      ],
      messages,
    });
    const u = response.usage;
    // Counted at their billed weight (a cache write costs 1.25×, a read 0.1×), so the admin page's cost estimate stays right.
    usage.inputTokens += Math.round(u.input_tokens + 1.25 * (u.cache_creation_input_tokens ?? 0) + 0.1 * (u.cache_read_input_tokens ?? 0));
    usage.outputTokens += u.output_tokens;
    usage.model = response.model;
    if (response.stop_reason === "refusal") {
      throw new UserError("L'IA a refusé de traiter cette demande. Reformule la stratégie ou utilise le constructeur manuel.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new UserError("La réponse de l'IA est incomplète. Réessaie avec une description plus courte.");
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
  throw new UserError("La réponse de l'IA est invalide. Réessaie, ou utilise le constructeur manuel.");
}
