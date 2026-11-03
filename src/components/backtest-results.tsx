"use client";

import { tr } from "@/lib/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, rich, useT, useText } from "@/lib/client/i18n";
import { api } from "@/lib/client/api";
import { date, money, num, pct, price, r, tone } from "@/lib/client/format";
import type { BacktestReport } from "@/lib/engine/report";
import type { Trade } from "@/lib/engine/backtest";
import type { BacktestConfig, Strategy } from "@/lib/strategy/schema";
import { stopLabel, targetLabel } from "@/lib/strategy/describe";
import { INTERVAL_MS, type CandleRow } from "@/lib/types";
import { EquityChart, PriceChart, type ChartMarker, type PriceChartHandle } from "./charts";
import { Help, Term, Tip, useBeginner } from "./learn";
import { EXIT_LABELS, tradeEvents } from "@/lib/engine/insights";
import { EVENT_KINDS, type EventKind } from "@/lib/engine/calendar";
import { PropFirmPanel } from "./prop-firm-panel";
import { SharePanel } from "./share-panel";
import { AnalysisPanel, RiskPanel } from "./trade-insights";
import { Alert, Button, Card, Stat, Tabs } from "./ui";

interface Stored {
  id: string;
  strategyId: string | null;
  strategy: Strategy;
  config: BacktestConfig;
  report: BacktestReport;
  createdAt: number;
  /** The owner's public link, if any (absent from shared views). */
  share?: { id: string; featured: boolean } | null;
}

type Tab = "overview" | "trades" | "analysis" | "robustness" | "risk" | "prop";

/** "3 ans", "8 mois": the length of a test period, rounded. */
function spanLabel(ms: number) {
  const years = Math.round(ms / (365.25 * 86_400_000));
  if (years >= 1) return years > 1 ? tr("{0} ans", [years]) : tr("1 an");
  return tr("{0} mois", [Math.max(1, Math.round(ms / (30.44 * 86_400_000)))]);
}

