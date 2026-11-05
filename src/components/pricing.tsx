"use client";

import { tr } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Link, useT } from "@/lib/client/i18n";
import { authClient } from "@/lib/client/auth-client";
import { api } from "@/lib/client/api";
import { ENTERPRISE, PACKS, PLANS, euros, historyMonths, quoteHref, type Billing, type PackId, type Plan, type PlanId } from "@/lib/plans";
import { EDITOR } from "@/lib/legal";
import { Alert } from "./ui";
import { num } from "@/lib/client/format";

const INTERVAL_LABELS: Record<string, string> = { "1m": "1 minute", "15m": "15 minutes", "1h": "1 heure" };

function features(p: Plan) {
  return [
    tr("{0} backtests par mois", [num(p.backtestsPerMonth, 0)]),
    tr("{0} traductions par l'IA par mois", [p.aiPerMonth]),
    p.minInterval === "1m" ? tr("Toutes les unités de temps, dès 1 minute (scalp)") : tr("Unités de temps à partir de {0}", [tr(INTERVAL_LABELS[p.minInterval] ?? p.minInterval)]),
    p.historyDays === null ? tr("Tout l'historique") : tr("Historique : les {0} derniers mois", [historyMonths(p)]),
    tr("Crypto, forex, or et Nasdaq"),
    p.advanced ? tr("Robustesse détaillée et comparatif des prop firms") : tr("Verdict de robustesse et challenge prop firm"),
    ...(p.live ? [tr("Suivi Live des stratégies")] : []),
    ...(p.alerts ? [tr("{0} alertes Telegram", [p.alerts])] : []),
  ];
}

