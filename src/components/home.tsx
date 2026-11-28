"use client";

import { useEffect, useState } from "react";
import { Link, useT } from "@/lib/client/i18n";
import { PLANS, euros } from "@/lib/plans";
import { date, num, pct } from "@/lib/client/format";
import { PROP_FIRMS_CHECKED } from "@/lib/prop-firms";
import { PERIOD_TRAP as T, SHOWCASE as S } from "@/lib/showcase";
import { api } from "@/lib/client/api";
import { authClient } from "@/lib/client/auth-client";
import { setSignedInHint } from "@/lib/signed-in-hint";
import { CandleHero } from "./candle-hero";
import { Dashboard } from "./dashboard";

const POINTS = [
  { title: "Un test honnête", text: "Frais, spread, glissement et gaps compris, sans regarder le futur, de la minute au journalier." },
  { title: "Robustesse en 4 contrôles", text: "Hasard ou vrai avantage ? Tenue dans le temps, réglages voisins, frais doublés." },
  { title: "Décris ta stratégie en français", text: "L'IA la traduit en règles précises, liste ses choix et te pose des questions quand c'est flou." },
  { title: "Ton journal de trading", text: "Note tes trades en R, importe ton historique MT4 ou MT5 et vois ce que te coûtent tes erreurs." },
  { title: "Suivi en direct", text: "Suis tes stratégies sur le marché du moment et reçois une alerte Telegram quand elles donnent un signal." },
  { title: "Pensé pour débuter", text: "Mode Débutant, chaque chiffre expliqué et des leçons pour apprendre les bases du backtest." },
];

const STEPS = [
  { title: "Décris ta stratégie", text: "En français, ou en partant d'un modèle prêt à l'emploi." },
  { title: "Lance le test", text: "Sur des années de cours, frais compris, en quelques secondes." },
  { title: "Lis le verdict", text: "Rendement, baisse max, robustesse et chances en challenge, expliqués simplement." },
];

/** The everyday button: sign up, then straight to a new strategy. */
const SIGNUP = `/connexion?mode=signup&next=${encodeURIComponent("/strategies/new")}`;

/** The main button: sign up, build a strategy, and land on the challenge tab of its report. */
const CHALLENGE_SIGNUP = `/connexion?mode=signup&next=${encodeURIComponent("/strategies/new?goal=prop")}`;

/** Visitors see a real report before signing up, when the admin has picked one as the example. */
function ExampleLink() {
  const tl = useT();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    api<{ id: string | null }>("/api/example")
      .then((r) => setId(r.id))
      .catch(() => {});
  }, []);
  if (!id) return null;
  return (
    <Link href={`/r/${id}`} className="text-sm text-accent hover:underline">
      {tl("Voir un exemple de rapport, sans créer de compte →")}</Link>
  );
}

/** A real result with its weaknesses: a winning strategy can still be an expensive challenge. */
function Showcase() {
  const tl = useT();
  const stats = [
    { label: tl("Rendement sur 5 ans"), value: pct(S.returnPercent), hint: tl("Acheter et garder : {0}", [pct(S.buyAndHoldPercent)]) },
    { label: tl("Baisse max"), value: pct(-S.maxDrawdownPercent), hint: tl("{0} trades", [S.trades]) },
    { label: tl("Robustesse"), value: tl("Fragile"), hint: tl("{0} contrôles sur 4", [S.checksPassed]) },
    { label: tl("Chances sur {0}", [S.challenge.firm]), value: pct(S.challenge.passPercent, 0, false), hint: tl("≈ {0} essais, {1} de frais", [num(S.challenge.attempts, 1), euros(S.challenge.feesEuros)]) },
  ];
  return (
    <div className="mt-4 rounded-lg border border-line p-4">
      <h3 className="font-semibold">{tl("Un exemple réel, sans filtre")}</h3>
      {/* The page is prerendered: browsers can write dates and numbers slightly differently from the server. */}
      <p className="mt-1 text-sm text-muted" suppressHydrationWarning>
        {tl(S.strategy)} · {S.market} · {S.interval} · {date(S.from, false)} → {date(S.to, false)}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-md border border-line px-3 py-2">
            <div className="text-xs text-muted">{s.label}</div>
            <div className="num text-lg font-semibold" suppressHydrationWarning>
              {s.value}
            </div>
            <div className="text-xs text-muted" suppressHydrationWarning>
              {s.hint}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm">{tl("Gagnante sur 5 ans, et pourtant un challenge resterait un pari coûteux. Mieux vaut le savoir avant de payer.")}</p>
      <p className="mt-2 text-[11px] text-muted">
        {tl("Résultats simulés sur des données passées, frais compris, à 1 % de risque par trade : ils ne promettent aucun gain futur. Seule stratégie sur {0} à passer nos critères, ce qui peut tenir en partie au hasard : les mêmes règles perdent sur d'autres marchés. Règles et prix du challenge relevés le {1}.", [S.tested, tl(PROP_FIRMS_CHECKED)])}</p>
    </div>
  );
}