/** `shared`: `id` is a public link id, the report is read-only and anyone can open it. */
export function BacktestResults({ id, shared = false }: { id: string; shared?: boolean }) {
  const tl = useT();
  const tx = useText();
  const [data, setData] = useState<Stored | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The first render shows "loading" on the server and in the browser alike, so reading the address here can't mismatch.
  const [tab, setTab] = useState<Tab>(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "prop" ? "prop" : "overview"));
  const [selected, setSelected] = useState<number | null>(null);
  const beginner = useBeginner();

  useEffect(() => {
    api<Stored>(shared ? `/api/r/${id}` : `/api/backtests/${id}`).then(setData).catch((e) => setError(e.message));
  }, [id, shared]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <p className="text-muted">{tl("Chargement…")}</p>;
  const { report, strategy, config } = data;
  const m = report.metrics;
  const hasR = m.avgR !== null;

  return (
    <div className="flex flex-col gap-4">
      {shared && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
          <span>
            {tl("Rapport partagé : stratégie testée sur ")}{spanLabel(report.period.to - report.period.from)} {tl(" de cours réels avec ")}<span className="font-semibold">{tl("Backtest Lab")}</span>.
          </span>
          <Link href="/connexion?mode=signup" className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:brightness-110">
            {tl("Teste ta propre idée gratuitement")}</Link>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{strategy.name}</h1>
          <p className="text-sm text-muted">
            {strategy.symbol} · {strategy.interval} · {date(report.period.from, false)} → {date(report.period.to, false)} {tl(" · capital {0} · frais {1} % / côté", [money(config.initialCapital), config.feePercent])}</p>
        </div>
        {!shared && (
          <div className="flex flex-wrap gap-2">
            {data.strategyId && (
              <Link href={`/strategies/${data.strategyId}`}>
                <Button variant="ghost">{tl("Modifier et relancer")}</Button>
              </Link>
            )}
            {data.strategyId && (
              <Link href={`/live?strategy=${data.strategyId}`}>
                <Button variant="ghost">{tl("Suivre en direct")}</Button>
              </Link>
            )}
            <SharePanel backtestId={id} initial={data.share ?? null} />
          </div>
        )}
      </div>

      {report.warnings.map((w, i) => (
        <Alert key={i}>{tx(w)}</Alert>
      ))}

      {beginner ? (
        // Beginners: the four numbers that matter most, each with its "?", then the guided reading.
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2 md:grid-cols-4">
          <Stat label={tl("Rendement total")} term="rendement" value={pct(m.totalReturnPercent)} className={tone(m.totalReturnPercent)} hint={tl("Acheter et garder : {0}", [pct(m.buyAndHoldPercent)])} />
          <Stat label={tl("Baisse max")} term="drawdown" value={pct(-m.maxDrawdownPercent)} className="text-down" hint={tl("≈ {0} au pire moment", [money((data.config.initialCapital * m.maxDrawdownPercent) / 100)])} />
          <Stat label={tl("Trades")} term="trades" value={m.trades} hint={m.trades < 30 ? tl("trop peu pour conclure") : tl("{0} par mois", [num(m.tradesPerMonth, 1)])} />
          <Stat label={tl("Profit factor")} term="profit-factor" value={num(m.profitFactor)} className={m.profitFactor !== null ? (m.profitFactor >= 1 ? "text-up" : "text-down") : ""} hint={tl("{0} de gagnants", [pct(m.winRate, 0, false)])} />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 md:grid-cols-4 lg:grid-cols-8">
          <Stat label={tl("Rendement total")} term="rendement" value={pct(m.totalReturnPercent)} className={tone(m.totalReturnPercent)} hint={`B&H ${pct(m.buyAndHoldPercent)}`} />
          <Stat label="CAGR" term="rendement-annuel" value={pct(m.cagrPercent)} className={tone(m.cagrPercent)} />
          <Stat label={tl("Max DD")} term="drawdown" value={pct(-m.maxDrawdownPercent)} className="text-down" />
          <Stat label={tl("Trades")} term="trades" value={m.trades} hint={`${num(m.tradesPerMonth, 1)} / mois`} />
          <Stat label={tl("Win rate")} term="gagnants" value={pct(m.winRate, 0, false)} />
          <Stat label={tl("Profit factor")} term="profit-factor" value={num(m.profitFactor)} className={m.profitFactor !== null ? (m.profitFactor >= 1 ? "text-up" : "text-down") : ""} />
          <Stat label={tl("Espérance")} term="gain-moyen" value={hasR ? r(m.avgR) : pct(m.avgTradePercent, 2)} className={tone(hasR ? m.avgR : m.avgTradePercent)} />
          <Stat label={tl("Sharpe")} term="sharpe" value={num(m.sharpe)} hint={tl("Sortino {0}", [num(m.sortino)])} />
        </div>
      )}

      <GuidedReading data={data} onOpenRobustness={() => setTab("robustness")} />

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: tl("Vue d'ensemble") },
          { id: "trades", label: tl("Trades ({0})", [m.trades]) },
          { id: "analysis", label: tl("Analyse") },
          { id: "robustness", label: tl("Robustesse") },
          { id: "risk", label: tl("Risque") },
          { id: "prop", label: tl("Challenge prop firm") },
        ]}
      />

      {tab === "overview" && <Overview data={data} selected={selected} onSelect={setSelected} shared={shared} />}
      {tab === "trades" && (
        <TradesTable
          trades={report.trades}
          hasR={hasR}
          onSelect={(i) => {
            setSelected(i);
            setTab("overview");
          }}
        />
      )}
      {tab === "analysis" && <AnalysisPanel trades={report.trades} strategy={strategy} period={report.period} />}
      {tab === "robustness" && <Robustness report={report} hasR={hasR} />}
      {tab === "risk" && <RiskPanel trades={report.trades} strategy={strategy} />}
      {tab === "prop" && <PropFirmPanel trades={report.trades} strategy={strategy} />}
    </div>
  );
}

/**
 * Beginner mode: one verdict and one piece of advice. The numbers themselves
 * are already in the four cards above; the details are one tap away.
 */
