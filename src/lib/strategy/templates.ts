import { defaultStrategy, num, operand, type Strategy } from "./schema";

export interface Template {
  id: string;
  label: string;
  prompt: string;
  strategy: Strategy;
}

function make(over: Partial<Strategy>): Strategy {
  return { ...defaultStrategy(), ...over };
}

export const TEMPLATES: Template[] = [
  {
    id: "rsi2-swing",
    label: "Swing · Rebond RSI(2) en tendance haussière",
    prompt:
      "En journalier sur BTCUSDT, j'achète quand le RSI 2 passe sous 10 et que le prix est au-dessus de sa moyenne mobile 200. Je revends quand la clôture repasse au-dessus de la moyenne mobile 5. Stop de sécurité à 3 ATR, sortie au plus tard après 10 jours.",
    strategy: make({
      name: "Rebond RSI(2) en tendance",
      description: "Achat d'un repli court dans une tendance haussière de fond, revente au premier rebond.",
      style: "swing",
      interval: "1d",
      entryLong: [
        {
          conditions: [
            { left: operand("rsi", { period: 2 }), op: "<", right: num(10) },
            { left: operand("close"), op: ">", right: operand("sma", { period: 200 }) },
          ],
        },
      ],
      exitLong: [{ conditions: [{ left: operand("close"), op: ">", right: operand("sma", { period: 5 }) }] }],
      stop: { type: "atr", value: 3, atrPeriod: 14 },
      takeProfit: { type: "none", value: null, atrPeriod: null },
      maxBarsInTrade: 10,
    }),
  },
  {
    id: "ema-trend-swing",
    label: "Swing · Croisement de moyennes avec filtre ADX",
    prompt:
      "En 4h sur ETHUSDT, long et short. J'entre quand la MME 20 croise la MME 50 et que l'ADX 14 est au-dessus de 20. Stop à 2 ATR, puis stop suiveur à 3 ATR. Pas d'objectif fixe.",
    strategy: make({
      name: "Croisement MME 20/50 + ADX",
      description: "Suivi de tendance : on suit le croisement des moyennes quand le marché a de la force.",
      style: "swing",
      symbol: "ETHUSDT",
      interval: "4h",
      direction: "both",
      entryLong: [
        {
          conditions: [
            { left: operand("ema", { period: 20 }), op: "crosses_above", right: operand("ema", { period: 50 }) },
            { left: operand("adx", { period: 14 }), op: ">", right: num(20) },
          ],
        },
      ],
      entryShort: [
        {
          conditions: [
            { left: operand("ema", { period: 20 }), op: "crosses_below", right: operand("ema", { period: 50 }) },
            { left: operand("adx", { period: 14 }), op: ">", right: num(20) },
          ],
        },
      ],
      stop: { type: "atr", value: 2, atrPeriod: 14 },
      takeProfit: { type: "none", value: null, atrPeriod: null },
      trailingStop: { type: "atr", value: 3, atrPeriod: 14 },
    }),
  },
  {
    id: "pdh-breakout-day",
    label: "Day · Cassure du plus haut de la veille",
    prompt:
      "En 15 minutes sur BTCUSDT, entre 9h et 20h heure de Paris, j'achète quand la clôture casse le plus haut de la veille. Stop sous le plus bas des 8 dernières bougies, objectif 2R, je ferme tout à 23h.",
    strategy: make({
      name: "Cassure du plus haut de la veille",
      description: "Day trading : on suit la cassure d'un niveau clé de la veille, position fermée le soir.",
      style: "day",
      interval: "15m",
      entryLong: [{ conditions: [{ left: operand("close"), op: "crosses_above", right: operand("prev_day_high") }] }],
      stop: { type: "swing", value: 8, atrPeriod: null },
      takeProfit: { type: "r_multiple", value: 2, atrPeriod: null },
      tradingWindow: { start: "09:00", end: "20:00" },
      exitAtTime: "23:00",
    }),
  },
  {
    id: "bb-reversion-day",
    label: "Day · Retour à la moyenne sur les bandes de Bollinger",
    prompt:
      "En 15 minutes sur SOLUSDT, long et short. J'achète quand la clôture passe sous la bande de Bollinger basse (20, 2) avec un RSI 14 sous 30, je vends à découvert au-dessus de la bande haute avec RSI au-dessus de 70. Sortie sur la bande du milieu. Stop 1,5 ATR, sortie après 16 bougies maximum.",
    strategy: make({
      name: "Retour à la moyenne Bollinger",
      description: "Day trading : on joue le retour vers la moyenne après un excès.",
      style: "day",
      symbol: "SOLUSDT",
      interval: "15m",
      direction: "both",
      entryLong: [
        {
          conditions: [
            { left: operand("close"), op: "<", right: operand("bb_lower", { period: 20, multiplier: 2 }) },
            { left: operand("rsi", { period: 14 }), op: "<", right: num(30) },
          ],
        },
      ],
      entryShort: [
        {
          conditions: [
            { left: operand("close"), op: ">", right: operand("bb_upper", { period: 20, multiplier: 2 }) },
            { left: operand("rsi", { period: 14 }), op: ">", right: num(70) },
          ],
        },
      ],
      exitLong: [{ conditions: [{ left: operand("close"), op: ">=", right: operand("bb_middle", { period: 20, multiplier: 2 }) }] }],
      exitShort: [{ conditions: [{ left: operand("close"), op: "<=", right: operand("bb_middle", { period: 20, multiplier: 2 }) }] }],
      stop: { type: "atr", value: 1.5, atrPeriod: 14 },
      takeProfit: { type: "none", value: null, atrPeriod: null },
      maxBarsInTrade: 16,
    }),
  },
  {
    id: "ema-scalp",
    label: "Scalp · Croisement MME 9/21 dans le sens de la tendance",
    prompt:
      "En 5 minutes sur BTCUSDT, j'achète quand la MME 9 croise au-dessus de la MME 21 et que le prix est au-dessus de la MME 200 en 1 heure. Stop 0,4 %, objectif 0,6 %, je sors après 12 bougies si rien ne se passe. Seulement entre 14h et 22h.",
    strategy: make({
      name: "Scalp MME 9/21",
      description: "Scalping : petits mouvements dans le sens de la tendance horaire, pendant la séance américaine.",
      style: "scalp",
      interval: "5m",
      entryLong: [
        {
          conditions: [
            { left: operand("ema", { period: 9 }), op: "crosses_above", right: operand("ema", { period: 21 }) },
            { left: operand("close"), op: ">", right: operand("ema", { period: 200, timeframe: "1h" }) },
          ],
        },
      ],
      stop: { type: "percent", value: 0.4, atrPeriod: null },
      takeProfit: { type: "percent", value: 0.6, atrPeriod: null },
      maxBarsInTrade: 12,
      tradingWindow: { start: "14:00", end: "22:00" },
    }),
  },
];
