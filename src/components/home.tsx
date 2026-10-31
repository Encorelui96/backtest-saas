"use client";

import Link from "next/link";
import { authClient } from "@/lib/client/auth-client";
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
    <div className="mx-auto flex max-w-3xl flex-col gap-8 py-6 sm:py-12">
      <div className="text-center">
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
          Teste ta stratégie de trading <span className="text-accent">avant d&apos;y mettre ton argent</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted">
          Scalp, day trading ou swing, sur les cryptos, le forex, l&apos;or et le Nasdaq : écris tes règles en français, Backtest Lab les teste sur des années de cours et te dit si le
          résultat tient la route.
        </p>
        <Link href="/connexion" className="mt-6 inline-block rounded-md bg-accent px-5 py-2.5 font-medium text-white hover:brightness-110">
          Commencer gratuitement
        </Link>
        <p className="mt-2 text-xs text-muted">5 backtests par mois offerts, sans carte bancaire.</p>
      </div>
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
