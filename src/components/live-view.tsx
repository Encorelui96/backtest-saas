"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client/api";
import { date, num, pct, price, r, tone } from "@/lib/client/format";
import type { Trade } from "@/lib/engine/backtest";
import type { Strategy } from "@/lib/strategy/schema";
import { INTERVALS, INTERVAL_MS, type CandleRow, type Interval } from "@/lib/types";
import { isCrypto } from "@/lib/markets";
import { MarketPicker } from "./market-picker";
import { PriceChart, type ChartMarker, type PriceChartHandle } from "./charts";
import { Alert, Card, Field } from "./ui";

const WS_BASE = process.env.NEXT_PUBLIC_BINANCE_WS_URL ?? "wss://data-stream.binance.vision";

interface ConditionState {
  label: string;
  left: number;
  right: number;
  pass: boolean;
}
interface GroupState {
  conditions: ConditionState[];
}
interface LiveData {
  candles: CandleRow[];
  forming: CandleRow | null;
  lastClosedTime: number;
  signalNow: "long" | "short" | null;
  openTrade: Trade | null;
  recentTrades: Trade[];
  markers: { t: number; kind: "long" | "short" }[];
  entryLong: GroupState[];
  entryShort: GroupState[];
  exitLong: GroupState[];
  exitShort: GroupState[];
  overlays: { label: string; points: { t: number; v: number }[] }[];
}

