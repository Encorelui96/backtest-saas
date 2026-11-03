import type { Metadata } from "next";
import { Link } from "@/lib/client/i18n";
import { LegalPage, Section } from "@/components/legal-page";
import { PLANS, euros } from "@/lib/plans";
import { pageLang } from "@/lib/i18n/page";
import type { Lang } from "@/lib/i18n";

export async function generateMetadata({ params }: PageProps<"/[lang]/questions">): Promise<Metadata> {
  const { t } = await pageLang(params);
  return {
    title: t("Questions fréquentes · Backtest Lab"),
    description: t("Ce que fait Backtest Lab, pour qui, sur quels marchés, à quel prix, et en quoi il diffère de TradingView, d'un tableur ou du backtest à la main."),
  };
}

/**
 * Plain, factual answers: what search engines and AI assistants quote when
 * someone asks how to backtest a trading strategy. Also sent as FAQPage data.
 */
const FAQ_FR: { q: string; a: string }[] = [
  {
    q: "Qu'est-ce que Backtest Lab ?",
    a: "Un outil en ligne pour estimer tes chances de réussir un challenge de prop firm avant de le payer, et plus largement pour tester une stratégie de trading sur des années de cours passés. Tu décris tes règles en français ou tu les choisis dans des menus ; Backtest Lab rejoue le marché bougie par bougie, applique les frais, puis te dit ce que la stratégie aurait gagné ou perdu et si ce résultat tient la route.",
  },
  {
    q: "Pour qui ?",
    a: "Pour les traders particuliers qui préparent un challenge de prop firm et veulent estimer leurs chances avant de payer, pour les débutants (un mode guidé explique chaque mot), et pour les traders expérimentés qui veulent tester vite sans écrire de code.",
  },
  {
    q: "Sur quels marchés ?",
    a: "Les cryptos du marché spot de Binance (bitcoin, ether, solana et les autres paires en USDT), 9 paires de forex (EUR/USD, GBP/USD, USD/JPY…), l'or (XAU/USD) et le Nasdaq 100 (contrat future NQ, presque 24 h/24, ou le fonds QQQ). Unités de temps de 1 minute à 1 jour.",
  },
  {
    q: "Faut-il savoir coder ?",
    a: "Non. Tu écris ta stratégie en français (« acheter quand le RSI 14 passe sous 30 et que le prix est au-dessus de la moyenne 200 ») et une IA la traduit en règles que tu peux relire et corriger. Tu peux aussi tout construire avec des menus, sans IA.",
  },
  {
    q: "Les résultats sont-ils fiables ?",
    a: "Le moteur évite les pièges classiques : les signaux sont lus à la clôture d'une bougie et exécutés à l'ouverture de la suivante, sans regarder le futur ; frais, spread et glissement sont comptés. Ensuite, quatre contrôles de robustesse disent si le gain peut venir du hasard : comparaison avec des trades pris au hasard, tenue sur les 30 % les plus récents de la période, réglages voisins et frais doublés, plus des milliers de tirages aléatoires des trades pour voir la fourchette des résultats possibles. Un backtest reste une simulation sur le passé : il ne promet aucun gain futur.",
  },
  {
    q: "Combien ça coûte ?",
    a: `L'offre Découverte est gratuite, sans carte bancaire : ${PLANS.free.backtestsPerMonth} backtests et ${PLANS.free.aiPerMonth} traductions par l'IA par mois, à partir de l'unité 15 minutes, sur les 12 derniers mois. Les offres Trader (${euros(PLANS.trader.monthly)} par mois) et Pro (${euros(PLANS.pro.monthly)} par mois) donnent plus de tests, toutes les unités de temps, tout l'historique, le détail de la robustesse, le comparatif des prop firms et le suivi Live, avec 2 mois offerts à l'année. Le paiement en ligne n'est pas encore ouvert.`,
  },
  {
    q: "Backtest Lab passe-t-il des ordres pour moi ?",
    a: "Non. Il n'est relié à aucun courtier et ne détient aucun fonds. La page Live applique tes règles aux cours en direct et signale les entrées, pour voir si la stratégie se comporte comme dans le test, mais aucun ordre n'est passé.",
  },
  {
    q: "Qu'est-ce que la simulation de challenge prop firm ?",
    a: "À partir des trades de ton backtest, Backtest Lab estime ta probabilité de réussir un challenge de prop firm (objectif de gain, perte maximale du jour et totale) selon ton risque par trade, et la compare à celle d'un trader qui jouerait au hasard. Les challenges de FTMO, FundedNext et The5ers sont rejoués avec leurs règles officielles, avec le nombre d'essais et les frais à prévoir.",
  },
  {
    q: "Est-ce que ça garantit de réussir un challenge ?",
    a: "Non. L'estimation repose sur des données passées et sur les règles relevées à une date donnée, qui peuvent changer. Elle aide à décider, mais le passé ne garantit rien, et Backtest Lab n'a aucun lien avec ces prop firms.",
  },
  {
    q: "Que deviennent mes stratégies ?",
    a: "Elles restent privées. Tu peux partager un rapport par un lien que tu peux retirer à tout moment, télécharger toutes tes données ou supprimer ton compte depuis « Mon compte ». Les serveurs sont en Allemagne (Francfort).",
  },
];

