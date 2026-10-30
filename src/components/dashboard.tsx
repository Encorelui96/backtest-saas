"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { date, num, pct, price, r, tone } from "@/lib/client/format";
import type { Strategy } from "@/lib/strategy/schema";
import type { BacktestSummary } from "@/lib/server/backtests";
import { Button, Card } from "./ui";

const WS_BASE = process.env.NEXT_PUBLIC_BINANCE_WS_URL ?? "wss://data-stream.binance.vision";
const WATCH = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];

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
  const [tickers, setTickers] = useState<Record<string, { c: number; p: number }>>({});
  const [strategies, setStrategies] = useState<{ id: string; name: string; strategy: Strategy; updatedAt: number }[] | null>(null);
  const [backtests, setBacktests] = useState<BacktestRow[] | null>(null);

  useEffect(() => {
    api<typeof strategies>("/api/strategies").then(setStrategies).catch(() => setStrategies([]));
    api<BacktestRow[]>("/api/backtests").then(setBacktests).catch(() => setBacktests([]));
  }, []);

  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE}/stream?streams=${WATCH.map((s) => `${s.toLowerCase()}@miniTicker`).join("/")}`);
    ws.onmessage = (ev) => {
      const d = JSON.parse(ev.data).data;
      if (!d) return;
      setTickers((t) => ({ ...t, [d.s]: { c: +d.c, p: ((+d.c - +d.o) / +d.o) * 100 } }));
    };
    return () => ws.close();
  }, []);

  const remove = async (id: string) => {
    if (!confirm("Supprimer cette stratégie ? Ses backtests restent consultables.")) return;
    await api(`/api/strategies/${id}`, { method: "DELETE" });
    setStrategies((s) => s?.filter((x) => x.id !== id) ?? null);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {WATCH.map((s) => (
          <Link key={s} href={`/live`} className="rounded-lg border border-line bg-panel px-3 py-2 hover:border-accent">
            <div className="text-xs text-muted">{s.replace("USDT", " / USDT")}</div>
            <div className="num text-lg font-semibold">{tickers[s] ? price(tickers[s].c) : "—"}</div>
            <div className={`num text-xs ${tone(tickers[s]?.p)}`}>{tickers[s] ? `${pct(tickers[s].p, 2)} sur 24 h` : "connexion…"}</div>
          </Link>
        ))}
      </div>

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
            <div className="overflow-x-auto">
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
