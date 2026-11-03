import type { Metadata } from "next";
import { Link } from "@/lib/client/i18n";
import { GLOSSARY_CATEGORIES, glossaryIn } from "@/lib/learn/glossary";
import { pageLang } from "@/lib/i18n/page";
import { LevelToggle } from "@/components/learn";
import { Card } from "@/components/ui";

export async function generateMetadata({ params }: PageProps<"/[lang]/apprendre">): Promise<Metadata> {
  const { t } = await pageLang(params);
  return {
    title: t("Apprendre · Backtest Lab"),
    description: t("Les mots du trading expliqués simplement, et comment faire ton premier backtest pas à pas."),
  };
}

const STEPS: { title: string; text: string }[] = [
  {
    title: "Choisis une idée simple",
    text: "Dans « Nouvelle stratégie », clique sur le modèle « Swing · Rebond RSI(2) en tendance haussière ». Il achète le bitcoin quand il vient de baisser fort, mais seulement si la tendance de fond monte.",
  },
  {
    title: "Lis les règles",
    text: "Dans la partie 3, chaque ligne est une condition. En mode Débutant, clique sur les mots soulignés ou sur les « ? » pour comprendre chaque indicateur.",
  },
  {
    title: "Garde un stop et un risque de 1 %",
    text: "Partie 4 : le stop coupe la perte si le trade tourne mal, le risque par trade limite la perte à 1 % du capital. Ne touche pas au reste pour l'instant.",
  },
  {
    title: "Choisis la période et les frais",
    text: "Partie 5 : teste sur plusieurs années et choisis le profil de frais de ta plateforme. Un test sans frais est toujours trop optimiste.",
  },
  {
    title: "Lance le backtest",
    text: "Le calcul prend de quelques secondes à une minute. Le rapport s'ouvre tout seul.",
  },
  {
    title: "Lis la lecture guidée, puis l'onglet Robustesse",
    text: "La lecture guidée traduit les chiffres en phrases. L'onglet Robustesse dit si le résultat tient ou s'il vient du hasard. Ensuite, change une seule chose à la fois et relance.",
  },
];

const MISTAKES: { title: string; text: string }[] = [
  { title: "Croire un test avec peu de trades", text: "Sous 30 trades, un bon résultat peut être de la pure chance." },
  { title: "Régler jusqu'à la perfection", text: "Changer les réglages jusqu'à ce que le passé soit parfait crée une stratégie qui échoue ensuite. Regarde les « réglages voisins »." },
  { title: "Oublier les frais", text: "En scalp surtout, les frais et le spread mangent souvent tout le gain. Garde toujours un profil de frais réaliste." },
  { title: "Regarder seulement le taux de gagnants", text: "90 % de trades gagnants ne sert à rien si une seule perte efface dix gains. Regarde le profit factor et le gain moyen." },
  { title: "Ignorer la baisse max", text: "Une stratégie qui gagne +200 % mais passe par −60 % sera abandonnée bien avant la fin. Demande-toi ce que tu aurais supporté." },
  { title: "Passer en réel trop vite", text: "Suis d'abord la stratégie en direct quelques semaines avec « Suivre en direct », puis commence petit." },
];

export default async function LearnPage({ params }: PageProps<"/[lang]/apprendre">) {
  const { lang, t } = await pageLang(params);
  const entries = glossaryIn(lang);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-24 md:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("Apprendre")}</h1>
          <p className="mt-1 text-sm text-muted">{t("Les mots du trading expliqués simplement, et comment bien utiliser Backtest Lab.")}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <LevelToggle />
          <span className="text-[11px] text-muted">{t("Débutant : aides et explications partout")}</span>
        </div>
      </div>

      <Card title={t("Ton premier backtest en 6 étapes")}>
        <ol className="flex flex-col gap-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">{i + 1}</span>
              <div>
                <div className="text-sm font-semibold">{t(s.title)}</div>
                <p className="text-sm text-muted">{t(s.text)}</p>
              </div>
            </li>
          ))}
        </ol>
        <Link href="/strategies/new" className="mt-4 inline-block rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:brightness-110">
          {t("Faire mon premier backtest")}
        </Link>
      </Card>

      <Card title={t("Les 6 erreurs de débutant")}>
        <ul className="grid gap-3 sm:grid-cols-2">
          {MISTAKES.map((m) => (
            <li key={m.title} className="rounded-md border border-line bg-panel-2/60 p-2.5">
              <div className="text-sm font-semibold text-warn">{t(m.title)}</div>
              <p className="mt-0.5 text-sm text-muted">{t(m.text)}</p>
            </li>
          ))}
        </ul>
      </Card>

      <div>
        <h2 className="text-lg font-semibold">{t("Glossaire")}</h2>
        <nav className="no-scrollbar -mx-3 mt-2 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:px-0">
          {GLOSSARY_CATEGORIES.map((c) => (
            <a key={c.id} href={`#cat-${c.id}`} className="shrink-0 rounded-full border border-line px-2.5 py-0.5 text-xs text-muted hover:border-accent hover:text-fg">
              {t(c.label)}
            </a>
          ))}
        </nav>
      </div>

      {GLOSSARY_CATEGORIES.map((c) => (
        <Card key={c.id} title={t(c.label)}>
          <span id={`cat-${c.id}`} className="block scroll-mt-20" />
          <dl className="flex flex-col divide-y divide-line/50">
            {entries.filter((e) => e.category === c.id).map((e) => (
              <div key={e.id} id={e.id} className="scroll-mt-20 py-2.5 first:pt-0 last:pb-0 target:bg-accent/5">
                <dt className="text-sm font-semibold">{e.term}</dt>
                <dd className="mt-0.5 text-sm text-fg/85">{e.short}</dd>
                {e.long && <dd className="mt-1 text-sm text-muted">{e.long}</dd>}
                {e.example && <dd className="mt-1 text-xs text-accent/90">{t("Exemple : {0}", [e.example])}</dd>}
              </div>
            ))}
          </dl>
        </Card>
      ))}
    </div>
  );
}
