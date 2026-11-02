import type { PropRules } from "./engine/propfirm";
import type { Market } from "./markets";

/**
 * The challenges of the three prop firms traders ask about most, as their
 * official pages gave them on 2 November 2026, for a 100 000 $ account.
 * Their rules and prices change often: the page says when they were read and
 * links to the source. Backtest Lab has no tie with any of these firms.
 */

export const PROP_FIRMS_CHECKED = "2 novembre 2026";

export type AssetKind = Market["kind"] | "crypto";

export interface PropFirmOffer {
  id: string;
  firm: string;
  program: string;
  /** The firm's flagship two-phase challenge, compared side by side. */
  flagship: boolean;
  rules: PropRules;
  price: string;
  /** Price in its currency, for the expected cost of getting funded. */
  priceValue: number;
  currency: "€" | "$";
  refund: string;
  split: string;
  /** null when the firm's page doesn't say. */
  payouts: string | null;
  news: string;
  /** No order around major announcements: on the funded account only, at every step, or never. */
  newsRestriction: "funded" | "always" | null;
  weekend: string;
  /** Maximum leverage by asset, where the firm publishes it. */
  leverage: Partial<Record<AssetKind, number>>;
  leverageNote: string;
  extras: string[];
  url: string;
}

const FTMO_NEWS =
  "Libre pendant le challenge. Sur le compte FTMO Standard, aucun ordre 2 minutes avant et après les grosses annonces (Fed, NFP, CPI, BCE…) sur le dollar, l'euro, l'or et les indices US. Aucune restriction sur un compte Swing.";
const FTMO_WEEKEND =
  "Libre pendant le challenge. Sur le compte FTMO Standard, les positions doivent être fermées avant une coupure de plus de 2 heures, comme le week-end. Aucune restriction sur un compte Swing.";
const FTMO_LEVERAGE = "Compte Standard : jusqu'à 1:100 sur le forex, 1:50 sur l'or ; compte Swing : jusqu'à 1:30. Indices et cryptos : selon le symbole.";
const FUNDEDNEXT_LEVERAGE = "Forex 1:30, matières premières (dont l'or) 1:15, indices 1:10, cryptos 1:1.";

