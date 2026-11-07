import { z } from "zod";
import { INTERVALS } from "../types";

/**
 * The strategy language. Kept flat (no recursion, nullable fields instead of
 * optional ones) so the same schema can be used for Claude structured outputs.
 */

export const INDICATORS = [
  // Raw prices
  "close",
  "open",
  "high",
  "low",
  "volume",
  "number",
  // Moving averages & oscillators
  "sma",
  "ema",
  "rsi",
  "atr",
  "atr_percent",
  "bb_upper",
  "bb_middle",
  "bb_lower",
  "macd",
  "macd_signal",
  "macd_hist",
  "stoch_k",
  "stoch_d",
  "adx",
  "roc",
  "highest",
  "lowest",
  "ibs",
  "vwap",
  "supertrend",
  "psar",
  "ichimoku_tenkan",
  "ichimoku_kijun",
  "ichimoku_span_a",
  "ichimoku_span_b",
  "keltner_upper",
  "keltner_middle",
  "keltner_lower",
  "bb_percent",
  "bb_width",
  "squeeze",
  "chop",
  "obv",
  "mfi",
  "zscore",
  "wma",
  "hma",
  "cci",
  "williams_r",
  "plus_di",
  "minus_di",
  // Candle patterns: 1 bullish, −1 bearish, 0 none
  "inside_bar",
  "engulfing",
  "pin_bar",
  "narrow_range",
  // Daily reference levels (local timezone)
  "day_open",
  "prev_day_high",
  "prev_day_low",
  "prev_day_close",
  "prev_week_high",
  "prev_week_low",
  "range_high",
  "range_low",
  "pivot",
  "pivot_r1",
  "pivot_s1",
  "pivot_r2",
  "pivot_s2",
  "cam_r3",
  "cam_s3",
  "cam_r4",
  "cam_s4",
  // Time filters (local timezone, bar open time)
  "hour",
  "minute",
  "weekday",
  // Pro plan: market structure, Heikin Ashi, divergences and more
  "swing_high",
  "swing_low",
  "bos",
  "structure",
  "fvg",
  "fvg_bull_top",
  "fvg_bull_bottom",
  "fvg_bear_top",
  "fvg_bear_bottom",
  "ha_open",
  "ha_high",
  "ha_low",
  "ha_close",
  "rsi_divergence",
  "macd_divergence",
  "stoch_rsi_k",
  "stoch_rsi_d",
  "aroon_up",
  "aroon_down",
  "cmf",
] as const;
export type IndicatorName = (typeof INDICATORS)[number];

/** Indicators reserved to the plans with `proIndicators` (the Pro plan). */
export const PRO_INDICATORS: ReadonlySet<IndicatorName> = new Set<IndicatorName>([
  "swing_high",
  "swing_low",
  "bos",
  "structure",
  "fvg",
  "fvg_bull_top",
  "fvg_bull_bottom",
  "fvg_bear_top",
  "fvg_bear_bottom",
  "ha_open",
  "ha_high",
  "ha_low",
  "ha_close",
  "rsi_divergence",
  "macd_divergence",
  "stoch_rsi_k",
  "stoch_rsi_d",
  "aroon_up",
  "aroon_down",
  "cmf",
]);

export const SOURCES = ["close", "open", "high", "low", "volume", "hl2", "hlc3", "ohlc4"] as const;

/**
 * Bounds on a strategy's size. Beyond them a request is refused before anything
 * is queued: one strategy with thousands of conditions, or periods in the
 * millions, would keep the worker busy for hours and everyone else waiting.
 * The widest template uses periods of 200, offsets of 1 and 4 conditions a group.
 */
export const LIMITS = {
  groups: 8,
  conditionsPerGroup: 8,
  period: 5000,
  offset: 500,
  multiplier: 100,
  value: 1e9,
  name: 120,
  description: 2000,
  maxBarsInTrade: 100_000,
} as const;