const COMPARISON_FR: { tool: string; good: string; limits: string }[] = [
  {
    tool: "Backtest Lab",
    good: "Règles en français ou par menus, sans coder. Frais et glissement compris. Contrôles de robustesse et simulation de challenge prop firm. Mode guidé pour débuter.",
    limits: "Moins d'indicateurs et de marchés que TradingView. Pas de trading réel depuis l'outil.",
  },
  {
    tool: "TradingView",
    good: "Énorme choix de marchés, de graphiques et d'indicateurs. Testeur de stratégie intégré et grande communauté de scripts.",
    limits: "Les stratégies s'écrivent en Pine Script, son langage de programmation, ou viennent de scripts d'autres utilisateurs qu'il faut comprendre et vérifier.",
  },
  {
    tool: "Backtest à la main",
    good: "Rejouer le graphique bougie par bougie entraîne l'œil et fait comprendre son setup.",
    limits: "Lent, sujet aux biais (on « voit » ce qu'on attend) et limité à quelques dizaines de trades : trop peu pour conclure.",
  },
  {
    tool: "Tableur (Excel, Sheets)",
    good: "Totalement souple, on contrôle chaque calcul.",
    limits: "Il faut importer les cours, écrire les formules et éviter soi-même les erreurs : regarder la bougie suivante, oublier les frais ou le glissement.",
  },
];

const FAQ_EN: { q: string; a: string }[] = [
  {
    q: "What is Backtest Lab?",
    a: "An online tool to estimate your chances of passing a prop firm challenge before you pay for it, and more broadly to test a trading strategy on years of past prices. You describe your rules in plain words or pick them from menus; Backtest Lab replays the market candle by candle, applies the fees, then tells you what the strategy would have made or lost and whether that result holds up.",
  },
  {
    q: "Who is it for?",
    a: "For retail traders preparing a prop firm challenge who want to estimate their chances before paying, for beginners (a guided mode explains every term), and for experienced traders who want to test quickly without writing code.",
  },
  {
    q: "Which markets?",
    a: "Crypto on the Binance spot market (bitcoin, ether, solana and the other USDT pairs), 9 forex pairs (EUR/USD, GBP/USD, USD/JPY…), gold (XAU/USD) and the Nasdaq 100 (the NQ future, nearly 24 hours a day, or the QQQ fund). Timeframes from 1 minute to 1 day.",
  },
  {
    q: "Do I need to code?",
    a: "No. You write your strategy in plain words (“buy when the 14 RSI drops below 30 and the price is above the 200 moving average”) and an AI turns it into rules you can read and correct. You can also build everything with menus, without the AI.",
  },
  {
    q: "Are the results reliable?",
    a: "The engine avoids the classic traps: signals are read at the close of a candle and executed at the open of the next one, without peeking into the future; fees, spread and slippage are counted. Then four robustness checks tell you whether the gain could come from luck: a comparison with randomly taken trades, how it holds on the most recent 30% of the period, nearby settings and doubled fees, plus thousands of random reshuffles of the trades to show the range of possible results. A backtest is still a simulation on the past: it promises no future gains.",
  },
  {
    q: "How much does it cost?",
    a: `The Starter plan is free, no credit card: ${PLANS.free.backtestsPerMonth} backtests and ${PLANS.free.aiPerMonth} AI translations a month, from the 15-minute timeframe, on the last 12 months. The Trader (${euros(PLANS.trader.monthly, "en")} a month) and Pro (${euros(PLANS.pro.monthly, "en")} a month) plans give more tests, every timeframe, the full history, the robustness detail, the prop firm comparison and Live tracking, with 2 months free when paid yearly. Online payment isn't open yet.`,
  },
  {
    q: "Does Backtest Lab place orders for me?",
    a: "No. It isn't connected to any broker and holds no funds. The Live page applies your rules to live prices and flags the entries, so you can see whether the strategy behaves as in the test, but no order is placed.",
  },
  {
    q: "What is the prop firm challenge simulation?",
    a: "From the trades of your backtest, Backtest Lab estimates your probability of passing a prop firm challenge (profit target, daily and overall max loss) depending on your risk per trade, and compares it with a trader who would trade at random. The FTMO, FundedNext and The5ers challenges are replayed with their official rules, with the number of attempts and the fees to expect.",
  },
  {
    q: "Does it guarantee passing a challenge?",
    a: "No. The estimate rests on past data and on rules read on a given date, which can change. It helps you decide, but the past guarantees nothing, and Backtest Lab has no tie with these prop firms.",
  },
  {
    q: "What happens to my strategies?",
    a: "They stay private. You can share a report through a link you can withdraw at any time, download all your data or delete your account from “My account”. The servers are in Germany (Frankfurt).",
  },
];

