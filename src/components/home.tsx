"use client";

import Link from "next/link";
import { authClient } from "@/lib/client/auth-client";
import { CandleHero } from "./candle-hero";
import { Dashboard } from "./dashboard";

const POINTS = [
  { title: "Décris ta stratégie en français", text: "L'IA la traduit en règles précises, liste ses choix et te pose des questions quand c'est flou." },
  { title: "Un test honnête", text: "Frais, spread, glissement et gaps compris, sans regarder le futur, de la minute au journalier." },
  { title: "Robustesse en 4 contrôles", text: "Hasard ou vrai avantage ? Tenue dans le temps, réglages voisins, frais doublés." },
  { title: "Challenge prop firm", text: "Ta chance de passer un challenge selon ton risque par trade, comparée au simple hasard." },
];

/** The dashboard for signed-in users, a short presentation for visitors. */
export function Home() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return <p className="text-muted">Chargement…</p>;
  if (session) return <Dashboard />;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 pb-6 sm:gap-10 sm:pb-12">
      {/* Phones: the chart runs edge to edge; larger screens: a rounded panel. */}
      <section className="relative -mx-3 h-[440px] overflow-hidden border-y border-line bg-panel/40 sm:mx-0 sm:h-[500px] sm:rounded-2xl sm:border">
        <CandleHero className="absolute inset-0" />
        {/* Darkens the middle and the bottom so the text stays readable over the candles. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(11,14,20,0.85)_0%,rgba(11,14,20,0.55)_45%,rgba(11,14,20,0)_75%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg to-transparent" />
        <div className="relative flex h-full flex-col items-center justify-center px-5 text-center">
          <h1 className="text-3xl font-semibold leading-tight drop-shadow sm:text-5xl">
            Teste ta stratégie de trading
            <br />
            <span className="text-accent">avant d&apos;y mettre ton argent</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-fg/80 sm:text-base">
            Scalp, day trading ou swing, sur les cryptos, le forex, l&apos;or et le Nasdaq : écris tes règles en français, Backtest Lab les teste sur des années de cours et te dit si le
            résultat tient la route.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/connexion" className="rounded-md bg-accent px-5 py-2.5 font-medium text-white shadow-lg shadow-accent/30 hover:brightness-110">
              Commencer gratuitement
            </Link>
            <Link href="/apprendre" className="rounded-md border border-line bg-panel/70 px-5 py-2.5 font-medium text-fg backdrop-blur hover:border-accent">
              Apprendre les bases
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted">5 backtests par mois offerts, sans carte bancaire.</p>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        {POINTS.map((p) => (
          <div key={p.title} className="rounded-lg border border-line bg-panel p-4">
            <h2 className="font-semibold">{p.title}</h2>
            <p className="mt-1 text-sm text-muted">{p.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
