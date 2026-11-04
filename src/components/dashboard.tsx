"use client";

import { tr } from "@/lib/i18n";
import { Link, useRouter, useT } from "@/lib/client/i18n";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { stepSeen, welcomeDone } from "@/lib/client/preferences";
import { BACKTEST_LIST_LIMIT, matchesSearch } from "@/lib/backtest-names";
import { firstStepsDone } from "@/lib/next-step";
import { date, num, pct, r, tone, formatLocale } from "@/lib/client/format";
import type { Strategy } from "@/lib/strategy/schema";
import type { BacktestSummary } from "@/lib/server/backtests";
import { Button, Card } from "./ui";
import { CandleHero } from "./candle-hero";
import { TickerTape } from "./ticker-tape";
import { useBeginner } from "./learn";
import { PmfSurvey } from "./pmf-survey";
import { RenameBacktest, RenameButton } from "./rename-backtest";
import { Welcome } from "./welcome";

interface Me {
  usage: { plan: { id: string; label: string; backtestsPerMonth: number; aiPerMonth: number }; backtests: number; ai: number; resetsAt: string } | null;
  surveyAnswered: boolean;
}

/** From 80 % of a monthly quota: says how much is left and where the bigger offers are. */
function QuotaBanner({ usage }: { usage: NonNullable<Me["usage"]> }) {
  const tl = useT();
  if (usage.plan.id === "pro") return null;
  const items = [
    { used: usage.backtests, max: usage.plan.backtestsPerMonth, what: "backtests" },
    { used: usage.ai, max: usage.plan.aiPerMonth, what: tl("traductions par l'IA") },
  ].filter((i) => i.used >= 0.8 * i.max);
  if (!items.length) return null;
  const reset = new Date(usage.resetsAt).toLocaleDateString(formatLocale(), { day: "numeric", month: "long" });
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-sm">
      <span className="flex-1">
        {tl("{0} du mois sont utilisés (offre {1}). Compteurs remis à zéro le {2}.", [
          items.map((i) => tl("{0} de tes {1} {2}", [Math.min(i.used, i.max), i.max, i.what])).join(tl(" et ")),
          tl(usage.plan.label),
          reset,
        ])}
      </span>
      <Link href="/tarifs" className="font-medium text-accent hover:underline">
        {tl("Voir les offres →")}</Link>
    </div>
  );
}

interface BacktestRow {
  id: string;
  strategyId: string | null;
  name: string;
  symbol: string;
  interval: string;
  startDate: string;
  endDate: string;
  summary: BacktestSummary;
  createdAt: number;
}

/** A one-word judgement of a backtest, for beginners who don't read profit factors. */
function verdict(s: BacktestSummary) {
  if (s.trades < 30) return { label: tr("Trop peu de trades"), style: "border-line text-muted" };
  if (s.totalReturnPercent <= 0) return { label: tr("Perdante"), style: "border-down/40 text-down" };
  if (s.profitFactor !== null && s.profitFactor >= 1.3) return { label: tr("Prometteuse"), style: "border-up/40 text-up" };
  return { label: tr("Fragile"), style: "border-warn/40 text-warn" };
}

