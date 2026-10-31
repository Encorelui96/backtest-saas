"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { welcomeDone } from "@/lib/client/preferences";
import { date, num, pct, r, tone } from "@/lib/client/format";
import type { Strategy } from "@/lib/strategy/schema";
import type { BacktestSummary } from "@/lib/server/backtests";
import { Button, Card } from "./ui";
import { CandleHero } from "./candle-hero";
import { TickerTape } from "./ticker-tape";
import { useBeginner } from "./learn";
import { PmfSurvey } from "./pmf-survey";
import { Welcome } from "./welcome";

interface Me {
  usage: { plan: { id: string; label: string; backtestsPerMonth: number; aiPerMonth: number }; backtests: number; ai: number; resetsAt: string } | null;
  surveyAnswered: boolean;
}

/** From 80 % of a monthly quota: says how much is left and where the bigger offers are. */
function QuotaBanner({ usage }: { usage: NonNullable<Me["usage"]> }) {
  if (usage.plan.id === "pro") return null;
  const items = [
    { used: usage.backtests, max: usage.plan.backtestsPerMonth, what: "backtests" },
    { used: usage.ai, max: usage.plan.aiPerMonth, what: "traductions par l'IA" },
  ].filter((i) => i.used >= 0.8 * i.max);
  if (!items.length) return null;
  const reset = new Date(usage.resetsAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-sm">
      <span className="flex-1">
        {items.map((i) => `${Math.min(i.used, i.max)} de tes ${i.max} ${i.what}`).join(" et ")} du mois sont utilisés (offre {usage.plan.label}). Compteurs remis à zéro le {reset}.
      </span>
      <Link href="/tarifs" className="font-medium text-accent hover:underline">
        Voir les offres →
      </Link>
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
  if (s.trades < 30) return { label: "Trop peu de trades", style: "border-line text-muted" };
  if (s.totalReturnPercent <= 0) return { label: "Perdante", style: "border-down/40 text-down" };
  if (s.profitFactor !== null && s.profitFactor >= 1.3) return { label: "Prometteuse", style: "border-up/40 text-up" };
  return { label: "Fragile", style: "border-warn/40 text-warn" };
}

/** Beginner mode: three first steps that tick themselves as the user goes. */
function FirstSteps({ backtests }: { backtests: BacktestRow[] }) {
  const markets = new Set(backtests.map((b) => b.symbol)).size;
  const steps = [
    { done: backtests.length > 0, text: "Lancer ton premier backtest", href: "/strategies/new" },
    { done: markets >= 2, text: "Tester la même idée sur un autre marché", href: "/strategies/new" },
    { done: backtests.length >= 3, text: "Comparer au moins 3 tests", href: "/strategies/new" },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <Card title="Tes premiers pas">
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
        Les mots du trading expliqués simplement →
      </Link>
    </Card>
  );
}

export function Dashboard() {
  const router = useRouter();
  const beginner = useBeginner();
  const [strategies, setStrategies] = useState<{ id: string; name: string; strategy: Strategy; updatedAt: number }[] | null>(null);
  const [backtests, setBacktests] = useState<BacktestRow[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  // The dashboard only renders in the browser (after the session check), so storage can be read here.
  const [welcome, setWelcome] = useState(() => !welcomeDone());

  useEffect(() => {
    api<typeof strategies>("/api/strategies").then(setStrategies).catch(() => setStrategies([]));
    api<BacktestRow[]>("/api/backtests").then(setBacktests).catch(() => setBacktests([]));
    api<Me>("/api/me").then(setMe).catch(() => {});
  }, []);

  const remove = async (id: string) => {
    if (!confirm("Supprimer cette stratégie ? Ses backtests restent consultables.")) return;
    await api(`/api/strategies/${id}`, { method: "DELETE" });
    setStrategies((s) => s?.filter((x) => x.id !== id) ?? null);
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="relative -mx-3 h-40 overflow-hidden border-y border-line bg-panel/40 sm:mx-0 sm:h-44 sm:rounded-xl sm:border">
        <CandleHero className="absolute inset-0" density={1.4} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-bg/95 via-bg/70 to-transparent" />
        <div className="relative flex h-full flex-col justify-center gap-2 px-4 sm:px-6">
          <h1 className="text-xl font-semibold sm:text-2xl">Une idée de stratégie ?</h1>
          <p className="max-w-sm text-sm text-fg/75">Teste-la sur des années de cours avant d&apos;y mettre un euro.</p>
          <div>
            <Link href="/strategies/new" className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-accent/30 hover:brightness-110">
              Nouveau backtest
            </Link>
          </div>
        </div>
      </section>

      <TickerTape />

      {me?.usage && <QuotaBanner usage={me.usage} />}
      {welcome && backtests !== null && backtests.length === 0 ? (
        <Welcome onDone={() => setWelcome(false)} />
      ) : (
        beginner && backtests !== null && <FirstSteps backtests={backtests} />
      )}
      {me && !me.surveyAnswered && backtests !== null && backtests.length >= 3 && <PmfSurvey />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card title={beginner ? "Mes tests" : "Derniers backtests"}>
          {backtests === null ? (
            <p className="text-sm text-muted">Chargement…</p>
          ) : backtests.length === 0 ? (
            <div className="flex flex-col items-start gap-3 text-sm text-muted">
              <p>Aucun backtest pour l&apos;instant. Décris une stratégie en français ou pars d&apos;un modèle.</p>
              <Button onClick={() => router.push("/strategies/new")}>Créer ma première stratégie</Button>
            </div>
          ) : beginner ? (
            <ul className="-my-1 flex flex-col divide-y divide-line/50">
              {backtests.map((b) => {
                const v = verdict(b.summary);
                return (
                  <li key={b.id}>
                    <Link href={`/backtests/${b.id}`} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{b.name}</div>
                        <div className="text-[11px] text-muted">
                          {b.symbol} · {date(b.createdAt, false)}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${v.style}`}>{v.label}</span>
                      <span className={`num w-16 shrink-0 text-right text-sm font-semibold ${tone(b.summary.totalReturnPercent)}`}>{pct(b.summary.totalReturnPercent)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <>
            {/* Phones: one card per backtest. */}
            <ul className="-my-1 flex flex-col divide-y divide-line/50 md:hidden">
              {backtests.map((b) => (
                <li key={b.id}>
                  <Link href={`/backtests/${b.id}`} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{b.name}</div>
                      <div className="text-[11px] text-muted">
                        {b.symbol} {b.interval} · {b.summary.trades} trades · {b.startDate.slice(0, 4)}→{b.endDate.slice(0, 4)}
                      </div>
                    </div>
                    <div className="num text-right">
                      <div className={`text-sm font-semibold ${tone(b.summary.totalReturnPercent)}`}>{pct(b.summary.totalReturnPercent)}</div>
                      <div className="text-[11px] text-down">{pct(-b.summary.maxDrawdownPercent)} max</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="num w-full text-sm">
                <thead className="text-xs text-muted">
                  <tr className="text-left">
                    <th className="font-normal">Stratégie</th>
                    <th className="font-normal">Marché</th>
                    <th className="font-normal">Période</th>
                    <th className="text-right font-normal">Trades</th>
                    <th className="text-right font-normal">Rendement</th>
                    <th className="text-right font-normal">Baisse max</th>
                    <th className="text-right font-normal">Gagnants</th>
                    <th className="text-right font-normal">PF</th>
                    <th className="text-right font-normal">Moy.</th>
                  </tr>
                </thead>
                <tbody>
                  {backtests.map((b) => (
                    <tr key={b.id} onClick={() => router.push(`/backtests/${b.id}`)} className="cursor-pointer border-t border-line/50 hover:bg-panel-2">
                      <td className="py-1.5">
                        {b.name}
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
        </Card>
        <Card
          title="Mes stratégies"
          actions={
            <Link href="/strategies/new" className="text-xs text-accent hover:underline">
              + nouvelle
            </Link>
          }
        >
          {strategies === null ? (
            <p className="text-sm text-muted">Chargement…</p>
          ) : strategies.length === 0 ? (
            <p className="text-sm text-muted">Aucune stratégie enregistrée.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line/50">
              {strategies.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
                  <Link href={`/strategies/${s.id}`} className="flex-1 hover:text-accent">
                    {s.name}
                    <div className="text-[11px] text-muted">
                      {s.strategy.symbol} · {s.strategy.interval} · {s.strategy.style}
                    </div>
                  </Link>
                  <Link href={`/live?strategy=${s.id}`} className="text-xs text-muted hover:text-fg">
                    live
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
