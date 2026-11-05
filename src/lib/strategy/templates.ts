import { defaultStrategy, num, operand, type Strategy } from "./schema";

export interface Template {
  id: string;
  label: string;
  prompt: string;
  strategy: Strategy;
  /** In the short list, before "Voir plus": a mix of swing, day and scalp. */
  featured?: boolean;
}

function make(over: Partial<Strategy>): Strategy {
  return { ...defaultStrategy(), ...over };
}

export const TEMPLATES: Template[] = [
  {
    id: "rsi2-swing",
    featured: true,
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
    id: "turtle-swing",
    featured: true,
    label: "Swing · Tortues : cassure des plus hauts de 20 jours",
    prompt:
      "En journalier sur BTCUSDT, long et short. J'achète quand la clôture dépasse le plus haut des 20 jours précédents, je vends à découvert sous le plus bas des 20 jours précédents. Je sors d'un achat sous le plus bas des 10 jours précédents, d'une vente au-dessus du plus haut des 10 jours précédents. Stop à 2 ATR(20).",
    strategy: make({
      name: "Tortues 20/10",
      description: "Suivi de tendance par cassure : peu de gagnants, mais quelques grandes tendances font la performance.",
      style: "swing",
      interval: "1d",
      direction: "both",
      entryLong: [{ conditions: [{ left: operand("close"), op: ">", right: operand("highest", { period: 20, offset: 1 }) }] }],
      entryShort: [{ conditions: [{ left: operand("close"), op: "<", right: operand("lowest", { period: 20, offset: 1 }) }] }],
      exitLong: [{ conditions: [{ left: operand("close"), op: "<", right: operand("lowest", { period: 10, offset: 1 }) }] }],
      exitShort: [{ conditions: [{ left: operand("close"), op: ">", right: operand("highest", { period: 10, offset: 1 }) }] }],
      stop: { type: "atr", value: 2, atrPeriod: 20 },
      takeProfit: { type: "none", value: null, atrPeriod: null },
    }),
  },
  {
    id: "ema21-pullback-swing",
    label: "Swing · Repli sur la MME 21 dans une tendance haussière",
    prompt:
      "En 4h sur ETHUSDT. La tendance doit être haussière : prix au-dessus de la MM 200 et MME 21 au-dessus de la MM 50. J'achète quand une bougie descend toucher la MME 21 mais clôture au-dessus, avec un RSI 14 entre 40 et 60. Stop sous le plus bas des 5 dernières bougies, objectif 2R.",
    strategy: make({
      name: "Repli sur la MME 21",
      description: "Swing : acheter le repli d'une tendance haussière sur sa moyenne, quand l'élan est retombé sans casser.",
      style: "swing",
      symbol: "ETHUSDT",
      interval: "4h",
      entryLong: [
        {
          conditions: [
            { left: operand("close"), op: ">", right: operand("sma", { period: 200 }) },
            { left: operand("ema", { period: 21 }), op: ">", right: operand("sma", { period: 50 }) },
            { left: operand("low"), op: "<=", right: operand("ema", { period: 21 }) },
            { left: operand("close"), op: ">", right: operand("ema", { period: 21 }) },
            { left: operand("rsi", { period: 14 }), op: ">", right: num(40) },
            { left: operand("rsi", { period: 14 }), op: "<", right: num(60) },
          ],
        },
      ],
      stop: { type: "swing", value: 5, atrPeriod: null },
      takeProfit: { type: "r_multiple", value: 2, atrPeriod: null },
    }),
  },
  {
    id: "squeeze-swing",
    label: "Swing · Cassure après une compression (squeeze)",
    prompt:
      "En 1h sur BTCUSDT, long et short. Quand la compression des bandes de Bollinger dans les canaux de Keltner se relâche, j'achète si la clôture est au-dessus de la MME 20, je vends à découvert si elle est en dessous. Je sors quand la clôture repasse de l'autre côté de la MME 20. Stop 1,5 ATR, sortie après 24 bougies maximum.",
    strategy: make({
      name: "Cassure après compression",
      description: "Les périodes calmes précèdent souvent un grand mouvement : on suit la sortie de la compression.",
      style: "swing",
      interval: "1h",
      direction: "both",
      entryLong: [
        {
          conditions: [
            { left: operand("squeeze", { period: 20, multiplier: 1.5, offset: 1 }), op: "==", right: num(1) },
            { left: operand("squeeze", { period: 20, multiplier: 1.5 }), op: "==", right: num(0) },
            { left: operand("close"), op: ">", right: operand("ema", { period: 20 }) },
          ],
        },
      ],
      entryShort: [
        {
          conditions: [
            { left: operand("squeeze", { period: 20, multiplier: 1.5, offset: 1 }), op: "==", right: num(1) },
            { left: operand("squeeze", { period: 20, multiplier: 1.5 }), op: "==", right: num(0) },
            { left: operand("close"), op: "<", right: operand("ema", { period: 20 }) },
          ],
        },
      ],
      exitLong: [{ conditions: [{ left: operand("close"), op: "crosses_below", right: operand("ema", { period: 20 }) }] }],
      exitShort: [{ conditions: [{ left: operand("close"), op: "crosses_above", right: operand("ema", { period: 20 }) }] }],
      stop: { type: "atr", value: 1.5, atrPeriod: 14 },
      takeProfit: { type: "none", value: null, atrPeriod: null },
      maxBarsInTrade: 24,
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
    id: "orb-day",
    featured: true,
    label: "Day · Cassure de la plage d'ouverture (15 min)",
    prompt:
      "En 5 minutes sur le Nasdaq 100, à l'heure de New York. Je repère le plus haut et le plus bas de 9h30 à 9h45. J'achète quand la clôture casse le haut de cette plage, je vends à découvert quand elle casse le bas, jusqu'à 11h30. Stop au-delà de l'extrême des 6 dernières bougies, objectif 2R, tout est fermé à 15h45.",
    strategy: make({
      name: "Cassure de la plage d'ouverture",
      description: "Day trading : la sortie de la plage des 15 premières minutes donne souvent le sens de la matinée.",
      style: "day",
      symbol: "NAS100",
      interval: "5m",
      timezone: "America/New_York",
      direction: "both",
      entryLong: [{ conditions: [{ left: operand("close"), op: "crosses_above", right: operand("range_high", { window: { start: "09:30", end: "09:45" } }) }] }],
      entryShort: [{ conditions: [{ left: operand("close"), op: "crosses_below", right: operand("range_low", { window: { start: "09:30", end: "09:45" } }) }] }],
      stop: { type: "swing", value: 6, atrPeriod: null },
      takeProfit: { type: "r_multiple", value: 2, atrPeriod: null },
      tradingWindow: { start: "09:45", end: "11:30" },
      tradingDays: [1, 2, 3, 4, 5],
      exitAtTime: "15:45",
    }),
  },
  {
    id: "pdh-fakeout-day",
    label: "Day · Fausse cassure des niveaux de la veille",
    prompt:
      "En 1h sur BTCUSDT, entre 8h et 20h heure de Paris. Je vends à découvert sur la première bougie qui dépasse le plus haut de la veille puis clôture en dessous ; j'achète sur la première qui passe sous le plus bas de la veille puis clôture au-dessus. Stop à 1,5 ATR, objectif 1,5R, tout est fermé à 23h.",
    strategy: make({
      name: "Fausse cassure de la veille",
      description: "Day trading : quand le prix balaie un niveau évident puis le réintègre, les traders de cassure sont piégés.",
      style: "day",
      // In 15 minutes, the fees weigh too much on moves this small.
      interval: "1h",
      direction: "both",
      entryLong: [
        {
          conditions: [
            { left: operand("low"), op: "<", right: operand("prev_day_low") },
            { left: operand("close"), op: ">", right: operand("prev_day_low") },
            { left: operand("low", { offset: 1 }), op: ">=", right: operand("prev_day_low", { offset: 1 }) },
          ],
        },
      ],
      entryShort: [
        {
          conditions: [
            { left: operand("high"), op: ">", right: operand("prev_day_high") },
            { left: operand("close"), op: "<", right: operand("prev_day_high") },
            { left: operand("high", { offset: 1 }), op: "<=", right: operand("prev_day_high", { offset: 1 }) },
          ],
        },
      ],
      // Right behind the swept extreme, a stop is both too close for the fees and where everyone else's sits.
      stop: { type: "atr", value: 1.5, atrPeriod: 14 },
      takeProfit: { type: "r_multiple", value: 1.5, atrPeriod: null },
      tradingWindow: { start: "08:00", end: "20:00" },
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
    id: "camarilla-day",
    label: "Day · Retour au pivot depuis les Camarilla R3 / S3",
    prompt:
      "En 15 minutes sur EURUSD, entre 8h et 18h heure de Paris, en semaine. Je vends à découvert quand le prix touche la Camarilla R3 et clôture en dessous, j'achète quand il touche la S3 et clôture au-dessus. Je sors au pivot. Stop 1 ATR, tout est fermé à 22h.",
    strategy: make({
      name: "Camarilla R3 / S3 vers le pivot",
      description: "Day trading : sur un marché sans tendance, les excès vers R3 et S3 reviennent souvent vers le pivot.",
      style: "day",
      symbol: "EURUSD",
      interval: "15m",
      direction: "both",
      entryLong: [
        {
          conditions: [
            { left: operand("low"), op: "<=", right: operand("cam_s3") },
            { left: operand("close"), op: ">", right: operand("cam_s3") },
          ],
        },
      ],
      entryShort: [
        {
          conditions: [
            { left: operand("high"), op: ">=", right: operand("cam_r3") },
            { left: operand("close"), op: "<", right: operand("cam_r3") },
          ],
        },
      ],
      exitLong: [{ conditions: [{ left: operand("close"), op: ">=", right: operand("pivot") }] }],
      exitShort: [{ conditions: [{ left: operand("close"), op: "<=", right: operand("pivot") }] }],
      stop: { type: "atr", value: 1, atrPeriod: 14 },
      takeProfit: { type: "none", value: null, atrPeriod: null },
      tradingWindow: { start: "08:00", end: "18:00" },
      tradingDays: [1, 2, 3, 4, 5],
      exitAtTime: "22:00",
    }),
  },
  {
    id: "ema-scalp",
    featured: true,
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