function GuidedReading({ data, onOpenRobustness }: { data: Stored; onOpenRobustness: () => void }) {
  const tl = useT();
  const beginner = useBeginner();
  if (!beginner) return null;
  const m = data.report.metrics;
  const solid = robustnessVerdict(data.report).tone === "info";
  const [tone, title, advice]: ["good" | "meh" | "bad", string, string] =
    m.trades < 30
      ? ["meh", tl("Pas assez de trades pour juger."), tl("Allonge la période (bouton « 5 ans ») ou choisis une unité de temps plus courte.")]
      : m.totalReturnPercent <= 0
        ? ["bad", tl("Cette stratégie perd de l'argent."), tl("Essaie un autre modèle ou un autre marché.")]
        : solid
          ? ["good", tl("Résultat encourageant."), tl("Suis-la en direct quelques semaines avant d'y mettre de l'argent.")]
          : ["meh", tl("Gagnante, mais fragile."), tl("Le gain vient peut-être en partie du hasard : regarde pourquoi avant d'aller plus loin.")];
  const style = { good: "border-up/40 bg-up/10 text-up", meh: "border-warn/40 bg-warn/10 text-warn", bad: "border-down/40 bg-down/10 text-down" }[tone];
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 ${style}`}>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-fg/80">{advice}</div>
      </div>
      <button onClick={onOpenRobustness} className="shrink-0 text-sm text-accent hover:underline">
        {tl("Pourquoi ? →")}
      </button>
    </div>
  );
}

/** `shared`: no price chart, the market data providers' licences only cover the account holders' own use. */
function Overview({ data, selected, onSelect, shared }: { data: Stored; selected: number | null; onSelect: (i: number | null) => void; shared: boolean }) {
  const tl = useT();
  const { report, strategy } = data;
  const m = report.metrics;
  const [candles, setCandles] = useState<CandleRow[]>([]);
  const [loadedFor, setLoadedFor] = useState<number | null | undefined>(undefined);
  const loading = loadedFor !== selected;
  const chart = useRef<PriceChartHandle>(null);
  const ms = INTERVAL_MS[strategy.interval];
  const beginner = useBeginner();

  // Load the candles around the selected trade, or the end of the test period.
  useEffect(() => {
    if (shared) return;
    const t = selected !== null ? report.trades[selected] : null;
    const to = t ? Math.min(report.period.to, t.exitTime + 80 * ms) : report.period.to;
    const from = t ? t.entryTime - 150 * ms : Math.max(report.period.from, to - 1500 * ms);
    api<CandleRow[]>(`/api/candles?symbol=${strategy.symbol}&interval=${strategy.interval}&from=${from}&to=${to}`)
      .then((rows) => {
        setCandles(rows);
        if (t) setTimeout(() => chart.current?.focus(t.entryTime - 40 * ms, t.exitTime + 40 * ms), 50);
      })
      .catch(() => setCandles([]))
      .finally(() => setLoadedFor(selected));
  }, [selected, report, strategy, ms, shared]);

  const markers = useMemo<ChartMarker[]>(() => {
    if (!candles.length) return [];
    const from = candles[0].t;
    const to = candles[candles.length - 1].t;
    const out: ChartMarker[] = [];
    for (const t of report.trades) {
      if (t.exitTime < from || t.entryTime > to) continue;
      out.push({ t: t.entryTime, kind: t.side === "long" ? "long" : "short" });
      out.push({ t: t.exitTime, kind: t.pnl > 0 ? "exit-win" : "exit-loss", text: t.r !== null ? r(t.r, 1) : pct(t.pnlPercent) });
    }
    return out;
  }, [candles, report.trades]);

  const sel = selected !== null ? report.trades[selected] : null;
  const priceLines = useMemo(
    () =>
      sel
        ? [
            { price: sel.entryPrice, color: "#8a97ab", title: tl("Entrée") },
            ...(sel.stopPrice ? [{ price: sel.stopPrice, color: "#ef4444", title: tl("Stop") }] : []),
            ...(sel.targetPrice ? [{ price: sel.targetPrice, color: "#22c55e", title: tl("Objectif") }] : []),
          ]
        : [],
    [sel],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex flex-col gap-4">
        <Card
          title={
            <span className="flex items-center">
              {tl("Courbe du capital")}<Help id="courbe-capital" />
            </span>
          }
        >
          <EquityChart points={report.equity} />
        </Card>
        {!shared && (
          <Card
            title={sel ? tl("Trade du {0} · {1} · {2}", [date(sel.entryTime), sel.side === "long" ? "achat" : "vente", sel.r !== null ? r(sel.r) : pct(sel.pnlPercent)]) : tl("Graphique des trades")}
            actions={
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
                {loading && <span className="text-muted">{tl("chargement…")}</span>}
                {selected !== null && (
                  <>
                    <button disabled={selected === 0} onClick={() => onSelect(selected - 1)} className="text-muted hover:text-fg disabled:opacity-30">
                      {tl("← précédent")}</button>
                    <button disabled={selected >= report.trades.length - 1} onClick={() => onSelect(selected + 1)} className="text-muted hover:text-fg disabled:opacity-30">
                      {tl("suivant →")}
                    </button>
                    <button onClick={() => onSelect(null)} className="text-muted hover:text-fg">
                      {tl("fin du test")}</button>
                  </>
                )}
                {selected === null && report.trades.length > 0 && (
                  <button onClick={() => onSelect(0)} className="text-accent hover:underline">
                    {tl("voir le premier trade")}</button>
                )}
              </div>
            }
          >
            <PriceChart ref={chart} candles={candles} markers={markers} priceLines={priceLines} />
          </Card>
        )}
        {!beginner && (
          <Card title={tl("Rendement par mois (%)")}>
            <MonthlyGrid rows={report.byMonth} />
          </Card>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <Card title={tl("Détails")}>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <Dt>{tl("Capital final")}</Dt>
            <Dd>{money(data.config.initialCapital * (1 + m.totalReturnPercent / 100))}</Dd>
            <Dt>{tl("Gain moyen gagnant")}</Dt>
            <Dd className="text-up">{m.avgWinR !== null ? r(m.avgWinR) : pct(m.avgWinPercent, 2)}</Dd>
            <Dt>{tl("Perte moyenne")}</Dt>
            <Dd className="text-down">{m.avgLossR !== null ? r(m.avgLossR) : pct(m.avgLossPercent, 2)}</Dd>
            <Dt>{tl("Meilleur trade")}</Dt>
            <Dd>{pct(m.bestTradePercent, 2)}</Dd>
            <Dt>{tl("Pire trade")}</Dt>
            <Dd>{pct(m.worstTradePercent, 2)}</Dd>
            <Dt term="pertes-affilee">{tl("Pertes d'affilée max")}</Dt>
            <Dd>{m.longestLosingStreak}</Dd>
            <Dt>{tl("Durée moyenne")}</Dt>
            <Dd>{tl("{0} bougies", [num(m.avgBars, 1)])}</Dd>
            <Dt term="exposition">{tl("Temps en position")}</Dt>
            <Dd>{pct(m.exposurePercent, 0, false)}</Dd>
            <Dt term="frais">{tl("Frais payés")}</Dt>
            <Dd>{money(m.totalCosts)}</Dd>
            <Dt term="stop">{tl("Stop")}</Dt>
            <Dd>{stopLabel(strategy)}</Dd>
            <Dt term="objectif">{tl("Objectif")}</Dt>
            <Dd>{targetLabel(strategy)}</Dd>
          </dl>
        </Card>
        <Card title={tl("Par année")}>
          <PeriodTable rows={report.byYear} hasR={m.avgR !== null} />
        </Card>
      </div>
    </div>
  );
}

const Dt = ({ children, term }: { children: React.ReactNode; term?: string }) => (
  <dt className="flex items-center text-muted">
    {children}
    {term && <Help id={term} />}
  </dt>
);
const Dd = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <dd className={`num text-right ${className}`}>{children}</dd>;

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/** Expert view: one row per year, one cell per month, coloured by return. */
function MonthlyGrid({ rows }: { rows: BacktestReport["byMonth"] }) {
  const tl = useT();
  if (!rows.length) return <p className="text-sm text-muted">{tl("Aucun trade.")}</p>;
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const years = [...new Set(rows.map((r) => r.key.slice(0, 4)))];
  const max = Math.max(...rows.map((r) => Math.abs(r.pnlPercent)), 0.01);
  return (
    <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
      <table className="num w-full min-w-[560px] text-[11px]">
        <thead className="text-muted">
          <tr>
            <th className="text-left font-normal"></th>
            {MONTHS.map((m, i) => (
              <th key={i} className="font-normal">
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y}>
              <td className="pr-2 text-muted">{y}</td>
              {MONTHS.map((_, i) => {
                const row = byKey.get(`${y}-${String(i + 1).padStart(2, "0")}`);
                const a = row ? Math.min(1, Math.abs(row.pnlPercent) / max) : 0;
                const bg = row ? (row.pnlPercent >= 0 ? `rgba(34,197,94,${0.12 + a * 0.5})` : `rgba(239,68,68,${0.12 + a * 0.5})`) : undefined;
                return (
                  <td key={i} className="p-0.5">
                    <div className="rounded px-1 py-1 text-center" style={{ background: bg }} title={row ? `${row.trades} trades` : undefined}>
                      {row ? num(row.pnlPercent, 1) : ""}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeriodTable({ rows, hasR }: { rows: BacktestReport["byYear"]; hasR: boolean }) {
  const tl = useT();
  if (!rows.length) return <p className="text-sm text-muted">{tl("Aucun trade.")}</p>;
  return (
    <table className="num w-full text-sm">
      <thead className="text-xs text-muted">
        <tr>
          <th className="text-left font-normal">{tl("Période")}</th>
          <th className="text-right font-normal">{tl("Trades")}</th>
          <th className="text-right font-normal">{tl("Rendement")}</th>
          {hasR && <th className="text-right font-normal">R</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-t border-line/50">
            <td>{row.key}</td>
            <td className="text-right">{row.trades}</td>
            <td className={`text-right ${tone(row.pnlPercent)}`}>{pct(row.pnlPercent)}</td>
            {hasR && <td className={`text-right ${tone(row.r)}`}>{num(row.r, 1)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const EVENT_SHORT = Object.fromEntries(EVENT_KINDS.map((k) => [k.kind, k.short])) as Record<EventKind, string>;
const EVENT_LABEL = Object.fromEntries(EVENT_KINDS.map((k) => [k.kind, k.label])) as Record<EventKind, string>;

/** "Fed · CPI": the announcements made while the trade was open. */
function EventTags({ kinds }: { kinds: EventKind[] }) {
  if (!kinds.length) return null;
  return (
    <span className="text-warn" title={kinds.map((k) => tr(EVENT_LABEL[k])).join(", ")}>
      {kinds.map((k) => tr(EVENT_SHORT[k])).join(" · ")}
    </span>
  );
}

function TradesTable({ trades, hasR, onSelect }: { trades: Trade[]; hasR: boolean; onSelect: (i: number) => void }) {
  const tl = useT();
  const [page, setPage] = useState(0);
  const size = 50;
  const rows = trades.slice(page * size, page * size + size);
  const exportCsv = () => {
    const header = "entree,sortie,sens,prix_entree,prix_sortie,raison,pnl,pnl_pct,r,bougies,annonces";
    const lines = trades.map((t) =>
      [
        new Date(t.entryTime).toISOString(),
        new Date(t.exitTime).toISOString(),
        t.side,
        t.entryPrice,
        t.exitPrice,
        t.exitReason,
        t.pnl.toFixed(2),
        t.pnlPercent.toFixed(3),
        t.r?.toFixed(3) ?? "",
        t.bars,
        tradeEvents(t).map((k) => EVENT_SHORT[k]).join("+"),
      ].join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "trades.csv";
    a.click();
  };
  return (
    <Card
      title={tl("Liste des trades")}
      actions={
        <Button variant="ghost" onClick={exportCsv}>
          {tl("Exporter en CSV")}</Button>
      }
    >
      {/* Phones: one compact row per trade. */}
      <ul className="-my-1 flex flex-col divide-y divide-line/50 md:hidden">
        {rows.map((t, k) => {
          const i = page * size + k;
          const kinds = tradeEvents(t);
          return (
            <li key={i}>
              <button onClick={() => onSelect(i)} className="flex w-full items-center gap-3 py-2 text-left">
                <span className="num w-7 text-xs text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <span className={t.side === "long" ? "text-up" : "text-down"}>{t.side === "long" ? tl("Achat") : tl("Vente")}</span> · {date(t.entryTime)}
                    {kinds.length > 0 && (
                      <span className="text-xs">
                        {" "}
                        · <EventTags kinds={kinds} />
                      </span>
                    )}
                  </div>
                  <div className="num text-[11px] text-muted">
                    {price(t.entryPrice)} → {price(t.exitPrice)} · {tl(EXIT_LABELS[t.exitReason])} · {tl("{0} bougies", [t.bars])}
                  </div>
                </div>
                <span className={`num text-sm font-semibold ${tone(t.pnl)}`}>{hasR ? r(t.r) : pct(t.pnlPercent, 2)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="num w-full text-sm">
          <thead className="text-xs text-muted">
            <tr className="text-left">
              <th className="font-normal">#</th>
              <th className="font-normal">{tl("Entrée")}</th>
              <th className="font-normal">{tl("Sens")}</th>
              <th className="text-right font-normal">{tl("Prix d'entrée")}</th>
              <th className="text-right font-normal">{tl("Prix de sortie")}</th>
              <th className="font-normal">{tl("Sortie")}</th>
              <th className="text-right font-normal">{tl("Durée")}</th>
              <th className="font-normal">
                <span className="inline-flex items-center">
                  {tl("Annonces")}<Help id="annonces-economiques" />
                </span>
              </th>
              <th className="text-right font-normal">{tl("Résultat")}</th>
              {hasR && <th className="text-right font-normal">R</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((t, k) => {
              const i = page * size + k;
              return (
                <tr key={i} onClick={() => onSelect(i)} className="cursor-pointer border-t border-line/50 hover:bg-panel-2">
                  <td className="text-muted">{i + 1}</td>
                  <td>{date(t.entryTime)}</td>
                  <td className={t.side === "long" ? "text-up" : "text-down"}>{t.side === "long" ? tl("Achat") : tl("Vente")}</td>
                  <td className="text-right">{price(t.entryPrice)}</td>
                  <td className="text-right">{price(t.exitPrice)}</td>
                  <td className="text-muted">{tl(EXIT_LABELS[t.exitReason])}</td>
                  <td className="text-right">{t.bars}</td>
                  <td className="text-xs">
                    <EventTags kinds={tradeEvents(t)} />
                  </td>
                  <td className={`text-right ${tone(t.pnl)}`}>{pct(t.pnlPercent, 2)}</td>
                  {hasR && <td className={`text-right ${tone(t.r)}`}>{r(t.r)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {trades.length > size && (
        <div className="mt-3 flex items-center gap-3 text-sm">
          <Button variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
            {tl("Précédents")}</Button>
          <span className="text-muted">
            {page + 1} / {Math.ceil(trades.length / size)}
          </span>
          <Button variant="ghost" disabled={(page + 1) * size >= trades.length} onClick={() => setPage(page + 1)}>
            {tl("Suivants")}</Button>
        </div>
      )}
    </Card>
  );
}

function Robustness({ report, hasR }: { report: BacktestReport; hasR: boolean }) {
  const tl = useT();
  const tx = useText();
  const { monteCarlo: mc, edge, split, sensitivity, doubleCosts } = report.robustness;
  const fmtAvg = (avgR: number | null, avgPct: number) => (hasR && avgR !== null ? r(avgR) : pct(avgPct, 2));
  const verdict = robustnessVerdict(report);
  return (
    <div className="flex flex-col gap-4">
      <Alert tone={verdict.tone}>
        <strong>{verdict.title}</strong> {verdict.text}
      </Alert>
      <Tip>
        {rich(tl("4 contrôles pour vérifier que le gain ne vient pas du {0}."), [<Term key="h" id="surajustement">{tl("hasard")}</Term>])}
      </Tip>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={tl("L'avantage est-il réel ?")}>
          {edge ? (
            <div className="flex flex-col gap-2 text-sm">
              <p>
                {tl("Gain moyen par trade : ")}<strong className={tone(edge.mean)}>{edge.unit === "R" ? r(edge.mean) : pct(edge.mean, 2)}</strong>{tl(", intervalle à 90 % :")}{" "}
                {edge.unit === "R" ? tl("{0} à {1}", [r(edge.ci90[0]), r(edge.ci90[1])]) : tl("{0} à {1}", [pct(edge.ci90[0], 2), pct(edge.ci90[1], 2)])}.
              </p>
              <p>
                {tl("Probabilité que le vrai gain moyen soit nul ou négatif : ")}<strong className={edge.probabilityNoEdge < 10 ? "text-up" : edge.probabilityNoEdge < 30 ? "text-warn" : "text-down"}>{pct(edge.probabilityNoEdge, 0, false)}</strong>
              </p>
              <p className="text-xs text-muted">{tl("Calculé en retirant au hasard les trades 5 000 fois. Sous 10 %, l'avantage a peu de chances d'être du hasard.")}</p>
            </div>
          ) : (
            <p className="text-sm text-muted">{tl("Il faut au moins 10 trades.")}</p>
          )}
        </Card>
        <Card title={tl("Étude puis validation sur la suite")}>
          <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
          <table className="num w-full min-w-[440px] text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="text-left font-normal">{tl("Période")}</th>
                <th className="text-right font-normal">{tl("Trades")}</th>
                <th className="text-right font-normal">{tl("Gagnants")}</th>
                <th className="text-right font-normal">{tl("Moyenne")}</th>
                <th className="text-right font-normal">{tl("Rendement")}</th>
              </tr>
            </thead>
            <tbody>
              {split.map((s) => (
                <tr key={s.label} className="border-t border-line/50">
                  <td>
                    {tx(s.label)}
                    <div className="text-xs text-muted">
                      {date(s.from, false)} → {date(Math.min(s.to, report.period.to), false)}
                    </div>
                  </td>
                  <td className="text-right">{s.trades}</td>
                  <td className="text-right">{pct(s.winRate, 0, false)}</td>
                  <td className={`text-right ${tone(s.avgR ?? s.avgTradePercent)}`}>{fmtAvg(s.avgR, s.avgTradePercent)}</td>
                  <td className={`text-right ${tone(s.returnPercent)}`}>{pct(s.returnPercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p className="mt-2 text-xs text-muted">{tl("Si la stratégie a été réglée en regardant tout l'historique, cette coupe ne remplace pas un vrai test sur des données jamais vues.")}</p>
        </Card>
        <Card title={tl("Monte Carlo : 2 000 ordres de trades différents")}>
          {mc ? (
            <div className="flex flex-col gap-2 text-sm">
              <table className="num w-full">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="text-left font-normal"></th>
                    <th className="text-right font-normal">{tl("Pessimiste (5 %)")}</th>
                    <th className="text-right font-normal">{tl("Médian")}</th>
                    <th className="text-right font-normal">{tl("Optimiste (95 %)")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-line/50">
                    <td>{tl("Rendement")}</td>
                    <td className={`text-right ${tone(mc.finalReturn.p5)}`}>{pct(mc.finalReturn.p5)}</td>
                    <td className={`text-right ${tone(mc.finalReturn.p50)}`}>{pct(mc.finalReturn.p50)}</td>
                    <td className={`text-right ${tone(mc.finalReturn.p95)}`}>{pct(mc.finalReturn.p95)}</td>
                  </tr>
                  <tr className="border-t border-line/50">
                    <td>{tl("Baisse max")}</td>
                    <td className="text-right text-down">{pct(-mc.maxDrawdown.p95)}</td>
                    <td className="text-right text-down">{pct(-mc.maxDrawdown.p50)}</td>
                    <td className="text-right text-down">{pct(-mc.maxDrawdown.p5)}</td>
                  </tr>
                </tbody>
              </table>
              <p>
                {tl("Chance de finir en perte : ")}<strong>{pct(mc.probabilityOfLoss, 0, false)}</strong> {tl(" · baisse de plus de 20 % : ")}<strong>{pct(mc.probabilityDrawdownOver["20"], 0, false)}</strong> {tl(" · plus de 30 % :")}{" "}
                <strong>{pct(mc.probabilityDrawdownOver["30"], 0, false)}</strong>
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">{tl("Il faut au moins 5 trades.")}</p>
          )}
        </Card>
        <Card title={tl("Frais doublés")}>
          <p className="text-sm">
            {rich(tl("Avec des frais, un spread, un glissement et un financement deux fois plus élevés : rendement {0}, gain moyen {1}, profit factor {2}."), [
              <strong key="r" className={tone(doubleCosts.returnPercent)}>{pct(doubleCosts.returnPercent)}</strong>,
              <strong key="a" className={tone(doubleCosts.avgR ?? doubleCosts.avgTradePercent)}>{fmtAvg(doubleCosts.avgR, doubleCosts.avgTradePercent)}</strong>,
              num(doubleCosts.profitFactor),
            ])}
          </p>
          <p className="mt-2 text-xs text-muted">{tl("En scalp, c'est souvent ici que la stratégie casse : les frais pèsent lourd sur de petits mouvements.")}</p>
        </Card>
      </div>
      <Card title={tl("Réglages voisins : {0} des variantes restent gagnantes", [pct(sensitivity.profitableShare, 0, false)])}>
        {sensitivity.rows.length ? (
          <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
            <table className="num w-full min-w-[520px] whitespace-nowrap text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="text-left font-normal">{tl("Réglage")}</th>
                  <th className="text-left font-normal" colSpan={5}>
                    {tl("Rendement total selon la valeur (la valeur testée est en gras)")}</th>
                </tr>
              </thead>
              <tbody>
                {sensitivity.rows.map((row, i) => (
                  <tr key={i} className="border-t border-line/50">
                    <td className="py-1.5 pr-3">{tx(row.label)}</td>
                    {row.variants.map((v) => (
                      <td key={v.value} className={`px-2 text-right ${tone(v.returnPercent)} ${v.value === row.base ? "font-bold" : ""}`}>
                        <div className="text-[11px] text-muted">{v.value}</div>
                        {pct(v.returnPercent, 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">{tl("Aucun réglage numérique à faire varier.")}</p>
        )}
        <p className="mt-2 text-xs text-muted">{tl("Chaque réglage est décalé de −40 % à +40 %, les autres restant fixes. Si seul le réglage choisi gagne, le résultat tient probablement de la chance.")}</p>
      </Card>
    </div>
  );
}

function robustnessVerdict(report: BacktestReport): { tone: "warn" | "error" | "info"; title: string; text: string } {
  const m = report.metrics;
  const edge = report.robustness.edge;
  const valid = report.robustness.split[1];
  const share = report.robustness.sensitivity.profitableShare;
  const hasKnobs = report.robustness.sensitivity.rows.length > 0;
  if (m.trades < 30) return { tone: "warn", title: tr("Pas assez de trades."), text: tr("Moins de 30 trades ne permettent pas de conclure, dans un sens comme dans l'autre.") };
  if (m.totalReturnPercent <= 0) return { tone: "error", title: tr("Stratégie perdante sur la période."), text: tr("Les frais compris, elle ne gagne pas d'argent.") };
  const checks = [
    edge !== null && edge.probabilityNoEdge < 10,
    valid.trades >= 10 && (valid.avgR ?? valid.avgTradePercent) > 0,
    !hasKnobs || share >= 70,
    report.robustness.doubleCosts.returnPercent > 0,
  ];
  const passed = checks.filter(Boolean).length;
  if (passed === 4) return { tone: "info", title: tr("Résultat solide sur les 4 contrôles."), text: tr("L'avantage semble réel, tient sur la suite de l'historique, sur les réglages voisins et avec des frais doublés. Ça reste un test sur le passé.") };
  if (passed >= 2) return { tone: "warn", title: tr("Résultat fragile : {0} contrôles sur 4.", [passed]), text: tr("Regarde ci-dessous lesquels échouent avant d'y mettre de l'argent.") };
  return { tone: "error", title: tr("Résultat peu fiable : {0} contrôle{1} sur 4.", [passed, passed > 1 ? "s" : ""]), text: tr("Le gain vient probablement du hasard ou d'un réglage trop ajusté au passé.") };
}
