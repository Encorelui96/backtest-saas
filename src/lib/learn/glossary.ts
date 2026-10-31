import type { IndicatorName } from "../strategy/schema";

/**
 * Plain-French definitions for beginner mode: shown in the term pop-ups and on
 * the /apprendre page. `short` fits in a pop-up, `long` and `example` only on the page.
 */

export interface GlossaryEntry {
  id: string;
  term: string;
  category: GlossaryCategory;
  short: string;
  long?: string;
  example?: string;
}

export const GLOSSARY_CATEGORIES = [
  { id: "bases", label: "Les bases" },
  { id: "regles", label: "Règles et indicateurs" },
  { id: "risque", label: "Gestion du risque" },
  { id: "couts", label: "Coûts" },
  { id: "resultats", label: "Lire les résultats" },
  { id: "robustesse", label: "Robustesse" },
] as const;
export type GlossaryCategory = (typeof GLOSSARY_CATEGORIES)[number]["id"];

export const GLOSSARY: GlossaryEntry[] = [
  // Les bases
  {
    id: "backtest",
    term: "Backtest",
    category: "bases",
    short: "Rejouer une stratégie sur les cours passés pour voir ce qu'elle aurait gagné ou perdu.",
    long: "Backtest Lab applique tes règles bougie par bougie sur l'historique, comme si tu avais tradé à l'époque, frais compris. C'est un test sur le passé : il ne garantit rien pour la suite, mais il élimine vite les idées qui ne marchent pas.",
  },
  {
    id: "symbole",
    term: "Symbole (paire)",
    category: "bases",
    short: "Ce que tu trades : une crypto (BTCUSDT = bitcoin en dollars), une paire de devises (EURUSD), l'or (XAUUSD) ou le Nasdaq 100 (NAS100).",
    example: "ETHUSDT = l'ether en dollars, GBPUSD = la livre en dollars.",
  },
  {
    id: "forex",
    term: "Forex, or et Nasdaq",
    category: "bases",
    short: "En plus des cryptos : les grandes paires de devises (EURUSD…), l'or (XAUUSD) et le Nasdaq 100 via QQQ, le fonds qui le suit. Ces marchés sont fermés le week-end, et QQQ ne cote que pendant la bourse américaine (15h30-22h à Paris).",
    long: "On les trade surtout en CFD chez un courtier : pas de frais de plateforme mais un spread, et un petit coût de financement si la position reste ouverte la nuit. Choisis le profil de frais « Forex, or, Nasdaq ». Le suivi en direct de ces marchés est actualisé toutes les 5 minutes.",
    example: "EURUSD à 1,08 = 1 euro vaut 1,08 dollar. XAUUSD à 2 400 = une once d'or vaut 2 400 dollars.",
  },
  {
    id: "pip",
    term: "Pip",
    category: "bases",
    short: "La plus petite unité de prix courante en forex : 0,0001 sur EURUSD, 0,01 sur USDJPY. Backtest Lab raisonne en %, en ATR ou en R, pas en pips.",
  },
  {
    id: "bougie",
    term: "Bougie",
    category: "bases",
    short: "Le résumé du prix sur une période : prix d'ouverture, plus haut, plus bas et clôture.",
    long: "Une bougie verte a clôturé plus haut qu'elle n'a ouvert, une rouge plus bas. Les « mèches » montrent jusqu'où le prix est allé pendant la période.",
  },
  {
    id: "unite-de-temps",
    term: "Unité de temps",
    category: "bases",
    short: "La durée d'une bougie : 1m = 1 minute, 1h = 1 heure, 1d = 1 jour.",
    long: "Plus l'unité est petite, plus il y a de trades et plus les frais pèsent. Pour débuter, 4h ou 1d donnent des résultats plus stables.",
  },
  {
    id: "long",
    term: "Achat (long)",
    category: "bases",
    short: "Tu achètes en pariant que le prix va monter. Tu gagnes si tu revends plus cher.",
  },
  {
    id: "short",
    term: "Vente à découvert (short)",
    category: "bases",
    short: "Tu vends sans posséder la crypto, en pariant que le prix va baisser. Tu gagnes si tu la rachètes moins cher.",
    long: "Ça demande un compte futures ou marge. Pour débuter, commence par l'achat seulement.",
  },
  {
    id: "style",
    term: "Scalp, day trading, swing",
    category: "bases",
    short: "La durée de tes trades : quelques minutes (scalp), dans la journée (day), plusieurs jours (swing).",
  },
  {
    id: "fuseau",
    term: "Fuseau horaire",
    category: "bases",
    short: "Sert aux règles d'heure (« pas d'entrée avant 9h ») et aux niveaux du jour. Garde Europe/Paris si tu es en France.",
  },

  // Règles et indicateurs
  {
    id: "signal",
    term: "Signal et conditions",
    category: "regles",
    short: "Une règle comme « RSI 14 < 30 ». Quand toutes les conditions d'un groupe sont vraies, la stratégie entre en position.",
    long: "Les règles sont vérifiées à la clôture de chaque bougie, et l'ordre part à l'ouverture de la bougie suivante : on ne triche jamais avec le futur.",
  },
  {
    id: "et-ou",
    term: "ET / OU",
    category: "regles",
    short: "ET : toutes les conditions doivent être vraies en même temps. OU : un seul groupe de conditions suffit.",
    example: "« RSI < 30 ET clôture > MM 200 » est plus sélectif que « RSI < 30 » seul.",
  },
  {
    id: "croise",
    term: "Croise au-dessus / en dessous",
    category: "regles",
    short: "Vrai seulement sur la bougie où une courbe passe de l'autre côté de l'autre, pas les bougies suivantes.",
    example: "« MME 20 croise au-dessus de MME 50 » ne déclenche qu'une fois, au moment du croisement.",
  },
  {
    id: "periode",
    term: "Période",
    category: "regles",
    short: "Le nombre de bougies utilisées pour calculer un indicateur. RSI 14 = calculé sur les 14 dernières bougies.",
  },
  {
    id: "mm",
    term: "Moyenne mobile (MM)",
    category: "regles",
    short: "Le prix moyen des N dernières bougies. Elle lisse le prix et montre la tendance.",
    example: "Clôture au-dessus de la MM 200 = tendance plutôt haussière.",
  },
  {
    id: "mme",
    term: "Moyenne mobile exponentielle (MME)",
    category: "regles",
    short: "Comme la MM, mais elle donne plus de poids aux bougies récentes : elle réagit plus vite.",
  },
  {
    id: "rsi",
    term: "RSI",
    category: "regles",
    short: "Mesure de 0 à 100 la force des hausses récentes face aux baisses. Sous 30 : le prix a beaucoup baissé ; au-dessus de 70 : beaucoup monté.",
  },
  {
    id: "atr",
    term: "ATR",
    category: "regles",
    short: "La taille moyenne d'une bougie (en prix) sur N bougies. Elle mesure l'agitation du marché.",
    long: "Un stop « à 2 ATR » s'adapte tout seul : plus large quand le marché bouge beaucoup, plus serré quand il est calme. L'ATR en % est la même chose rapportée au prix.",
  },
  {
    id: "bollinger",
    term: "Bandes de Bollinger",
    category: "regles",
    short: "Une moyenne mobile entourée de deux bandes. Le prix reste entre les bandes la plupart du temps ; il en sort lors des gros mouvements.",
  },
  {
    id: "macd",
    term: "MACD",
    category: "regles",
    short: "La différence entre une MME rapide et une MME lente. Positive en tendance haussière, négative en baissière.",
    long: "La ligne de signal est une moyenne du MACD ; l'histogramme est l'écart entre les deux. Le croisement MACD / signal est un signal classique.",
  },
  {
    id: "stochastique",
    term: "Stochastique",
    category: "regles",
    short: "Situe la clôture entre le plus bas et le plus haut des N dernières bougies, de 0 à 100. Proche de 0 : près du plus bas.",
  },
  {
    id: "adx",
    term: "ADX",
    category: "regles",
    short: "Mesure la force d'une tendance, pas son sens. Au-dessus de 25 : le marché suit une vraie tendance.",
  },
  {
    id: "roc",
    term: "Variation % (ROC)",
    category: "regles",
    short: "De combien le prix a varié, en %, depuis N bougies.",
  },
  {
    id: "ibs",
    term: "IBS",
    category: "regles",
    short: "Où la bougie a clôturé entre son plus bas (0) et son plus haut (1). Sous 0,2 : clôture tout près du plus bas.",
  },
  {
    id: "vwap",
    term: "VWAP",
    category: "regles",
    short: "Le prix moyen de la journée, pondéré par les volumes échangés. Beaucoup de day traders s'en servent comme repère.",
  },
  {
    id: "volume",
    term: "Volume",
    category: "regles",
    short: "La quantité échangée pendant la bougie. Un mouvement avec beaucoup de volume est souvent plus fiable.",
  },
  {
    id: "niveaux",
    term: "Plus haut / plus bas sur N bougies",
    category: "regles",
    short: "Le prix le plus haut (ou le plus bas) atteint sur les N dernières bougies. Sert à repérer les cassures.",
  },
  {
    id: "veille",
    term: "Niveaux de la veille",
    category: "regles",
    short: "Le plus haut, le plus bas et la clôture de la journée précédente, souvent utilisés comme supports et résistances.",
  },
  {
    id: "ut-superieure",
    term: "Unité de temps supérieure",
    category: "regles",
    short: "Calculer un indicateur sur des bougies plus longues que celles de la stratégie, pour filtrer la tendance de fond.",
    example: "Stratégie en 15m, filtre « clôture > MM 200 en 1d ».",
  },
  {
    id: "decalage",
    term: "Décalage",
    category: "regles",
    short: "Lire la valeur d'un indicateur N bougies en arrière. Décalage 1 = la bougie précédente.",
  },

  // Gestion du risque
  {
    id: "stop",
    term: "Stop (stop loss)",
    category: "risque",
    short: "Le prix où tu coupes ta perte si le trade part dans le mauvais sens. Indispensable pour ne pas tout perdre sur un trade.",
    long: "En %, en ATR ou sous le plus bas récent. Dans Backtest Lab, la distance au stop sert aussi à calculer la taille de la position.",
  },
  {
    id: "objectif",
    term: "Objectif (take profit)",
    category: "risque",
    short: "Le prix où tu encaisses ton gain automatiquement.",
  },
  {
    id: "r",
    term: "R (multiple du risque)",
    category: "risque",
    short: "Ton gain ou ta perte comparé au risque pris. 1R = la perte si le stop est touché. Un objectif à 2R rapporte deux fois ce que tu risques.",
    example: "Tu risques 100 $ : un trade à +2R rapporte 200 $, un trade à −1R coûte 100 $.",
  },
  {
    id: "stop-suiveur",
    term: "Stop suiveur",
    category: "risque",
    short: "Un stop qui suit le prix quand il va dans ton sens, pour protéger une partie du gain.",
  },
  {
    id: "point-mort",
    term: "Stop au point mort",
    category: "risque",
    short: "Remonter le stop au prix d'entrée une fois le trade en gain d'un certain nombre de R : au pire, tu sors à zéro.",
  },
  {
    id: "duree-max",
    term: "Durée max",
    category: "risque",
    short: "Fermer le trade après N bougies s'il n'a touché ni le stop ni l'objectif.",
  },
  {
    id: "risque-par-trade",
    term: "Risque par trade",
    category: "risque",
    short: "Le % de ton capital perdu si le stop est touché. 1 % est un bon point de départ : 10 pertes de suite ne coûtent qu'environ 10 %.",
  },
  {
    id: "taille",
    term: "Taille de position",
    category: "risque",
    short: "La somme engagée dans un trade. Avec un stop, elle est calculée pour respecter ton risque par trade ; sans stop, c'est un % fixe du capital.",
  },
  {
    id: "levier",
    term: "Levier",
    category: "risque",
    short: "Emprunter pour prendre une position plus grosse que ton capital. Il multiplie les gains comme les pertes.",
    long: "Le levier max limite la taille calculée. Au-delà, une petite baisse peut liquider la position.",
  },
  {
    id: "liquidation",
    term: "Liquidation",
    category: "risque",
    short: "Avec du levier, si la perte mange ta mise, la plateforme ferme ta position de force et tu perds la mise.",
  },

  // Coûts
  {
    id: "frais",
    term: "Frais",
    category: "couts",
    short: "Ce que la plateforme prend à chaque achat et à chaque vente, en % du montant. Payés à l'entrée et à la sortie.",
  },
  {
    id: "spread",
    term: "Spread",
    category: "couts",
    short: "L'écart entre le prix d'achat et le prix de vente au même moment. Tu paies la moitié à l'entrée et la moitié à la sortie.",
  },
  {
    id: "glissement",
    term: "Glissement",
    category: "couts",
    short: "Un ordre au marché s'exécute souvent un peu moins bien que le prix affiché, surtout quand ça bouge vite.",
  },
  {
    id: "financement",
    term: "Financement",
    category: "couts",
    short: "Sur les contrats perpétuels (futures), un petit coût payé toutes les 8 heures tant que la position est ouverte.",
  },

  // Lire les résultats
  {
    id: "capital",
    term: "Capital de départ",
    category: "resultats",
    short: "La somme fictive avec laquelle le test commence. Les gains s'ajoutent au fil des trades.",
  },
  {
    id: "rendement",
    term: "Rendement total",
    category: "resultats",
    short: "Combien le capital a gagné ou perdu sur toute la période du test, frais compris.",
  },
  {
    id: "achat-conservation",
    term: "Achat-conservation",
    category: "resultats",
    short: "Ce que tu aurais gagné en achetant au début et en gardant jusqu'à la fin, sans rien faire. La stratégie doit faire mieux, ou risquer bien moins.",
  },
  {
    id: "rendement-annuel",
    term: "Rendement annuel",
    category: "resultats",
    short: "Le rendement ramené à une année moyenne, pour comparer des tests de durées différentes.",
  },
  {
    id: "drawdown",
    term: "Baisse max (drawdown)",
    category: "resultats",
    short: "La pire chute du capital depuis un sommet. C'est la douleur que tu aurais dû supporter sans abandonner.",
    example: "−20 % sur 10 000 $ : à un moment, ton compte est passé de 10 000 $ à 8 000 $.",
  },
  {
    id: "trades",
    term: "Nombre de trades",
    category: "resultats",
    short: "Combien de fois la stratégie est entrée en position. Sous 30 trades, le résultat peut être de la chance.",
  },
  {
    id: "gagnants",
    term: "Taux de gagnants",
    category: "resultats",
    short: "Le % de trades fermés en gain. Il ne suffit pas : 30 % de gagnants peut être très rentable si chaque gain vaut 3 pertes.",
  },
  {
    id: "profit-factor",
    term: "Profit factor",
    category: "resultats",
    short: "Total des gains divisé par total des pertes. Au-dessus de 1 : la stratégie gagne. Au-dessus de 1,5 : c'est solide.",
  },
  {
    id: "gain-moyen",
    term: "Gain moyen par trade",
    category: "resultats",
    short: "Ce que rapporte un trade en moyenne, gagnants et perdants mélangés. Il doit être positif, sinon la stratégie perd sur la durée.",
  },
  {
    id: "sharpe",
    term: "Sharpe et Sortino",
    category: "resultats",
    short: "Le rendement comparé aux secousses du capital. Plus c'est haut, plus la courbe est régulière. Au-dessus de 1, c'est bien.",
    long: "Le Sortino ne compte que les secousses à la baisse.",
  },
  {
    id: "pertes-affilee",
    term: "Pertes d'affilée",
    category: "resultats",
    short: "La plus longue série de trades perdants. Demande-toi si tu aurais continué à suivre la stratégie après autant de pertes.",
  },
  {
    id: "exposition",
    term: "Temps en position",
    category: "resultats",
    short: "Le % du temps où tu avais un trade ouvert. Moins de temps en position = moins de risque pour un même gain.",
  },
  {
    id: "courbe-capital",
    term: "Courbe du capital",
    category: "resultats",
    short: "L'évolution du compte trade après trade. Une courbe qui monte régulièrement vaut mieux qu'une courbe en montagnes russes.",
  },

  // Robustesse
  {
    id: "surajustement",
    term: "Surajustement",
    category: "robustesse",
    short: "Régler une stratégie jusqu'à ce qu'elle colle parfaitement au passé. Elle a l'air géniale en test et échoue ensuite.",
    long: "Le piège numéro un du débutant. Les contrôles de l'onglet Robustesse servent à le détecter.",
  },
  {
    id: "avantage",
    term: "Avantage réel",
    category: "robustesse",
    short: "Le test vérifie si le gain moyen pourrait venir du hasard, en retirant les trades au hasard des milliers de fois.",
  },
  {
    id: "validation",
    term: "Étude puis validation",
    category: "robustesse",
    short: "Les 70 premiers % de l'historique d'un côté, les 30 derniers % de l'autre. La stratégie doit gagner sur les deux.",
  },
  {
    id: "monte-carlo",
    term: "Monte Carlo",
    category: "robustesse",
    short: "Mélanger l'ordre des trades des milliers de fois pour voir les pires et meilleurs scénarios possibles avec les mêmes trades.",
  },
  {
    id: "reglages-voisins",
    term: "Réglages voisins",
    category: "robustesse",
    short: "Relancer le test en changeant un peu chaque réglage (RSI 12 ou 16 au lieu de 14…). Une bonne stratégie gagne aussi avec des réglages proches.",
  },
  {
    id: "frais-doubles",
    term: "Frais doublés",
    category: "robustesse",
    short: "Le même test avec des coûts deux fois plus élevés. Si la stratégie devient perdante, sa marge est trop fine.",
  },
  {
    id: "prop-firm",
    term: "Challenge prop firm",
    category: "robustesse",
    short: "Des sociétés confient du capital aux traders qui réussissent un examen (un objectif de gain sans dépasser une perte max). Cet onglet estime tes chances.",
  },
];

const BY_ID = new Map(GLOSSARY.map((e) => [e.id, e]));

export function glossary(id: string): GlossaryEntry | undefined {
  return BY_ID.get(id);
}

/** The glossary entry that explains each indicator of the rule builder. */
export const INDICATOR_TERMS: Partial<Record<IndicatorName, string>> = {
  volume: "volume",
  sma: "mm",
  ema: "mme",
  rsi: "rsi",
  atr: "atr",
  atr_percent: "atr",
  bb_upper: "bollinger",
  bb_middle: "bollinger",
  bb_lower: "bollinger",
  macd: "macd",
  macd_signal: "macd",
  macd_hist: "macd",
  stoch_k: "stochastique",
  stoch_d: "stochastique",
  adx: "adx",
  roc: "roc",
  highest: "niveaux",
  lowest: "niveaux",
  ibs: "ibs",
  vwap: "vwap",
  prev_day_high: "veille",
  prev_day_low: "veille",
  prev_day_close: "veille",
};