export function LiveView() {
  const params = useSearchParams();
  const router = useRouter();
  const strategyId = params.get("strategy");
  const [strategies, setStrategies] = useState<{ id: string; name: string; strategy: Strategy }[]>([]);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval_] = useState<Interval>("15m");
  const [data, setData] = useState<LiveData | null>(null);
  const [plain, setPlain] = useState<CandleRow[]>([]);
  const [last, setLast] = useState<CandleRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const chart = useRef<PriceChartHandle>(null);

  const strategy = strategies.find((s) => s.id === strategyId)?.strategy ?? null;
  const sym = strategy?.symbol ?? symbol;
  const ivl = strategy?.interval ?? interval;

  useEffect(() => {
    api<{ id: string; name: string; strategy: Strategy }[]>("/api/strategies").then(setStrategies).catch((e) => setError(e.message));
  }, []);

  const refresh = useCallback(() => {
    const to = Date.now();
    const load = strategy
      ? api<LiveData>("/api/live", { json: { strategy } }).then((res) => {
          setData(res);
          if (res.forming) setLast(res.forming);
        })
      : api<CandleRow[]>(`/api/candles?symbol=${sym}&interval=${ivl}&from=${to - 400 * INTERVAL_MS[ivl]}&to=${to}`).then((rows) => {
          setData(null);
          setPlain(rows);
        });
    return load.then(
      () => setError(null),
      (e: Error) => setError(e.message),
    );
  }, [strategy, sym, ivl]);

  useEffect(() => {
    if (strategyId && !strategies.length) return;
    refresh();
  }, [refresh, strategyId, strategies.length]);

  const crypto = isCrypto(sym);

  // Forex, gold and the Nasdaq have no stream the browser can open, and a small daily quota: poll every 5 minutes.
  useEffect(() => {
    if (crypto) return;
    const timer = setInterval(refresh, 5 * 60_000);
    return () => clearInterval(timer);
  }, [crypto, refresh]);

  // Live candle stream; a closed candle triggers a re-evaluation of the strategy.
  useEffect(() => {
    if (!crypto) return;
    const ws = new WebSocket(`${WS_BASE}/ws/${sym.toLowerCase()}@kline_${ivl}`);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => {
      const k = JSON.parse(ev.data).k;
      if (!k) return;
      const row: CandleRow = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v };
      setLast(row);
      chart.current?.update(row);
      if (k.x) setTimeout(refresh, 1500);
    };
    return () => ws.close();
  }, [crypto, sym, ivl, refresh]);

  const candles = useMemo(() => (data ? data.candles : plain), [data, plain]);
  const markers = useMemo<ChartMarker[]>(() => {
    if (!data) return [];
    const out: ChartMarker[] = data.markers.map((m) => ({ t: m.t, kind: m.kind }));
    for (const t of data.recentTrades) out.push({ t: t.exitTime, kind: t.pnl > 0 ? "exit-win" : "exit-loss" });
    return out;
  }, [data]);
  const priceLines = useMemo(() => {
    const t = data?.openTrade;
    if (!t) return [];
    return [
      { price: t.entryPrice, color: "#8a97ab", title: "Entrée" },
      ...(t.stopPrice ? [{ price: t.stopPrice, color: "#ef4444", title: "Stop" }] : []),
      ...(t.targetPrice ? [{ price: t.targetPrice, color: "#22c55e", title: "Objectif" }] : []),
    ];
  }, [data]);

  // Without a stream, the latest price is the last closed candle.
  const lastBar = crypto ? last : (candles.at(-1) ?? null);
  const open = data?.openTrade ?? null;
  const unrealized = open && lastBar ? ((open.side === "long" ? 1 : -1) * (lastBar.c - open.entryPrice)) / open.entryPrice * 100 : null;
  const change = lastBar && candles.length ? ((lastBar.c - candles[0].o) / candles[0].o) * 100 : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Stratégie">
          <select value={strategyId ?? ""} onChange={(e) => router.push(e.target.value ? `/live?strategy=${e.target.value}` : "/live")} className="min-w-56">
            <option value="">Aucune (graphique seul)</option>
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.strategy.symbol} {s.strategy.interval}
              </option>
            ))}
          </select>
        </Field>
        {!strategy && (
          <>
            <Field label="Unité de temps">
              <select value={interval} onChange={(e) => setInterval_(e.target.value as Interval)}>
                {INTERVALS.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </select>
            </Field>
          </>
        )}
        <div className="ml-auto text-right">
          <div className="num text-2xl font-semibold">{lastBar ? price(lastBar.c) : "—"}</div>
          <div className="text-xs text-muted">
            {sym} · {ivl} ·{" "}
            {crypto ? (
              <span className={connected ? "text-up" : "text-down"}>{connected ? "● en direct" : "● déconnecté"}</span>
            ) : (
              <span className="text-warn" title="Forex, or et Nasdaq : actualisé toutes les 5 minutes.">
                ● toutes les 5 min{lastBar ? ` (dernière bougie : ${date(lastBar.t)})` : ""}
              </span>
            )}
            {change !== null && <span className={`ml-2 ${tone(change)}`}>{pct(change, 2)} sur l&apos;écran</span>}
          </div>
        </div>
      </div>
      {!strategy && (
        <Card>
          <MarketPicker value={symbol} onChange={setSymbol} />
        </Card>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <PriceChart ref={chart} candles={candles} markers={markers} overlays={data?.overlays ?? []} priceLines={priceLines} height={480} />
        </Card>
        <div className="flex flex-col gap-4">
          {strategy && data ? (
            <>
              <Card title="Situation">
                {open ? (
                  <div className="flex flex-col gap-1 text-sm">
                    <div className={open.side === "long" ? "text-up" : "text-down"}>
                      Position {open.side === "long" ? "acheteuse" : "vendeuse"} ouverte depuis le {date(open.entryTime)}
                    </div>
                    <div>Entrée : {price(open.entryPrice)}</div>
                    {open.stopPrice && <div>Stop : {price(open.stopPrice)}</div>}
                    {open.targetPrice && <div>Objectif : {price(open.targetPrice)}</div>}
                    <div className={`num font-semibold ${tone(unrealized)}`}>Latent : {pct(unrealized, 2)}</div>
                  </div>
                ) : data.signalNow ? (
                  <div className={`text-sm font-semibold ${data.signalNow === "long" ? "text-up" : "text-down"}`}>
                    Signal {data.signalNow === "long" ? "d'ACHAT" : "de VENTE"} à la clôture du {date(data.lastClosedTime + INTERVAL_MS[ivl])} : entrée à l&apos;ouverture.
                  </div>
                ) : (
                  <div className="text-sm text-muted">Pas de position, pas de signal sur la dernière bougie close.</div>
                )}
                <p className="mt-2 text-[11px] text-muted">Recalculé à chaque clôture de bougie. Ce que la stratégie aurait fait, pas un ordre passé.</p>
              </Card>
              <ConditionsCard title="Conditions d'achat" groups={data.entryLong} />
              <ConditionsCard title="Conditions de vente" groups={data.entryShort} />
              <ConditionsCard title="Sortie d'un achat" groups={data.exitLong} />
              <ConditionsCard title="Sortie d'une vente" groups={data.exitShort} />
              {data.recentTrades.length > 0 && (
                <Card title="Derniers trades simulés">
                  <table className="num w-full text-xs">
                    <tbody>
                      {data.recentTrades
                        .slice()
                        .reverse()
                        .map((t, i) => (
                          <tr key={i} className="border-t border-line/50">
                            <td className="py-1">{date(t.entryTime)}</td>
                            <td className={t.side === "long" ? "text-up" : "text-down"}>{t.side === "long" ? "Achat" : "Vente"}</td>
                            <td className={`text-right ${tone(t.pnl)}`}>{t.r !== null ? r(t.r) : pct(t.pnlPercent, 2)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </Card>
              )}
            </>
          ) : (
            <Card title="Suivi d'une stratégie">
              <p className="text-sm text-muted">Choisis une stratégie enregistrée pour voir ses signaux et l&apos;état de chaque condition, mis à jour à chaque clôture de bougie.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ConditionsCard({ title, groups }: { title: string; groups: GroupState[] }) {
  if (!groups.length) return null;
  return (
    <Card title={title}>
      <div className="flex flex-col gap-2">
        {groups.map((g, gi) => (
          <div key={gi} className="flex flex-col gap-1">
            {gi > 0 && <div className="text-xs font-semibold text-accent">OU</div>}
            {g.conditions.map((c, ci) => (
              <div key={ci} className="flex items-start gap-2 text-xs">
                <span className={c.pass ? "text-up" : "text-down"}>{c.pass ? "✓" : "✗"}</span>
                <span className="flex-1">{c.label}</span>
                <span className="num text-muted">
                  {fmt(c.left)} / {fmt(c.right)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

function fmt(x: number) {
  if (x === null || !Number.isFinite(x)) return "—";
  return Math.abs(x) >= 1000 ? num(x, 0) : Math.abs(x) >= 1 ? num(x, 2) : num(x, 4);
}
