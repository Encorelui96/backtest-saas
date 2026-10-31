"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { date, num, pct, r, tone } from "@/lib/client/format";
import type { Strategy } from "@/lib/strategy/schema";
import type { BacktestSummary } from "@/lib/server/backtests";
import { Button, Card } from "./ui";
import { CandleHero } from "./candle-hero";
import { TickerTape } from "./ticker-tape";

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

export function Dashboard() {
  const router = useRouter();
  const [strategies, setStrategies] = useState<{ id: string; name: string; strategy: Strategy; updatedAt: number }[] | null>(null);
  const [backtests, setBacktests] = useState<BacktestRow[] | null>(null);

  useEffect(() => {
    api<typeof strategies>("/api/strategies").then(setStrategies).catch(() => setStrategies([]));
    api<BacktestRow[]>("/api/backtests").then(setBacktests).catch(() => setBacktests([]));
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card title="Derniers backtests">
          {backtests === null ? (
            <p className="text-sm text-muted">Chargement…</p>
          ) : backtests.length === 0 ? (
            <div className="flex flex-col items-start gap-3 text-sm text-muted">
              <p>Aucun backtest pour l&apos;instant. Décris une stratégie en français ou pars d&apos;un modèle.</p>
              <Button onClick={() => router.push("/strategies/new")}>Créer ma première stratégie</Button>
            </div>
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
