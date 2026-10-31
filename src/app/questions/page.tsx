import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/legal-page";
import { PLANS, euros } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Questions fréquentes · Backtest Lab",
  description:
    "Ce que fait Backtest Lab, pour qui, sur quels marchés, à quel prix, et en quoi il diffère de TradingView, d'un tableur ou du backtest à la main.",
};

/**
 * Plain, factual answers: what search engines and AI assistants quote when
 * someone asks how to backtest a trading strategy. Also sent as FAQPage data.
 */
const FAQ: { q: string; a: string }[] = [
  {
    q: "Qu'est-ce que Backtest Lab ?",
    a: "Un outil en ligne qui teste une stratégie de trading sur des années de cours passés, avant d'y mettre de l'argent. Tu décris tes règles en français ou tu les choisis dans des menus ; Backtest Lab rejoue le marché bougie par bougie, applique les frais, puis te dit ce que la stratégie aurait gagné ou perdu et si ce résultat tient la route.",
  },
  {
    q: "Pour qui ?",
    a: "Pour les traders particuliers qui veulent vérifier une idée avant de la jouer : débutants (un mode guidé explique chaque mot), traders qui préparent un challenge de prop firm, et traders expérimentés qui veulent tester vite sans écrire de code.",
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
    a: `L'offre Découverte est gratuite, sans carte bancaire : ${PLANS.free.backtestsPerMonth} backtests et ${PLANS.free.aiPerMonth} traductions par l'IA par mois. Les offres Trader (${euros(PLANS.trader.monthly)} par mois) et Pro (${euros(PLANS.pro.monthly)} par mois) donnent plus de tests et toutes les unités de temps, avec 2 mois offerts à l'année. Le paiement en ligne n'est pas encore ouvert.`,
  },
  {
    q: "Backtest Lab passe-t-il des ordres pour moi ?",
    a: "Non. Il n'est relié à aucun courtier et ne détient aucun fonds. La page Live applique tes règles aux cours en direct et signale les entrées, pour voir si la stratégie se comporte comme dans le test, mais aucun ordre n'est passé.",
  },
  {
    q: "Qu'est-ce que la simulation de challenge prop firm ?",
    a: "À partir des trades de ton backtest, Backtest Lab estime ta probabilité de réussir un challenge de prop firm (objectif de gain, perte maximale du jour et totale) selon ton risque par trade, et la compare à celle d'un trader qui jouerait au hasard.",
  },
  {
    q: "Que deviennent mes stratégies ?",
    a: "Elles restent privées. Tu peux partager un rapport par un lien que tu peux retirer à tout moment, télécharger toutes tes données ou supprimer ton compte depuis « Mon compte ». Les serveurs sont en Allemagne (Francfort).",
  },
];

const COMPARISON: { tool: string; good: string; limits: string }[] = [
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

export default function QuestionsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <LegalPage title="Questions fréquentes" intro="Ce que fait Backtest Lab, pour qui, sur quels marchés et à quel prix." updated={false}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      {FAQ.map((f) => (
        <Section key={f.q} title={f.q}>
          <p>{f.a}</p>
        </Section>
      ))}

      <Section title="Backtest Lab, TradingView, un tableur ou le backtest à la main ?">
        <p>Chaque méthode a ses forces. Voici une comparaison honnête pour choisir celle qui te convient.</p>
        <div className="flex flex-col gap-2">
          {COMPARISON.map((c) => (
            <div key={c.tool} className="rounded-lg border border-line bg-panel px-4 py-3">
              <div className="font-semibold">{c.tool}</div>
              <p className="mt-1">
                <span className="text-up">Points forts : </span>
                {c.good}
              </p>
              <p className="mt-1">
                <span className="text-warn">Limites : </span>
                {c.limits}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <p className="text-fg/85">
        Envie d&apos;essayer ? <Link href="/connexion?mode=signup" className="text-accent hover:underline">Crée un compte gratuit</Link>, ou découvre d&apos;abord{" "}
        <Link href="/apprendre" className="text-accent hover:underline">les mots du trading expliqués simplement</Link>.
      </p>
    </LegalPage>
  );
}