/** Three offers, the middle one highlighted, then the one on quote; paid offers record interest until online payment opens. */
export function Pricing() {
  const tl = useT();
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
      <div className="mx-auto flex rounded-full border border-line bg-panel p-1 text-sm" role="tablist" aria-label={tl("Facturation")}>
        {(["month", "year"] as const).map((b) => (
          <button
            key={b}
            role="tab"
            aria-selected={billing === b}
            onClick={() => setBilling(b)}
            className={`rounded-full px-4 py-1.5 ${billing === b ? "bg-accent text-white" : "text-muted hover:text-fg"}`}
          >
            {b === "month" ? tl("Au mois") : tl("À l'année · 2 mois offerts")}
          </button>
        ))}
      </div>

      <Alert tone="info">
        {tl("Le paiement en ligne n'est pas encore ouvert. Clique sur « Je veux cette offre » : c'est ce qui décidera quand l'ouvrir, et tu ne paies rien aujourd'hui.")}</Alert>
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
              {featured && <span className="absolute -top-3 left-4 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-white">{tl("Recommandée")}</span>}
              <h2 className="text-lg font-semibold">{tl(p.label)}</h2>
              <p className="mt-1 min-h-10 text-sm text-muted">{tl(p.pitch)}</p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="num text-3xl font-semibold">{euros(price)}</span>
                <span className="text-sm text-muted">{tl("/ mois")}</span>
              </div>
              <p className="min-h-5 text-xs text-muted">{p.monthly === 0 ? tl("Gratuit, sans carte bancaire") : billing === "year" ? tl("soit {0} par an", [euros(p.yearly)]) : tl("sans engagement")}</p>
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
                    <p className="text-center text-sm text-muted">{current === "free" ? tl("Ton offre actuelle") : tl("Incluse avec ton compte")}</p>
                  ) : (
                    <Link href="/connexion?mode=signup" className="block rounded-md border border-line px-4 py-2 text-center font-medium hover:border-accent">
                      {tl("Commencer gratuitement")}</Link>
                  )
                ) : current === p.id ? (
                  <p className="text-center text-sm text-muted">{tl("Ton offre actuelle")}</p>
                ) : wanted.includes(p.id) ? (
                  <p className="text-center text-sm text-up">{tl("C'est noté ✓ Merci, ton choix compte pour l'ouverture.")}</p>
                ) : session ? (
                  <button
                    onClick={() => want(p.id)}
                    className={`w-full rounded-md px-4 py-2 font-medium ${featured ? "bg-accent text-white hover:brightness-110" : "border border-line hover:border-accent"}`}
                  >
                    {tl("Je veux cette offre")}</button>
                ) : (
                  <Link
                    href="/connexion?mode=signup&next=/tarifs"
                    className={`block rounded-md px-4 py-2 text-center font-medium ${featured ? "bg-accent text-white hover:brightness-110" : "border border-line hover:border-accent"}`}
                  >
                    {tl("Je veux cette offre")}</Link>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section id="entreprise" className="flex scroll-mt-20 flex-col gap-4 rounded-xl border border-line bg-panel p-4 sm:p-5 md:flex-row md:items-center md:gap-8">
        <div className="md:w-72 md:shrink-0">
          <h2 className="text-lg font-semibold">{tl(ENTERPRISE.label)}</h2>
          <p className="mt-1 text-sm text-muted">{tl(ENTERPRISE.pitch)}</p>
          <div className="mt-3 text-3xl font-semibold">{tl("Sur devis")}</div>
          <p className="text-xs text-muted">{tl("Le prix dépend du nombre de personnes et du volume de tests.")}</p>
        </div>
        <ul className="flex flex-1 flex-col gap-2 text-sm">
          {ENTERPRISE.perks.map((perk) => (
            <li key={perk} className="flex gap-2">
              <span className="text-up" aria-hidden>
                ✓
              </span>
              {tl(perk)}
            </li>
          ))}
        </ul>
        <div className="md:w-52 md:shrink-0">
          <a
            href={quoteHref(EDITOR.email, tl("Devis offre Entreprise Backtest Lab"), [tl("Société :"), tl("Nombre de personnes :"), tl("Ton besoin :")])}
            className="block rounded-md border border-line px-4 py-2 text-center font-medium hover:border-accent"
          >
            {tl("Demander un devis")}</a>
          <p className="mt-2 text-center text-xs text-muted">{tl("ou écris à {0}", [EDITOR.email])}</p>
        </div>
      </section>

      <section id="recharges" className="mt-4 scroll-mt-20 rounded-xl border border-line bg-panel p-4 sm:p-5">
        <h2 className="text-lg font-semibold">{tl("Recharges")}</h2>
        <p className="mt-1 text-sm text-muted">
          {tl("Ton quota du mois est épuisé avant la fin du mois ? Ajoute des crédits à l'unité, sans changer d'offre. Ils servent une fois le quota mensuel utilisé, et ils n'expirent pas. Un backtest qui échoue te rend son crédit.")}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {PACKS.map((p) => {
            const id = `pack:${p.id}`;
            return (
              <div key={p.id} className={`flex flex-col rounded-lg border p-3 ${p.id === "combo" ? "border-accent" : "border-line"}`}>
                <div className="font-medium">{tl(p.label)}</div>
                <div className="num mt-1 text-2xl font-semibold">{euros(p.price)}</div>
                <p className="text-xs text-muted">{p.id === "combo" ? tl("au lieu de {0}", [euros(PACKS[0].price + PACKS[1].price)]) : "paiement unique"}</p>
                <div className="mt-3 flex-1" />
                {wanted.includes(id) ? (
                  <p className="text-sm text-up">{tl("C'est noté ✓")}</p>
                ) : session ? (
                  <button onClick={() => wantPack(p.id)} className="rounded-md border border-line px-3 py-1.5 text-sm font-medium hover:border-accent">
                    {tl("Je veux cette recharge")}</button>
                ) : (
                  <Link href="/connexion?mode=signup&next=/tarifs" className="rounded-md border border-line px-3 py-1.5 text-center text-sm font-medium hover:border-accent">
                    {tl("Je veux cette recharge")}</Link>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