/** Beginner mode: four first steps that tick themselves as the user goes. Each report opens on the latest test. */
function FirstSteps({ strategies, backtests }: { strategies: number; backtests: BacktestRow[] }) {
  const tl = useT();
  const done = firstStepsDone({ strategies, backtests: backtests.length, verdictSeen: stepSeen("verdict"), challengeSeen: stepSeen("challenge") });
  const report = backtests[0] ? `/backtests/${backtests[0].id}` : "/strategies/new";
  const steps = [
    { done: done.model, text: tl("Choisir un modèle"), href: "/strategies/new" },
    { done: done.run, text: tl("Lancer le test"), href: "/strategies/new" },
    { done: done.verdict, text: tl("Lire le verdict"), href: report },
    { done: done.challenge, text: tl("Tester le challenge prop firm"), href: backtests[0] ? `${report}?tab=prop` : report },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <Card title={tl("Tes premiers pas")}>
      <ol className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={s.text}>
            <Link href={s.href} className="flex items-center gap-3 text-sm">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${s.done ? "bg-up text-white" : "border border-line text-muted"}`}
                aria-hidden
              >
                {s.done ? "✓" : i + 1}
              </span>
              <span className={s.done ? "text-muted line-through" : "hover:text-accent"}>{s.text}</span>
            </Link>
          </li>
        ))}
      </ol>
      <Link href="/apprendre" className="mt-3 inline-block text-xs text-accent hover:underline">
        {tl("Les mots du trading expliqués simplement →")}</Link>
    </Card>
  );
}

export function Dashboard() {
  const tl = useT();
  const router = useRouter();
  const beginner = useBeginner();
  const [strategies, setStrategies] = useState<{ id: string; name: string; strategy: Strategy; updatedAt: number }[] | null>(null);
  const [backtests, setBacktests] = useState<BacktestRow[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<{ query: string; rows: BacktestRow[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  // The dashboard only renders in the browser (after the session check), so storage can be read here.
  const [welcome, setWelcome] = useState(() => !welcomeDone());

  useEffect(() => {
    api<typeof strategies>("/api/strategies").then(setStrategies).catch(() => setStrategies([]));
    api<BacktestRow[]>("/api/backtests").then(setBacktests).catch(() => setBacktests([]));
    api<Me>("/api/me").then(setMe).catch(() => {});
  }, []);

  // The list holds the latest backtests only: the server searches them all, once the typing pauses.
  const query = search.trim();
  useEffect(() => {
    if (!query) return;
    let current = true;
    const timer = setTimeout(() => {
      api<BacktestRow[]>(`/api/backtests?q=${encodeURIComponent(query)}`)
        .then((rows) => current && setFound({ query, rows }))
        .catch(() => current && setFound({ query, rows: [] }));
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);

  const shown = !query ? backtests : found?.query === query ? found.rows : null;
  const shownStrategies = strategies?.filter((s) => matchesSearch(`${s.name} ${s.strategy.symbol} ${s.strategy.interval}`, query)) ?? null;

  const renamed = (id: string, name: string) => {
    const apply = (rows: BacktestRow[]) => rows.map((b) => (b.id === id ? { ...b, name } : b));
    setBacktests((rows) => rows && apply(rows));
    setFound((f) => f && { ...f, rows: apply(f.rows) });
    setRenaming(null);
  };
  const renameForm = (b: BacktestRow) => <RenameBacktest id={b.id} name={b.name} onDone={(name) => renamed(b.id, name)} onCancel={() => setRenaming(null)} />;

  const remove = async (id: string) => {
    if (!confirm(tl("Supprimer cette stratégie ? Ses backtests restent consultables."))) return;
    await api(`/api/strategies/${id}`, { method: "DELETE" });
    setStrategies((s) => s?.filter((x) => x.id !== id) ?? null);
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="relative -mx-3 h-40 overflow-hidden border-y border-line bg-panel/40 sm:mx-0 sm:h-44 sm:rounded-xl sm:border">
        <CandleHero className="absolute inset-0" density={1.4} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-bg/95 via-bg/70 to-transparent" />
        <div className="relative flex h-full flex-col justify-center gap-2 px-4 sm:px-6">
          <h1 className="text-xl font-semibold sm:text-2xl">{tl("Une idée de stratégie ?")}</h1>
          <p className="max-w-sm text-sm text-fg/75">{tl("Teste-la sur des années de cours avant d'y mettre un euro.")}</p>
          <div>
            <Link href="/strategies/new" className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-accent/30 hover:brightness-110">
              {tl("Nouveau backtest")}</Link>
          </div>
        </div>
      </section>

      <TickerTape />

      {me?.usage && <QuotaBanner usage={me.usage} />}
      {welcome && backtests !== null && backtests.length === 0 ? (
        <Welcome onDone={() => setWelcome(false)} />
      ) : (
        beginner && backtests !== null && <FirstSteps strategies={strategies?.length ?? 0} backtests={backtests} />
      )}
      {me && !me.surveyAnswered && backtests !== null && backtests.length >= 3 && <PmfSurvey />}

      {backtests !== null && backtests.length > 0 && (
        <div className="relative">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden>
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
          {/* Inline: the site's input padding sits outside Tailwind's layers and would win over a class. */}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tl("Rechercher un backtest ou une stratégie")}
            aria-label={tl("Rechercher un backtest ou une stratégie")}
            className="w-full"
            style={{ padding: "8px 12px 8px 36px" }}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card title={beginner ? tl("Mes tests") : tl("Derniers backtests")}>
          {shown === null ? (
            <p className="text-sm text-muted">{query ? tl("Recherche…") : tl("Chargement…")}</p>
          ) : shown.length === 0 && query ? (
            <p className="text-sm text-muted">{tl("Aucun résultat pour « {0} ».", [query])}</p>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-start gap-3 text-sm text-muted">
              <p>{tl("Aucun backtest pour l'instant. Décris une stratégie en français ou pars d'un modèle.")}</p>
              <Button onClick={() => router.push("/strategies/new")}>{tl("Créer ma première stratégie")}</Button>
            </div>
          ) : beginner ? (
            <ul className="-my-1 flex flex-col divide-y divide-line/50">
              {shown.map((b) => {
                const v = verdict(b.summary);
                if (renaming === b.id) return <li key={b.id} className="py-3">{renameForm(b)}</li>;
                return (
                  <li key={b.id} className="flex items-center gap-1">
                    <Link href={`/backtests/${b.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{b.name}</div>
                        <div className="text-[11px] text-muted">
                          {b.symbol} · {date(b.createdAt, false)}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${v.style}`}>{v.label}</span>
                      <span className={`num w-16 shrink-0 text-right text-sm font-semibold ${tone(b.summary.totalReturnPercent)}`}>{pct(b.summary.totalReturnPercent)}</span>
                    </Link>
                    <RenameButton onClick={() => setRenaming(b.id)} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <>
            {/* Phones: one card per backtest. */}
            <ul className="-my-1 flex flex-col divide-y divide-line/50 md:hidden">
              {shown.map((b) => renaming === b.id ? (
                <li key={b.id} className="py-2.5">{renameForm(b)}</li>
              ) : (
                <li key={b.id} className="flex items-center gap-1">
                  <Link href={`/backtests/${b.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{b.name}</div>
                      <div className="text-[11px] text-muted">
                        {b.symbol} {b.interval} · {tl("{0} trades", [b.summary.trades])} · {b.startDate.slice(0, 4)}→{b.endDate.slice(0, 4)}
                      </div>
                    </div>
                    <div className="num text-right">
                      <div className={`text-sm font-semibold ${tone(b.summary.totalReturnPercent)}`}>{pct(b.summary.totalReturnPercent)}</div>
                      <div className="text-[11px] text-down">{tl("{0} max", [pct(-b.summary.maxDrawdownPercent)])}</div>
                    </div>
                  </Link>
                  <RenameButton onClick={() => setRenaming(b.id)} />
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="num w-full text-sm">
                <thead className="text-xs text-muted">
                  <tr className="text-left">
                    <th className="font-normal">{tl("Stratégie")}</th>
                    <th className="font-normal">{tl("Marché")}</th>
                    <th className="font-normal">{tl("Période")}</th>
                    <th className="text-right font-normal">{tl("Trades")}</th>
                    <th className="text-right font-normal">{tl("Rendement")}</th>
                    <th className="text-right font-normal">{tl("Baisse max")}</th>
                    <th className="text-right font-normal">{tl("Gagnants")}</th>
                    <th className="text-right font-normal">PF</th>
                    <th className="text-right font-normal">{tl("Moy.")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((b) => renaming === b.id ? (
                    <tr key={b.id} className="border-t border-line/50">
                      <td colSpan={9} className="py-2">{renameForm(b)}</td>
                    </tr>
                  ) : (
                    <tr key={b.id} onClick={() => router.push(`/backtests/${b.id}`)} className="cursor-pointer border-t border-line/50 hover:bg-panel-2">
                      <td className="py-1.5">
                        <div className="flex items-center gap-1">
                          {b.name}
                          <RenameButton onClick={() => setRenaming(b.id)} />
                        </div>
                        <div className="text-[11px] text-muted">{date(b.createdAt)}</div>
                      </td>
                      <td>
                        {b.symbol} {b.interval}
                      </td>
                      <td className="text-xs text-muted">
                        {b.startDate} → {b.endDate}
                      </td>
                      <td className="text-right">{b.summary.trades}</td>
                      <td className={`text-right ${tone(b.summary.totalReturnPercent)}`}>{pct(b.summary.totalReturnPercent)}</td>
                      <td className="text-right text-down">{pct(-b.summary.maxDrawdownPercent)}</td>
                      <td className="text-right">{pct(b.summary.winRate, 0, false)}</td>
                      <td className="text-right">{num(b.summary.profitFactor)}</td>
                      <td className={`text-right ${tone(b.summary.avgR)}`}>{b.summary.avgR !== null ? r(b.summary.avgR) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
          {query && shown?.length === BACKTEST_LIST_LIMIT && (
            <p className="mt-2 text-xs text-muted">{tl("Seuls les {0} résultats les plus récents sont affichés : précise ta recherche.", [BACKTEST_LIST_LIMIT])}</p>
          )}
        </Card>
        <Card
          title={tl("Mes stratégies")}
          actions={
            <Link href="/strategies/new" className="text-xs text-accent hover:underline">
              {tl("+ nouvelle")}
            </Link>
          }
        >
          {shownStrategies === null ? (
            <p className="text-sm text-muted">{tl("Chargement…")}</p>
          ) : shownStrategies.length === 0 ? (
            <p className="text-sm text-muted">{query ? tl("Aucune stratégie trouvée.") : tl("Aucune stratégie enregistrée.")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line/50">
              {shownStrategies.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
                  <Link href={`/strategies/${s.id}`} className="flex-1 hover:text-accent">
                    {s.name}
                    <div className="text-[11px] text-muted">
                      {s.strategy.symbol} · {s.strategy.interval} · {s.strategy.style}
                    </div>
                  </Link>
                  <Link href={`/live?strategy=${s.id}`} className="text-xs text-muted hover:text-fg">
                    {tl("live")}
                  </Link>
                  <button onClick={() => remove(s.id)} className="text-xs text-muted hover:text-down">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
