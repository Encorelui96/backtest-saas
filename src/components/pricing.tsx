"use client";

import { currentLang, tr } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Link, useT } from "@/lib/client/i18n";
import { authClient } from "@/lib/client/auth-client";
import { api } from "@/lib/client/api";
import { ENTERPRISE, PACKS, PLANS, euros, historyMonths, quoteHref, type Billing, type PackId, type Plan, type PlanId } from "@/lib/plans";
import { EDITOR } from "@/lib/legal";
import { PROP_FIRMS, PROP_FIRMS_CHECKED } from "@/lib/prop-firms";
import { Alert } from "./ui";
import { num } from "@/lib/client/format";

const INTERVAL_LABELS: Record<string, string> = { "1m": "1 minute", "15m": "15 minutes", "1h": "1 heure" };
const SHORT_INTERVALS: Record<string, string> = { "1m": "1 min", "15m": "15 min", "1h": "1 h" };
const ORDER = Object.values(PLANS);

/** "399 €", "569,99 $": a price as the firm gives it, in the language of the page. */
function money(value: number, currency: "€" | "$") {
  return new Intl.NumberFormat(currentLang(), {
    style: "currency",
    currency: currency === "€" ? "EUR" : "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

/** The cheapest and the dearest challenge the site compares, each in its own currency. */
function challengeRange() {
  const sorted = [...PROP_FIRMS].sort((a, b) => a.priceValue - b.priceValue);
  const [low, high] = [sorted[0], sorted[sorted.length - 1]];
  return { low: money(low.priceValue, low.currency), high: money(high.priceValue, high.currency) };
}

/** What a card says: only what this offer adds to the one before it, in a few lines. */
function highlights(p: Plan, prev: Plan | null) {
  const lines = [tr("{0} backtests et {1} traductions par l'IA par mois", [num(p.backtestsPerMonth, 0), p.aiPerMonth])];
  if (!prev || p.minInterval !== prev.minInterval || p.historyDays !== prev.historyDays)
    lines.push(
      p.minInterval === "1m" && p.historyDays === null
        ? tr("Toutes les unités dès 1 minute, sur tout l'historique")
        : tr("Unités de temps à partir de {0}, sur les {1} derniers mois", [tr(INTERVAL_LABELS[p.minInterval] ?? p.minInterval), historyMonths(p) ?? ""]),
    );
  if (!prev) lines.push(tr("Verdict de robustesse et estimation de challenge prop firm"));
  else if (p.advanced && !prev.advanced) lines.push(tr("Robustesse détaillée et comparatif des prop firms"));
  if (!prev) lines.push(tr("Journal de trading : 1 compte, statistiques et calendrier"));
  else if (p.journalDashboard && !prev.journalDashboard) lines.push(tr("Journal complet : {0} comptes, tableau de bord et analyses", [p.journalAccounts]));
  if (p.live && !prev?.live) lines.push(tr("Suivi Live et {0} alertes Telegram", [p.alerts]));
  if (p.indicatorTier === 1 && (prev?.indicatorTier ?? 0) === 0) lines.push(tr("Indicateurs en plus : Heikin Ashi, Stoch RSI, Aroon, CMF"));
  if (p.indicatorTier === 2 && (prev?.indicatorTier ?? 0) < 2) lines.push(tr("Tous les indicateurs avancés : structure de marché, FVG, divergences"));
  if (prev?.live && (p.concurrentJobs > prev.concurrentJobs || p.alerts > prev.alerts))
    lines.push(tr("{0} backtests en même temps, {1} alertes Telegram", [p.concurrentJobs, p.alerts]));
  if (prev?.journalDashboard && (p.journalCaptures !== prev.journalCaptures || p.journalImages > prev.journalImages)) {
    const reads = p.journalCaptures === null ? tr("lectures par l'IA sans limite") : tr("{0} lectures par l'IA", [num(p.journalCaptures, 0)]);
    lines.push(
      p.journalAccounts > prev.journalAccounts
        ? tr("Journal : {0} comptes, {1}, {2} graphiques", [p.journalAccounts, reads, num(p.journalImages, 0)])
        : tr("Journal : {0}, {1} graphiques", [reads, num(p.journalImages, 0)]),
    );
  }
  return lines;
}

/** The full comparison, one row per limit; true and false become a tick and a dash. */
function rows(): { label: string; values: (string | boolean)[] }[] {
  const each = <T,>(f: (p: Plan) => T) => ORDER.map(f);
  return [
    { label: tr("Backtests par mois"), values: each((p) => num(p.backtestsPerMonth, 0)) },
    { label: tr("Traductions par l'IA par mois"), values: each((p) => String(p.aiPerMonth)) },
    { label: tr("Unité de temps minimale"), values: each((p) => SHORT_INTERVALS[p.minInterval] ?? p.minInterval) },
    { label: tr("Historique"), values: each((p) => (p.historyDays === null ? tr("tout") : tr("{0} mois", [historyMonths(p) ?? ""]))) },
    { label: tr("Backtests en même temps"), values: each((p) => String(p.concurrentJobs)) },
    { label: tr("Robustesse détaillée"), values: each((p) => p.advanced) },
    { label: tr("Comparatif des prop firms"), values: each((p) => p.advanced) },
    { label: tr("Suivi Live des stratégies"), values: each((p) => p.live) },
    { label: tr("Alertes Telegram"), values: each((p) => (p.alerts ? String(p.alerts) : false)) },
    { label: tr("Heikin Ashi, Stoch RSI, Aroon, CMF"), values: each((p) => p.indicatorTier >= 1) },
    { label: tr("Structure de marché, FVG, divergences"), values: each((p) => p.indicatorTier >= 2) },
    { label: tr("Journal : comptes"), values: each((p) => String(p.journalAccounts)) },
    { label: tr("Journal : tableau de bord complet"), values: each((p) => p.journalDashboard) },
    { label: tr("Journal : lectures par l'IA par mois"), values: each((p) => (p.journalCaptures === null ? tr("sans limite") : num(p.journalCaptures, 0))) },
    { label: tr("Journal : graphiques gardés"), values: each((p) => num(p.journalImages, 0)) },
  ];
}

/** Four offers, Trader highlighted, then the one on quote; paid offers record interest until online payment opens. */
export function Pricing() {
  const tl = useT();
  const { data: session } = authClient.useSession();
  const [billing, setBilling] = useState<Billing>("month");
  const [current, setCurrent] = useState<PlanId | null>(null);
  const [wanted, setWanted] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const range = challengeRange();

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

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {ORDER.map((p, i) => {
          const featured = p.id === "trader";
          const prev = i > 0 ? ORDER[i - 1] : null;
          const price = billing === "year" ? p.yearly / 12 : p.monthly;
          return (
            <section
              key={p.id}
              className={`relative flex flex-col rounded-xl border bg-panel p-4 sm:p-5 ${featured ? "border-accent shadow-lg shadow-accent/15 lg:-my-2 lg:py-7" : "border-line"}`}
            >
              {featured && <span className="absolute -top-3 left-4 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-white">{tl("Recommandée")}</span>}
              <h2 className="text-lg font-semibold">{tl(p.label)}</h2>
              <p className="mt-1 min-h-10 text-sm text-muted">{tl(p.pitch)}</p>
              <div className="mt-3 flex items-baseline gap-1.5">
                {billing === "year" && p.monthly > 0 && <s className="num text-base text-muted">{euros(p.monthly)}</s>}
                <span className="num text-3xl font-semibold">{euros(price)}</span>
                <span className="text-sm text-muted">{tl("/ mois")}</span>
              </div>
              <p className="min-h-5 text-xs text-muted">{p.monthly === 0 ? tl("Gratuit, sans carte bancaire") : billing === "year" ? tl("{0} par an, 2 mois offerts", [euros(p.yearly)]) : tl("sans engagement")}</p>
              {prev && <p className="mt-4 text-xs font-semibold text-muted">{tl("Tout {0}, plus :", [tl(prev.label)])}</p>}
              <ul className={`${prev ? "mt-2" : "mt-4"} flex flex-1 flex-col gap-2 text-sm`}>
                {highlights(p, prev).map((f) => (
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

      <section className="rounded-xl border border-warn/40 bg-warn/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold">{tl("Un challenge raté coûte plus cher qu'un an de Trader.")}</h2>
        <p className="mt-1 text-sm text-muted">
          {tl("Un challenge prop firm pour un compte de 100 000 $ coûte entre {0} et {1} chez les firmes comparées sur Backtest Lab (prix relevés le {2}). Un an de Trader coûte {3} : de quoi tester ta stratégie sur tout l'historique et comparer les prop firms avant de payer un challenge.", [
            range.low,
            range.high,
            tl(PROP_FIRMS_CHECKED),
            euros(PLANS.trader.yearly),
          ])}
        </p>
      </section>

      <section className="rounded-xl border border-line bg-panel p-4 sm:p-5">
        <h2 className="text-lg font-semibold">{tl("Comparer les offres en détail")}</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="w-[34%] py-2 pr-2 font-medium text-muted" scope="col">
                  <span className="sr-only">{tl("Offre")}</span>
                </th>
                {ORDER.map((p) => (
                  <th key={p.id} scope="col" className={`px-1 py-2 text-center font-semibold sm:px-2 ${p.id === "trader" ? "text-accent" : ""}`}>
                    {tl(p.label)}
                    <span className="num block text-[10px] font-normal text-muted sm:text-xs">{p.monthly === 0 ? tl("Gratuit") : tl("{0} / mois", [euros(billing === "year" ? p.yearly / 12 : p.monthly)])}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows().map((r) => (
                <tr key={r.label} className="border-b border-line/60 last:border-0">
                  <th scope="row" className="py-2 pr-2 text-left font-normal text-muted">
                    {r.label}
                  </th>
                  {r.values.map((v, k) => (
                    <td key={ORDER[k].id} className="num px-1 py-2 text-center sm:px-2">
                      {v === true ? <span className="text-up" aria-label={tl("oui")}>✓</span> : v === false ? <span className="text-muted" aria-label={tl("non")}>—</span> : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
