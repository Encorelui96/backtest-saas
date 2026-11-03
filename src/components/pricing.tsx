"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/client/auth-client";
import { api } from "@/lib/client/api";
import { PACKS, PLANS, euros, type Billing, type PackId, type Plan, type PlanId } from "@/lib/plans";
import { Alert } from "./ui";

const INTERVAL_LABELS: Record<string, string> = { "1m": "1 minute", "1h": "1 heure" };

function features(p: Plan) {
  return [
    `${p.backtestsPerMonth.toLocaleString("fr-FR")} backtests par mois`,
    `${p.aiPerMonth} traductions par l'IA par mois`,
    p.minInterval === "1m" ? "Toutes les unités de temps, dès 1 minute (scalp)" : `Unités de temps à partir de ${INTERVAL_LABELS[p.minInterval] ?? p.minInterval}`,
    "Crypto, forex, or et Nasdaq",
    "Robustesse et challenge prop firm",
    p.concurrentJobs > 1 ? `${p.concurrentJobs} backtests en parallèle` : "1 backtest à la fois",
    ...(p.alerts ? [`${p.alerts} alertes Telegram`] : []),
  ];
}

/** Three offers, the middle one highlighted; paid offers record interest until online payment opens. */
export function Pricing() {
  const { data: session } = authClient.useSession();
  const [billing, setBilling] = useState<Billing>("year");
  const [current, setCurrent] = useState<PlanId | null>(null);
  const [wanted, setWanted] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    api<{ usage: { plan: { id: PlanId } } | null; interests: string[] }>("/api/me")
      .then((m) => {
        setCurrent(m.usage?.plan.id ?? null);
        setWanted(m.interests);
      })
      .catch(() => {});
  }, [session]);

  const want = async (plan: PlanId) => {
    setError(null);
    try {
      await api("/api/interest", { json: { plan, billing } });
      setWanted((w) => [...new Set([...w, plan])]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const wantPack = async (pack: PackId) => {
    setError(null);
    try {
      await api("/api/interest", { json: { pack } });
      setWanted((w) => [...new Set([...w, `pack:${pack}`])]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="mx-auto flex rounded-full border border-line bg-panel p-1 text-sm" role="tablist" aria-label="Facturation">
        {(["month", "year"] as const).map((b) => (
          <button
            key={b}
            role="tab"
            aria-selected={billing === b}
            onClick={() => setBilling(b)}
            className={`rounded-full px-4 py-1.5 ${billing === b ? "bg-accent text-white" : "text-muted hover:text-fg"}`}
          >
            {b === "month" ? "Au mois" : "À l'année · 2 mois offerts"}
          </button>
        ))}
      </div>

      <Alert tone="info">
        Le paiement en ligne n&apos;est pas encore ouvert. Clique sur « Je veux cette offre » : c&apos;est ce qui décidera quand l&apos;ouvrir, et tu ne paies rien
        aujourd&apos;hui.
      </Alert>
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-3 md:grid-cols-3">
        {Object.values(PLANS).map((p) => {
          const featured = p.id === "trader";
          const price = billing === "year" ? p.yearly / 12 : p.monthly;
          return (
            <section
              key={p.id}
              className={`relative flex flex-col rounded-xl border bg-panel p-4 sm:p-5 ${featured ? "border-accent shadow-lg shadow-accent/15 md:-my-2 md:py-7" : "border-line"}`}
            >
              {featured && <span className="absolute -top-3 left-4 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-white">Recommandée</span>}
              <h2 className="text-lg font-semibold">{p.label}</h2>
              <p className="mt-1 min-h-10 text-sm text-muted">{p.pitch}</p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="num text-3xl font-semibold">{euros(price)}</span>
                <span className="text-sm text-muted">/ mois</span>
              </div>
              <p className="min-h-5 text-xs text-muted">{p.monthly === 0 ? "Gratuit, sans carte bancaire" : billing === "year" ? `soit ${euros(p.yearly)} par an` : "sans engagement"}</p>
              <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm">
                {features(p).map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-up" aria-hidden>
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {p.id === "free" ? (
                  session ? (
                    <p className="text-center text-sm text-muted">{current === "free" ? "Ton offre actuelle" : "Incluse avec ton compte"}</p>
                  ) : (
                    <Link href="/connexion?mode=signup" className="block rounded-md border border-line px-4 py-2 text-center font-medium hover:border-accent">
                      Commencer gratuitement
                    </Link>
                  )
                ) : current === p.id ? (
                  <p className="text-center text-sm text-muted">Ton offre actuelle</p>
                ) : wanted.includes(p.id) ? (
                  <p className="text-center text-sm text-up">C&apos;est noté ✓ Merci, ton choix compte pour l&apos;ouverture.</p>
                ) : session ? (
                  <button
                    onClick={() => want(p.id)}
                    className={`w-full rounded-md px-4 py-2 font-medium ${featured ? "bg-accent text-white hover:brightness-110" : "border border-line hover:border-accent"}`}
                  >
                    Je veux cette offre
                  </button>
                ) : (
                  <Link
                    href="/connexion?mode=signup&next=/tarifs"
                    className={`block rounded-md px-4 py-2 text-center font-medium ${featured ? "bg-accent text-white hover:brightness-110" : "border border-line hover:border-accent"}`}
                  >
                    Je veux cette offre
                  </Link>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section id="recharges" className="mt-4 scroll-mt-20 rounded-xl border border-line bg-panel p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Recharges</h2>
        <p className="mt-1 text-sm text-muted">
          Ton quota du mois est épuisé avant la fin du mois ? Ajoute des crédits à l&apos;unité, sans changer d&apos;offre. Ils servent une fois le quota mensuel
          utilisé, et ils n&apos;expirent pas. Un backtest qui échoue te rend son crédit.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {PACKS.map((p) => {
            const id = `pack:${p.id}`;
            return (
              <div key={p.id} className={`flex flex-col rounded-lg border p-3 ${p.id === "combo" ? "border-accent" : "border-line"}`}>
                <div className="font-medium">{p.label}</div>
                <div className="num mt-1 text-2xl font-semibold">{euros(p.price)}</div>
                <p className="text-xs text-muted">{p.id === "combo" ? `au lieu de ${euros(PACKS[0].price + PACKS[1].price)}` : "paiement unique"}</p>
                <div className="mt-3 flex-1" />
                {wanted.includes(id) ? (
                  <p className="text-sm text-up">C&apos;est noté ✓</p>
                ) : session ? (
                  <button onClick={() => wantPack(p.id)} className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:border-accent">
                    Je veux cette recharge
                  </button>
                ) : (
                  <Link href="/connexion?mode=signup&next=/tarifs" className="rounded-md border border-line px-3 py-1.5 text-center text-sm font-medium hover:border-accent">
                    Je veux cette recharge
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
