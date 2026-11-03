import type { Metadata } from "next";
import { Link } from "@/lib/client/i18n";
import { Pricing } from "@/components/pricing";
import { PLANS, euros } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Tarifs · Backtest Lab",
  description: `Backtest Lab est gratuit pour découvrir (${PLANS.free.backtestsPerMonth} backtests par mois). Offres Trader à ${euros(PLANS.trader.monthly)} et Pro à ${euros(PLANS.pro.monthly)} par mois, 2 mois offerts à l'année.`,
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "Qu'est-ce qu'un backtest compte ?",
    a: "Chaque test lancé et terminé compte pour un. Un test qui échoue ne compte pas. Rouvrir un rapport déjà calculé est gratuit et illimité.",
  },
  {
    q: "Que se passe-t-il quand j'atteins la limite du mois ?",
    a: "Tu ne peux plus lancer de nouveau test jusqu'au 1er du mois suivant, mais tout le reste reste accessible : tes stratégies, tes rapports, la page Live et le constructeur de règles sans IA.",
  },
  {
    q: "Pourquoi les traductions par l'IA sont-elles limitées ?",
    a: "Chaque traduction d'une idée en règles est calculée par un modèle d'IA et coûte quelque chose à chaque fois. Une limite par offre garde les prix bas pour tout le monde. Le constructeur de règles manuel, lui, est illimité.",
  },
  {
    q: "Les prix sont-ils TTC ? Y a-t-il un engagement ?",
    a: "Les prix affichés sont TTC. Au mois, tu pourras arrêter quand tu veux. À l'année, tu paies 10 mois au lieu de 12.",
  },
  {
    q: "Backtest Lab me dit-il quoi acheter ou vendre ?",
    a: "Non. C'est un outil de simulation sur des données passées : il ne donne aucun conseil en investissement et ne promet aucun gain futur.",
  },
];

export default function TarifsPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 pb-6">
      <header className="text-center">
        <h1 className="text-2xl font-semibold sm:text-3xl">Des tarifs simples</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted sm:text-base">
          Commence gratuitement. Passe à une offre payante le jour où tu testes plus d&apos;idées, ou en unités de temps courtes.
        </p>
      </header>
      <Pricing />
      <section className="mx-auto w-full max-w-3xl">
        <h2 className="mb-3 text-lg font-semibold">Questions fréquentes</h2>
        <div className="flex flex-col gap-2">
          {FAQ.map((f) => (
            <details key={f.q} className="rounded-lg border border-line bg-panel px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">{f.q}</summary>
              <p className="mt-2 text-sm text-muted">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          Voir aussi les <Link href="/conditions" className="underline hover:text-fg">conditions d&apos;utilisation</Link>.
        </p>
      </section>
    </div>
  );
}