const period = z.number().max(LIMITS.period).nullable();

export const OperandSchema = z.object({
  indicator: z.enum(INDICATORS),
  period: period.describe("Main period (sma/ema/rsi/atr/bb/roc/highest/lowest/adx/stoch, MACD fast)."),
  period2: period.describe("MACD slow period, stochastic %K smoothing."),
  period3: period.describe("MACD signal period, stochastic %D smoothing."),
  multiplier: z.number().min(-LIMITS.multiplier).max(LIMITS.multiplier).nullable().describe("Bollinger band standard deviation multiplier."),
  source: z
    .enum(SOURCES)
    .nullable()
    .describe("Price series the indicator is computed on: hl2 = (high + low) / 2, hlc3 = (high + low + close) / 3, ohlc4 = average of the four prices. Default close; highest uses high, lowest uses low, cci uses hlc3."),
  value: z.number().min(-LIMITS.value).max(LIMITS.value).nullable().describe("Constant value, only for indicator 'number'."),
  offset: z.number().max(LIMITS.offset).describe("How many bars back to read the value (0 = current closed bar, 1 = previous bar)."),
  timeframe: z.enum(INTERVALS).nullable().describe("Higher timeframe to compute the indicator on (only completed higher-timeframe bars are used). null = strategy timeframe."),
  // Defaults to null so strategies saved before this field existed still parse.
  window: z
    .object({ start: z.string(), end: z.string() })
    .nullable()
    .default(null)
    .describe("Daily time window HH:MM–HH:MM in the strategy timezone, only for range_high / range_low. null otherwise."),
});
export type Operand = z.infer<typeof OperandSchema>;

/** Indicators read on a daily time window (the `window` field). */
export const WINDOW_INDICATORS: IndicatorName[] = ["range_high", "range_low"];

export const COMPARATORS = [">", ">=", "<", "<=", "==", "crosses_above", "crosses_below"] as const;
export type Comparator = (typeof COMPARATORS)[number];

export const ConditionSchema = z.object({
  left: OperandSchema,
  op: z.enum(COMPARATORS),
  right: OperandSchema,
});
export type Condition = z.infer<typeof ConditionSchema>;

/** All conditions of a group must be true (AND). A rule fires when any group is true (OR). */
export const GroupSchema = z.object({
  conditions: z.array(ConditionSchema).max(LIMITS.conditionsPerGroup),
});
export type Group = z.infer<typeof GroupSchema>;

export const StopSchema = z.object({
  type: z.enum(["none", "percent", "atr", "swing"]),
  value: z.number().nullable().describe("percent: % distance. atr: ATR multiple. swing: lookback bars for the lowest low / highest high."),
  atrPeriod: z.number().nullable(),
});

export const TakeProfitSchema = z.object({
  type: z.enum(["none", "percent", "atr", "r_multiple"]),
  value: z.number().nullable().describe("percent: % distance. atr: ATR multiple. r_multiple: multiple of the stop distance."),
  atrPeriod: z.number().nullable(),
});

export const TrailingSchema = z.object({
  type: z.enum(["none", "percent", "atr"]),
  value: z.number().nullable(),
  atrPeriod: z.number().nullable(),
});

const groups = z.array(GroupSchema).max(LIMITS.groups);