/** One strategy, the same rules and costs: a win over 2 years, a heavy loss over 6. Why tests need many years. */
function PeriodTrap() {
  const tl = useT();
  const sides = [
    { label: tl("Sur 2 ans"), r: T.short, tone: "text-up border-up/40 bg-up/10" },
    { label: tl("Sur 6 ans"), r: T.long, tone: "text-down border-down/40 bg-down/10" },
  ];
  return (
    <section className="rounded-lg border border-line bg-panel p-4 sm:p-5">
      <h2 className="text-lg font-semibold">{tl("Pourquoi tester sur des années")}</h2>
      <p className="mt-1 text-sm text-muted">
        {tl("Même stratégie, mêmes règles, mêmes frais : {0}, {1}, {2}. Seule la date de départ change.", [tl(T.strategy), T.market, T.interval])}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {sides.map((s) => (
          <div key={s.label} className={`rounded-md border px-3 py-3 ${s.tone}`}>
            <div className="text-xs text-muted">{s.label}</div>
            <div className="num text-2xl font-semibold sm:text-3xl" suppressHydrationWarning>
              {pct(s.r.returnPercent)}
            </div>
            <div className="text-xs text-muted" suppressHydrationWarning>
              {tl("{0} trades, baisse max {1}", [num(s.r.trades, 0), pct(-s.r.maxDrawdownPercent)])}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm">
        {tl("Sur les 2 dernières années, elle gagne. Sur 6 ans, elle perd plus de la moitié du capital : {0} années sur 6 dans le rouge. Backtest Lab te le montre avant que ton argent le découvre.", [T.losingYears])}</p>
      <p className="mt-2 text-[11px] text-muted" suppressHydrationWarning>
        {tl("Résultats simulés sur des données passées, du {0} et du {1} au {2}, frais, spread et glissement compris, à 1 % de risque par trade : ils ne promettent aucun gain futur.", [date(T.short.from, false), date(T.long.from, false), date(T.long.to, false)])}</p>
    </section>
  );
}

/** The dashboard for signed-in users, a short presentation for visitors. */
export function Home() {
  const tl = useT();
  const { data: session, isPending } = authClient.useSession();
  useEffect(() => {
    if (!isPending) setSignedInHint(Boolean(session));
  }, [isPending, session]);
  if (session) return <Dashboard />;
  // Visitors get the page without waiting for the session; it's also what search engines read.
  return (
    <>
      {isPending && <p className="signed-in-only text-muted">{tl("Chargement…")}</p>}
      <div className={isPending ? "signed-out-only" : undefined}>
        <Landing />
      </div>
    </>
  );
}

function Landing() {
  const tl = useT();
  const free = tl("{0} backtests par mois offerts, sans carte bancaire.", [PLANS.free.backtestsPerMonth]);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 pb-6 sm:gap-10 sm:pb-12">
      {/* Phones: the chart runs edge to edge; larger screens: a rounded panel. */}
      <section className="relative -mx-3 h-[500px] overflow-hidden border-y border-line bg-panel/40 sm:mx-0 sm:rounded-2xl sm:border">
        <CandleHero className="absolute inset-0" />
        {/* Veils the middle and the bottom with the page colour so the text stays readable over the candles. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--bg)_85%,transparent)_0%,color-mix(in_srgb,var(--bg)_55%,transparent)_45%,transparent_75%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg to-transparent" />
        <div className="relative flex h-full flex-col items-center justify-center px-5 text-center">
          <h1 className="text-3xl font-semibold leading-tight drop-shadow sm:text-5xl">
            {tl("Teste ta stratégie")}<br />
            <span className="text-accent">{tl("avant d'y mettre un euro")}</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-fg/80 sm:text-base">
            {tl("Écris tes règles en français. Backtest Lab les rejoue sur des années de cours, crypto, forex, or ou Nasdaq, frais compris, et te dit si le résultat tient la route.")}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href={SIGNUP} className="rounded-md bg-accent px-5 py-2.5 font-medium text-white shadow-lg shadow-accent/30 hover:brightness-110">
              {tl("Commencer gratuitement")}</Link>
            <Link href="/apprendre" className="rounded-md border border-line bg-panel/70 px-5 py-2.5 font-medium text-fg backdrop-blur hover:border-accent">
              {tl("Apprendre les bases")}</Link>
          </div>
          <p className="mt-3 text-xs text-muted">{free}</p>
          <div className="mt-2">
            <ExampleLink />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-center text-lg font-semibold">{tl("Comment ça marche")}</h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-lg border border-line bg-panel p-4">
              <span className="num flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">{i + 1}</span>
              <h3 className="mt-2 font-semibold">{tl(s.title)}</h3>
              <p className="mt-1 text-sm text-muted">{tl(s.text)}</p>
            </li>
          ))}
        </ol>
      </section>

      <PeriodTrap />

      <section className="rounded-lg border border-line bg-panel p-4 sm:p-5">
        <h2 className="text-lg font-semibold">{tl("Tu prépares un challenge prop firm ?")}</h2>
        <p className="mt-1 text-sm text-muted">
          {tl("Rejoue ta stratégie avec les règles de FTMO, FundedNext et The5ers sur des années de cours : chances de réussite, essais et frais à prévoir, comparés au simple hasard.")}</p>
        <Showcase />
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href={CHALLENGE_SIGNUP} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110">
            {tl("Estimer mes chances")}</Link>
          <span className="text-[11px] text-muted">{tl("Une estimation sur le passé, pas une garantie de réussite. Aucun lien avec ces prop firms.")}</span>
        </div>
      </section>

      <section>
        <h2 className="text-center text-lg font-semibold">{tl("Tout ce qu'il faut pour tester sérieusement")}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {POINTS.map((p) => (
            <div key={p.title} className="rounded-lg border border-line bg-panel p-4">
              <h3 className="font-semibold">{tl(p.title)}</h3>
              <p className="mt-1 text-sm text-muted">{tl(p.text)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-accent/40 bg-accent/10 p-6 text-center">
        <h2 className="text-xl font-semibold">{tl("Prêt à tester ta première stratégie ?")}</h2>
        <p className="mt-1 text-sm text-muted">{free}</p>
        <Link href={SIGNUP} className="mt-4 inline-block rounded-md bg-accent px-6 py-2.5 font-medium text-white shadow-lg shadow-accent/30 hover:brightness-110">
          {tl("Commencer gratuitement")}</Link>
        <p className="web-only mt-4 text-sm text-muted">
          {tl("Des questions ?")}{" "}
          <Link href="/questions" className="text-accent hover:underline">
            {tl("Ce que fait Backtest Lab, pour qui, à quel prix")}</Link>{" "}
          ·{" "}
          <Link href="/tarifs" className="text-accent hover:underline">
            {tl("Tarifs")}</Link>
        </p>
      </section>
    </div>
  );
}