const COMPARISON_EN: { tool: string; good: string; limits: string }[] = [
  {
    tool: "Backtest Lab",
    good: "Rules in plain words or from menus, no coding. Fees and slippage included. Robustness checks and prop firm challenge simulation. Guided mode for beginners.",
    limits: "Fewer indicators and markets than TradingView. No live trading from the tool.",
  },
  {
    tool: "TradingView",
    good: "A huge choice of markets, charts and indicators. Built-in strategy tester and a large community of scripts.",
    limits: "Strategies are written in Pine Script, its programming language, or come from other users' scripts that you have to understand and check.",
  },
  {
    tool: "Manual backtesting",
    good: "Replaying the chart candle by candle trains the eye and helps you understand your setup.",
    limits: "Slow, prone to bias (you “see” what you expect) and limited to a few dozen trades: too few to conclude.",
  },
  {
    tool: "Spreadsheet (Excel, Sheets)",
    good: "Completely flexible, you control every calculation.",
    limits: "You have to import the prices, write the formulas and avoid the mistakes yourself: looking at the next candle, forgetting fees or slippage.",
  },
];

const CONTENT: Record<Lang, { faq: typeof FAQ_FR; comparison: typeof COMPARISON_FR }> = {
  fr: { faq: FAQ_FR, comparison: COMPARISON_FR },
  en: { faq: FAQ_EN, comparison: COMPARISON_EN },
};

export default async function QuestionsPage({ params }: PageProps<"/[lang]/questions">) {
  const { lang, t } = await pageLang(params);
  const { faq: FAQ, comparison: COMPARISON } = CONTENT[lang];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <LegalPage lang={lang} title={t("Questions fréquentes")} intro={t("Ce que fait Backtest Lab, pour qui, sur quels marchés et à quel prix.")} updated={false}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {FAQ.map((f) => (
        <Section key={f.q} title={f.q}>
          <p>{f.a}</p>
        </Section>
      ))}

      <Section title={t("Backtest Lab, TradingView, un tableur ou le backtest à la main ?")}>
        <p>{t("Chaque méthode a ses forces. Voici une comparaison honnête pour choisir celle qui te convient.")}</p>
        <div className="flex flex-col gap-2">
          {COMPARISON.map((c) => (
            <div key={c.tool} className="rounded-lg border border-line bg-panel px-4 py-3">
              <div className="font-semibold">{c.tool}</div>
              <p className="mt-1">
                <span className="text-up">{t("Points forts : ")}</span>
                {c.good}
              </p>
              <p className="mt-1">
                <span className="text-warn">{t("Limites : ")}</span>
                {c.limits}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <p className="text-fg/85">
        {t("Envie d'essayer ? ")}
        <Link href="/connexion?mode=signup" className="text-accent hover:underline">
          {t("Crée un compte gratuit")}
        </Link>
        {t(", ou découvre d'abord ")}
        <Link href="/apprendre" className="text-accent hover:underline">
          {t("les mots du trading expliqués simplement")}
        </Link>
        .
      </p>
    </LegalPage>
  );
}