export const StrategySchema = z.object({
  name: z.string().max(LIMITS.name),
  description: z.string().max(LIMITS.description),
  style: z.enum(["scalp", "day", "swing"]),
  symbol: z.string().max(20).describe("Binance spot symbol (e.g. BTCUSDT), or one of EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, EURGBP, EURJPY, GBPJPY, XAUUSD (gold), NAS100 (Nasdaq 100 future NQ, nearly 24h) or QQQ (Nasdaq 100 fund, US market hours)."),
  interval: z.enum(INTERVALS),
  timezone: z.string().max(64).describe("IANA timezone used for hours, sessions and daily levels, e.g. Europe/Paris."),
  direction: z.enum(["long", "short", "both"]),
  entryLong: groups,
  entryShort: groups,
  exitLong: groups,
  exitShort: groups,
  stop: StopSchema,
  takeProfit: TakeProfitSchema,
  trailingStop: TrailingSchema,
  breakEvenAtR: z.number().nullable().describe("Move the stop to entry once the trade reaches this many R. null = off."),
  maxBarsInTrade: z.number().max(LIMITS.maxBarsInTrade).nullable(),
  tradingWindow: z
    .object({ start: z.string(), end: z.string() })
    .nullable()
    .describe("Entries only when the signal bar closes between start and end (HH:MM local). null = any time."),
  tradingDays: z.array(z.number()).max(7).describe("Allowed entry weekdays, 1 = Monday … 7 = Sunday."),
  exitAtTime: z.string().nullable().describe("Close any open position at this local time (HH:MM), for day trading. null = off."),
  riskPerTradePercent: z.number().describe("Equity risked per trade when a stop is set."),
  positionSizePercent: z.number().describe("Position size as % of equity when there is no stop."),
  maxLeverage: z.number(),
});
export type Strategy = z.infer<typeof StrategySchema>;

/** The Pro indicators read by the rules a strategy uses (a long-only strategy ignores its short rules), in order, each once. */
export function proIndicatorsIn(s: Pick<Strategy, "direction" | "entryLong" | "entryShort" | "exitLong" | "exitShort">): IndicatorName[] {
  const found = new Set<IndicatorName>();
  const rules = [...(s.direction !== "short" ? [s.entryLong, s.exitLong] : []), ...(s.direction !== "long" ? [s.entryShort, s.exitShort] : [])];
  for (const groups of rules)
    for (const g of groups) for (const c of g.conditions) for (const o of [c.left, c.right]) if (PRO_INDICATORS.has(o.indicator)) found.add(o.indicator);
  return [...found];
}

export const BacktestConfigSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  initialCapital: z.number().positive(),
  feePercent: z.number().min(0).describe("Exchange fee per side, % of notional."),
  spreadPercent: z.number().min(0).describe("Full bid/ask spread, % of price. Half is paid on each side."),
  slippagePercent: z.number().min(0).describe("Slippage on market orders and stops, % of price."),
  fundingPercentPer8h: z.number().describe("Funding / overnight cost per 8h held, % of notional (perpetual futures)."),
});
export type BacktestConfig = z.infer<typeof BacktestConfigSchema>;

export function operand(indicator: IndicatorName, opts: Partial<Operand> = {}): Operand {
  return {
    indicator,
    period: null,
    period2: null,
    period3: null,
    multiplier: null,
    source: null,
    value: null,
    offset: 0,
    timeframe: null,
    window: null,
    ...opts,
  };
}

export function num(value: number): Operand {
  return operand("number", { value });
}

export function defaultStrategy(): Strategy {
  return {
    name: "Nouvelle stratégie",
    description: "",
    style: "swing",
    symbol: "BTCUSDT",
    interval: "1h",
    timezone: "Europe/Paris",
    direction: "long",
    entryLong: [{ conditions: [] }],
    entryShort: [],
    exitLong: [],
    exitShort: [],
    stop: { type: "atr", value: 2, atrPeriod: 14 },
    takeProfit: { type: "r_multiple", value: 2, atrPeriod: null },
    trailingStop: { type: "none", value: null, atrPeriod: null },
    breakEvenAtR: null,
    maxBarsInTrade: null,
    tradingWindow: null,
    tradingDays: [1, 2, 3, 4, 5, 6, 7],
    exitAtTime: null,
    riskPerTradePercent: 1,
    positionSizePercent: 100,
    maxLeverage: 5,
  };
}