export const PROP_FIRMS: PropFirmOffer[] = [
  {
    id: "ftmo-2step",
    firm: "FTMO",
    program: "2-Step",
    flagship: true,
    rules: {
      name: "FTMO 2-Step",
      phases: [
        { name: "Challenge", targetPercent: 10, maxDays: null },
        { name: "Vérification", targetPercent: 5, maxDays: null },
      ],
      maxDailyLossPercent: 5,
      maxTotalLossPercent: 10,
      maxLossType: "static",
      minDays: 4,
      minDaysKind: "trading",
      profitableDayPercent: 0.5,
      bestDayPercent: null,
      dayZone: "Europe/Prague",
      maxInactiveDays: null,
    },
    price: "439 € (offre du moment, prix normal 540 €)",
    priceValue: 439,
    currency: "€",
    refund: "Remboursés avec ta première récompense",
    split: "Jusqu'à 90 % des gains",
    payouts: null,
    news: FTMO_NEWS,
    newsRestriction: "funded",
    weekend: FTMO_WEEKEND,
    leverage: { forex: 100, metal: 50 },
    leverageNote: FTMO_LEVERAGE,
    extras: ["La perte du jour repart du solde à minuit, heure de Prague, positions ouvertes comprises."],
    url: "https://ftmo.com/en/2-step-challenge/",
  },
  {
    id: "fundednext-2step",
    firm: "FundedNext",
    program: "Stellar 2-Step",
    flagship: true,
    rules: {
      name: "FundedNext Stellar 2-Step",
      phases: [
        { name: "Phase 1", targetPercent: 8, maxDays: null },
        { name: "Phase 2", targetPercent: 5, maxDays: null },
      ],
      maxDailyLossPercent: 5,
      maxTotalLossPercent: 10,
      maxLossType: "static",
      minDays: 5,
      minDaysKind: "trading",
      profitableDayPercent: 0.5,
      bestDayPercent: null,
      // Server time: UTC+2, UTC+3 in summer.
      dayZone: "Europe/Athens",
      maxInactiveDays: null,
    },
    price: "549,99 $",
    priceValue: 549.99,
    currency: "$",
    refund: "Remboursés avec ta première récompense",
    split: "80 % des gains (FundedNext annonce jusqu'à 95 %)",
    payouts: "Premier paiement possible après 21 jours, puis toutes les 2 semaines",
    news: "Autorisé, pendant le challenge et sur le compte financé.",
    newsRestriction: null,
    weekend: "Autorisé, pendant le challenge et sur le compte financé.",
    leverage: { forex: 30, metal: 15, index: 10, crypto: 1 },
    leverageNote: FUNDEDNEXT_LEVERAGE,
    extras: ["15 % des objectifs du challenge versés au premier palier de croissance du compte.", "La perte du jour repart à minuit, heure du serveur (UTC+2, UTC+3 en été)."],
    url: "https://fundednext.com/cfds/stellar-2-step",
  },
  {
    id: "the5ers-highstakes",
    firm: "The5ers",
    program: "High Stakes",
    flagship: true,
    rules: {
      name: "The5ers High Stakes",
      phases: [
        { name: "Étape 1", targetPercent: 10, maxDays: null },
        { name: "Étape 2", targetPercent: 5, maxDays: null },
      ],
      maxDailyLossPercent: 4,
      maxTotalLossPercent: 8,
      maxLossType: "static",
      minDays: 3,
      minDaysKind: "profitable",
      profitableDayPercent: 0.5,
      bestDayPercent: null,
      dayZone: "Europe/Athens",
      maxInactiveDays: 30,
    },
    price: "405 $",
    priceValue: 405,
    currency: "$",
    refund: "Remboursés après l'étape 2",
    split: "80 %, jusqu'à 100 % quand le compte grandit",
    payouts: "Toutes les 2 semaines, 4 000 $ au plus par paiement, 500 $ au moins",
    news: "Garder une position pendant une annonce est permis, mais aucun ordre 2 minutes avant et après les annonces importantes, à toutes les étapes : les gains faits dans cette fenêtre sont retirés.",
    newsRestriction: "always",
    weekend: "Autorisé (swap élevé sur les indices).",
    leverage: { forex: 100 },
    leverageNote: "Jusqu'à 1:100, selon l'actif.",
    extras: [
      "3 jours gagnants par étape : des jours qui rapportent au moins 0,5 % du compte.",
      "Récompense de 40 $ après l'étape 1.",
      "Le compte grandit à chaque objectif de 10 % atteint, jusqu'à 500 000 $.",
      "Formule « New » ; la formule « Classic » vise 8 % puis 5 %, pour 455 $.",
      "Un compte sans trade pendant 30 jours expire (compté dans la simulation).",
    ],
    url: "https://the5ers.com/high-stakes/",
  },
  {
    id: "ftmo-1step",
    firm: "FTMO",
    program: "1-Step",
    flagship: false,
    rules: {
      name: "FTMO 1-Step",
      phases: [{ name: "Challenge", targetPercent: 10, maxDays: null }],
      maxDailyLossPercent: 3,
      maxTotalLossPercent: 10,
      maxLossType: "eod-trailing",
      minDays: 0,
      minDaysKind: "trading",
      profitableDayPercent: 0.5,
      bestDayPercent: 50,
      dayZone: "Europe/Prague",
      maxInactiveDays: null,
    },
    price: "399 € (offre du moment, prix normal 499 €)",
    priceValue: 399,
    currency: "€",
    refund: "Non remboursés",
    split: "90 % des gains",
    payouts: null,
    news: FTMO_NEWS,
    newsRestriction: "funded",
    weekend: FTMO_WEEKEND,
    leverage: { forex: 100, metal: 50 },
    leverageNote: FTMO_LEVERAGE,
    extras: [
      "La perte max de 10 % suit le plus haut solde de fin de journée et ne redescend jamais.",
      "Ton meilleur jour ne doit pas dépasser 50 % du gain total.",
    ],
    url: "https://ftmo.com/en/1-step-challenge/",
  },
  {
    id: "fundednext-1step",
    firm: "FundedNext",
    program: "Stellar 1-Step",
    flagship: false,
    rules: {
      name: "FundedNext Stellar 1-Step",
      phases: [{ name: "Challenge", targetPercent: 10, maxDays: null }],
      maxDailyLossPercent: 3,
      maxTotalLossPercent: 6,
      maxLossType: "static",
      minDays: 2,
      minDaysKind: "trading",
      profitableDayPercent: 0.5,
      bestDayPercent: null,
      dayZone: "Europe/Athens",
      maxInactiveDays: null,
    },
    price: "569,99 $",
    priceValue: 569.99,
    currency: "$",
    refund: "Remboursés avec ta 3e récompense",
    split: "Jusqu'à 95 % des gains",
    payouts: "Tous les 5 jours ouvrés",
    news: "Autorisé, pendant le challenge et sur le compte financé.",
    newsRestriction: null,
    weekend: "Autorisé, pendant le challenge et sur le compte financé.",
    leverage: { forex: 30, metal: 15, index: 10, crypto: 1 },
    leverageNote: FUNDEDNEXT_LEVERAGE,
    extras: ["15 % de l'objectif du challenge versés au premier palier de croissance du compte."],
    url: "https://fundednext.com/cfds/stellar-1-step",
  },
];
