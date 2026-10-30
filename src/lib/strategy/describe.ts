import type { Comparator, IndicatorName, Operand, Strategy } from "./schema";

export const INDICATOR_LABELS: Record<IndicatorName, string> = {
  close: "Clôture",
  open: "Ouverture",
  high: "Plus haut",
  low: "Plus bas",
  volume: "Volume",
  number: "Valeur",
  sma: "Moyenne mobile (MM)",
  ema: "Moyenne mobile exp. (MME)",
  rsi: "RSI",
  atr: "ATR",
  atr_percent: "ATR en %",
  bb_upper: "Bollinger haute",
  bb_middle: "Bollinger milieu",
  bb_lower: "Bollinger basse",
  macd: "MACD",
  macd_signal: "MACD signal",
  macd_hist: "MACD histogramme",
  stoch_k: "Stochastique %K",
  stoch_d: "Stochastique %D",
  adx: "ADX",
  roc: "Variation % (ROC)",
  highest: "Plus haut sur N bougies",
  lowest: "Plus bas sur N bougies",
  ibs: "IBS (position dans la bougie)",
  vwap: "VWAP du jour",
  day_open: "Ouverture du jour",
  prev_day_high: "Plus haut de la veille",
  prev_day_low: "Plus bas de la veille",
  prev_day_close: "Clôture de la veille",
  hour: "Heure",
  minute: "Minute",
  weekday: "Jour de la semaine",
};

/** Which fields each indicator uses, for the builder and labels. */
export const INDICATOR_FIELDS: Record<IndicatorName, ("period" | "period2" | "period3" | "multiplier" | "source" | "value")[]> = {
  close: [],
  open: [],
  high: [],
  low: [],
  volume: [],
  number: ["value"],
  sma: ["period", "source"],
  ema: ["period", "source"],
  rsi: ["period", "source"],
  atr: ["period"],
  atr_percent: ["period"],
  bb_upper: ["period", "multiplier"],
  bb_middle: ["period", "multiplier"],
  bb_lower: ["period", "multiplier"],
  macd: ["period", "period2", "period3"],
  macd_signal: ["period", "period2", "period3"],
  macd_hist: ["period", "period2", "period3"],
  stoch_k: ["period", "period2", "period3"],
  stoch_d: ["period", "period2", "period3"],
  adx: ["period"],
  roc: ["period", "source"],
  highest: ["period", "source"],
  lowest: ["period", "source"],
  ibs: [],
  vwap: [],
  day_open: [],
  prev_day_high: [],
  prev_day_low: [],
  prev_day_close: [],
  hour: [],
  minute: [],
  weekday: [],
};

export const DEFAULT_PERIODS: Partial<Record<IndicatorName, Partial<Operand>>> = {
  sma: { period: 20 },
  ema: { period: 20 },
  rsi: { period: 14 },
  atr: { period: 14 },
  atr_percent: { period: 14 },
  bb_upper: { period: 20, multiplier: 2 },
  bb_middle: { period: 20, multiplier: 2 },
  bb_lower: { period: 20, multiplier: 2 },
  macd: { period: 12, period2: 26, period3: 9 },
  macd_signal: { period: 12, period2: 26, period3: 9 },
  macd_hist: { period: 12, period2: 26, period3: 9 },
  stoch_k: { period: 14, period2: 3, period3: 3 },
  stoch_d: { period: 14, period2: 3, period3: 3 },
  adx: { period: 14 },
  roc: { period: 10 },
  highest: { period: 20 },
  lowest: { period: 20 },
  number: { value: 0 },
};

export const COMPARATOR_LABELS: Record<Comparator, string> = {
  ">": ">",
  ">=": "≥",
  "<": "<",
  "<=": "≤",
  "==": "=",
  crosses_above: "croise au-dessus de",
  crosses_below: "croise en dessous de",
};

const SHORT: Partial<Record<IndicatorName, string>> = {
  close: "Clôture",
  open: "Ouverture",
  high: "Haut",
  low: "Bas",
  volume: "Volume",
  sma: "MM",
  ema: "MME",
  rsi: "RSI",
  atr: "ATR",
  atr_percent: "ATR%",
  bb_upper: "BB haute",
  bb_middle: "BB milieu",
  bb_lower: "BB basse",
  macd: "MACD",
  macd_signal: "MACD signal",
  macd_hist: "MACD hist",
  stoch_k: "Stoch %K",
  stoch_d: "Stoch %D",
  adx: "ADX",
  roc: "ROC",
  highest: "Plus haut",
  lowest: "Plus bas",
  ibs: "IBS",
  vwap: "VWAP",
  day_open: "Ouverture du jour",
  prev_day_high: "Haut veille",
  prev_day_low: "Bas veille",
  prev_day_close: "Clôture veille",
  hour: "Heure",
  minute: "Minute",
  weekday: "Jour",
};

export function operandLabel(o: Operand): string {
  if (o.indicator === "number") return String(o.value ?? 0);
  const fields = INDICATOR_FIELDS[o.indicator];
  const args: string[] = [];
  if (fields.includes("period") && o.period !== null) args.push(String(o.period));
  if (fields.includes("period2") && o.period2 !== null) args.push(String(o.period2));
  if (fields.includes("period3") && o.period3 !== null) args.push(String(o.period3));
  if (fields.includes("multiplier") && o.multiplier !== null) args.push(String(o.multiplier));
  if (fields.includes("source") && o.source && o.source !== "close" && !(o.indicator === "highest" && o.source === "high") && !(o.indicator === "lowest" && o.source === "low")) args.push(o.source);
  let s = (SHORT[o.indicator] ?? o.indicator) + (args.length ? `(${args.join(", ")})` : "");
  if (o.timeframe) s += ` [${o.timeframe}]`;
  if (o.offset > 0) s += ` il y a ${o.offset} bougie${o.offset > 1 ? "s" : ""}`;
  return s;
}

export function stopLabel(s: Strategy): string {
  const st = s.stop;
  switch (st.type) {
    case "percent":
      return `${st.value} % sous l'entrée`;
    case "atr":
      return `${st.value} × ATR(${st.atrPeriod ?? 14})`;
    case "swing":
      return `Au-delà du plus bas/haut des ${st.value} dernières bougies`;
    default:
      return "Aucun";
  }
}

export function targetLabel(s: Strategy): string {
  const tp = s.takeProfit;
  switch (tp.type) {
    case "percent":
      return `${tp.value} %`;
    case "atr":
      return `${tp.value} × ATR(${tp.atrPeriod ?? 14})`;
    case "r_multiple":
      return `${tp.value} R`;
    default:
      return "Aucun";
  }
}