export function defaultConfig(): BacktestConfig {
  const end = new Date();
  const start = new Date(end.getTime() - 365 * 24 * 3600_000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    initialCapital: 10_000,
    feePercent: 0.05,
    spreadPercent: 0.01,
    slippagePercent: 0.01,
    fundingPercentPer8h: 0.01,
  };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Fixes values the builder or the AI may leave out of range. Returns the strategy and a list of problems. */
export function normalizeStrategy(input: Strategy): { strategy: Strategy; problems: string[] } {
  const s: Strategy = structuredClone(input);
  const problems: string[] = [];
  s.symbol = s.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s.symbol) problems.push("Symbole manquant.");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: s.timezone });
  } catch {
    problems.push(`Fuseau horaire inconnu « ${s.timezone} », Europe/Paris utilisé.`);
    s.timezone = "Europe/Paris";
  }
  if (s.direction === "long") s.entryShort = [];
  if (s.direction === "short") s.entryLong = [];
  const hasEntries = (groups: Group[]) => groups.some((g) => g.conditions.length > 0);
  if (!hasEntries(s.entryLong) && !hasEntries(s.entryShort)) problems.push("Aucune condition d'entrée.");
  for (const groups of [s.entryLong, s.entryShort, s.exitLong, s.exitShort]) {
    for (const g of groups) {
      for (const c of g.conditions) {
        for (const o of [c.left, c.right]) {
          o.offset = Math.max(0, Math.round(o.offset || 0));
          for (const k of ["period", "period2", "period3"] as const) {
            if (o[k] != null) o[k] = Math.max(1, Math.round(o[k]!));
          }
          if (o.indicator === "number" && o.value == null) {
            problems.push("Une valeur numérique est vide.");
            o.value = 0;
          }
          if (WINDOW_INDICATORS.includes(o.indicator)) {
            if (!o.window || !HHMM.test(o.window.start) || !HHMM.test(o.window.end) || o.window.start === o.window.end) {
              problems.push("Plage horaire invalide pour un haut ou bas de plage : 00:00–08:00 utilisée.");
              o.window = { start: "00:00", end: "08:00" };
            }
          } else {
            o.window = null;
          }
        }
      }
    }
  }
  if (s.stop.type !== "none" && !(s.stop.value && s.stop.value > 0)) {
    problems.push("Stop sans valeur : stop désactivé.");
    s.stop.type = "none";
  }
  if (s.takeProfit.type === "r_multiple" && s.stop.type === "none") {
    problems.push("Objectif en R sans stop : objectif désactivé.");
    s.takeProfit.type = "none";
  }
  if (s.takeProfit.type !== "none" && !(s.takeProfit.value && s.takeProfit.value > 0)) s.takeProfit.type = "none";
  if (s.trailingStop.type !== "none" && !(s.trailingStop.value && s.trailingStop.value > 0)) s.trailingStop.type = "none";
  if (s.tradingWindow && (!HHMM.test(s.tradingWindow.start) || !HHMM.test(s.tradingWindow.end))) {
    problems.push("Fenêtre horaire invalide (format HH:MM) : ignorée.");
    s.tradingWindow = null;
  }
  if (s.exitAtTime && !HHMM.test(s.exitAtTime)) {
    problems.push("Heure de sortie invalide (format HH:MM) : ignorée.");
    s.exitAtTime = null;
  }
  s.tradingDays = [...new Set(s.tradingDays.filter((d) => d >= 1 && d <= 7))].sort();
  if (s.tradingDays.length === 0) s.tradingDays = [1, 2, 3, 4, 5, 6, 7];
  s.riskPerTradePercent = clamp(s.riskPerTradePercent || 1, 0.01, 100);
  s.positionSizePercent = clamp(s.positionSizePercent || 100, 1, 10_000);
  s.maxLeverage = clamp(s.maxLeverage || 1, 1, 125);
  if (s.maxBarsInTrade != null) s.maxBarsInTrade = Math.max(1, Math.round(s.maxBarsInTrade));
  return { strategy: s, problems };
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}
