import type { Metadata } from "next";
import { Link } from "@/lib/client/i18n";
import { Pricing } from "@/components/pricing";
import { PLANS, euros } from "@/lib/plans";
import { pageLang } from "@/lib/i18n/page";

export async function generateMetadata({ params }: PageProps<"/[lang]/tarifs">): Promise<Metadata> {
  const { lang, t } = await pageLang(params);
  return {
    title: t("Tarifs · Backtest Lab"),
    description: t("Estime tes chances sur un challenge prop firm gratuitement ({0} backtests par mois). Offres Trader à {1} et Pro à {2} par mois, 2 mois offerts à l'année.", [
      PLANS.free.backtestsPerMonth,
      euros(PLANS.trader.monthly, lang),
      euros(PLANS.pro.monthly, lang),
    ]),
  };
}

const FAQ: { q: string; a: string }[] = [
  {
    q: "Le challenge prop firm est-il inclus dans l'offre gratuite ?",
    a: "Oui. Après un backtest, l'onglet Challenge prop firm estime tes chances sur l'historique, avec les essais et les frais à prévoir. C'est une estimation sur le passé, pas une garantie de réussite.",
  },
  {
    q: "Qu'est-ce qu'un backtest compte ?",
    a: "Chaque test lancé et terminé compte pour un. Un test qui échoue ne compte pas. Rouvrir un rapport déjà calculé est gratuit et illimité.",
  },
  {
    q: "Que se passe-t-il quand j'atteins la limite du mois ?",
    a: "Tu peux prendre une recharge, qui ajoute des backtests ou des traductions par l'IA tout de suite, ou attendre le 1er du mois suivant. Tout le reste reste accessible : tes stratégies, tes rapports, la page Live et le constructeur de règles sans IA.",
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

export default async function TarifsPage({ params }: PageProps<"/[lang]/tarifs">) {
  const { t } = await pageLang(params);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 pb-6">
      <header className="text-center">
        <h1 className="text-2xl font-semibold sm:text-3xl">{t("Des tarifs simples")}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted sm:text-base">
          {t("Commence gratuitement et estime tes chances sur un challenge prop firm. Passe à une offre payante le jour où tu testes plus d'idées, ou en unités de temps courtes.")}
        </p>
      </header>
      <Pricing />
      <section className="mx-auto w-full max-w-3xl">
        <h2 className="mb-3 text-lg font-semibold">{t("Questions fréquentes")}</h2>
        <div className="flex flex-col gap-2">
          {FAQ.map((f) => (
            <details key={f.q} className="rounded-lg border border-line bg-panel px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">{t(f.q)}</summary>
              <p className="mt-2 text-sm text-muted">{t(f.a)}</p>
            </details>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          {t("Voir aussi les ")}
          <Link href="/conditions" className="underline hover:text-fg">
            {t("conditions d'utilisation")}
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
