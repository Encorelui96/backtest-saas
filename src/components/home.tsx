"use client";

import { useEffect, useState } from "react";
import { Link, useT } from "@/lib/client/i18n";
import { PLANS, euros } from "@/lib/plans";
import { date, num, pct } from "@/lib/client/format";
import { PROP_FIRMS_CHECKED } from "@/lib/prop-firms";
import { SHOWCASE as S } from "@/lib/showcase";
import { api } from "@/lib/client/api";
import { authClient } from "@/lib/client/auth-client";
import { setSignedInHint } from "@/lib/signed-in-hint";
import { CandleHero } from "./candle-hero";
import { Dashboard } from "./dashboard";

const POINTS = [
  { title: "Challenge prop firm", text: "Tes trades rejoués avec les règles de FTMO, FundedNext et The5ers : chances de réussite, essais et frais à prévoir, comparés au simple hasard." },
  { title: "Un test honnête", text: "Frais, spread, glissement et gaps compris, sans regarder le futur, de la minute au journalier." },
  { title: "Robustesse en 4 contrôles", text: "Hasard ou vrai avantage ? Tenue dans le temps, réglages voisins, frais doublés." },
  { title: "Décris ta stratégie en français", text: "L'IA la traduit en règles précises, liste ses choix et te pose des questions quand c'est flou." },
];

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
    <section className="rounded-lg border border-line bg-panel p-4 sm:p-5">
      <h2 className="text-lg font-semibold">{tl("Un exemple réel, sans filtre")}</h2>
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
      <div className="mt-2">
        <ExampleLink />
      </div>
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
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 pb-6 sm:gap-10 sm:pb-12">
      {/* Phones: the chart runs edge to edge; larger screens: a rounded panel. */}
      <section className="relative -mx-3 h-[500px] overflow-hidden border-y border-line bg-panel/40 sm:mx-0 sm:rounded-2xl sm:border">
        <CandleHero className="absolute inset-0" />
        {/* Darkens the middle and the bottom so the text stays readable over the candles. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(11,14,20,0.85)_0%,rgba(11,14,20,0.55)_45%,rgba(11,14,20,0)_75%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg to-transparent" />
        <div className="relative flex h-full flex-col items-center justify-center px-5 text-center">
          <h1 className="text-3xl font-semibold leading-tight drop-shadow sm:text-5xl">
            {tl("Avant de payer ton challenge,")}<br />
            <span className="text-accent">{tl("estime tes chances sur l'historique")}</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-fg/80 sm:text-base">
            {tl("Rejoue ta stratégie avec les règles de FTMO, FundedNext et The5ers sur des années de cours : chances de réussite, essais et frais à prévoir.")}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href={CHALLENGE_SIGNUP} className="rounded-md bg-accent px-5 py-2.5 font-medium text-white shadow-lg shadow-accent/30 hover:brightness-110">
              {tl("Estimer mes chances")}</Link>
            <Link href="/apprendre" className="rounded-md border border-line bg-panel/70 px-5 py-2.5 font-medium text-fg backdrop-blur hover:border-accent">
              {tl("Apprendre les bases")}</Link>
          </div>
          <p className="mt-3 text-xs text-muted">{tl("{0} backtests par mois offerts, sans carte bancaire.", [PLANS.free.backtestsPerMonth])}</p>
          <p className="mt-1 text-[11px] text-muted">{tl("Une estimation sur le passé, pas une garantie de réussite. Aucun lien avec ces prop firms.")}</p>
        </div>
      </section>
      <Showcase />
      <section className="rounded-lg border border-line bg-panel p-4 text-center sm:p-5">
        <h2 className="font-semibold">{tl("Tu ne vises pas de prop firm ?")}</h2>
        <p className="mx-auto mt-1 max-w-2xl text-sm text-muted">
          {tl("Scalp, day trading ou swing, sur les cryptos, le forex, l'or et le Nasdaq : écris tes règles en français, Backtest Lab les teste sur des années de cours et te dit si le résultat tient la route.")}</p>
        <Link href="/connexion?mode=signup" className="mt-2 inline-block text-sm text-accent hover:underline">
          {tl("Tester ma stratégie →")}</Link>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        {POINTS.map((p) => (
          <div key={p.title} className="rounded-lg border border-line bg-panel p-4">
            <h2 className="font-semibold">{tl(p.title)}</h2>
            <p className="mt-1 text-sm text-muted">{tl(p.text)}</p>
          </div>
        ))}
      </div>
      <p className="web-only text-center text-sm text-muted">
        {tl("Des questions ?")}{" "}
        <Link href="/questions" className="text-accent hover:underline">
          {tl("Ce que fait Backtest Lab, pour qui, à quel prix")}</Link>{" "}
        ·{" "}
        <Link href="/tarifs" className="text-accent hover:underline">
          {tl("Tarifs")}</Link>
      </p>
    </div>
  );
}
