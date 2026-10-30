"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client/api";
import { date, money, num, pct, price, r, tone } from "@/lib/client/format";
import type { BacktestReport } from "@/lib/engine/report";
import type { Trade } from "@/lib/engine/backtest";
import type { BacktestConfig, Strategy } from "@/lib/strategy/schema";
import { stopLabel, targetLabel } from "@/lib/strategy/describe";
import { INTERVAL_MS, type CandleRow } from "@/lib/types";
import { EquityChart, PriceChart, type ChartMarker, type PriceChartHandle } from "./charts";
import { Term, Tip, useBeginner } from "./learn";
import { PropFirmPanel } from "./prop-firm-panel";
import { Alert, Button, Card, Stat, Tabs } from "./ui";

interface Stored {
  id: string;
  strategyId: string | null;
  strategy: Strategy;
  config: BacktestConfig;
  report: BacktestReport;
  createdAt: number;
}

type Tab = "overview" | "trades" | "robustness" | "prop";

const EXIT_LABELS: Record<Trade["exitReason"], string> = {
  stop: "Stop",
  target: "Objectif",
  trailing: "Stop suiveur",
  breakeven: "Point mort",
  signal: "Signal de sortie",
  reverse: "Retournement",
  time: "Heure de fin",
  max_bars: "Durée max",
  liquidation: "Liquidation",
  end: "Fin du test",
};

export function BacktestResults({ id }: { id: string }) {
  const [data, setData] = useState<Stored | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    api<Stored>(`/api/backtests/${id}`).then(setData).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <p className="text-muted">Chargement…</p>;
  const { report, strategy, config } = data;
  const m = report.metrics;
  const hasR = m.avgR !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{strategy.name}</h1>
          <p className="text-sm text-muted">
            {strategy.symbol} · {strategy.interval} · {date(report.period.from, false)} → {date(report.period.to, false)} · capital {money(config.initialCapital)} · frais {config.feePercent} % / côté
          </p>
        </div>
        <div className="flex gap-2">
          {data.strategyId && (
            <Link href={`/strategies/${data.strategyId}`}>
              <Button variant="ghost">Modifier et relancer</Button>
            </Link>
          )}
          {data.strategyId && (
            <Link href={`/live?strategy=${data.strategyId}`}>
              <Button variant="ghost">Suivre en direct</Button>
            </Link>
          )}
        </div>
      </div>

      {report.warnings.map((w, i) => (
        <Alert key={i}>{w}</Alert>
      ))}

      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 md:grid-cols-4 lg:grid-cols-8">
        <Stat
          label={<Term id="rendement">Rendement total</Term>}
          value={pct(m.totalReturnPercent)}
          className={tone(m.totalReturnPercent)}
          hint={
            <>
              <Term id="achat-conservation">Achat-conservation</Term> : {pct(m.buyAndHoldPercent)}
            </>
          }
        />
        <Stat label={<Term id="rendement-annuel">Rendement annuel</Term>} value={pct(m.cagrPercent)} className={tone(m.cagrPercent)} />
        <Stat label={<Term id="drawdown">Baisse max</Term>} value={pct(-m.maxDrawdownPercent)} className="text-down" />
        <Stat label={<Term id="trades">Trades</Term>} value={m.trades} hint={`${num(m.tradesPerMonth, 1)} par mois`} />
        <Stat label={<Term id="gagnants">Gagnants</Term>} value={pct(m.winRate, 0, false)} />
        <Stat label={<Term id="profit-factor">Profit factor</Term>} value={num(m.profitFactor)} className={m.profitFactor !== null ? (m.profitFactor >= 1 ? "text-up" : "text-down") : ""} />
        <Stat label={<Term id="gain-moyen">Gain moyen / trade</Term>} value={hasR ? r(m.avgR) : pct(m.avgTradePercent, 2)} className={tone(hasR ? m.avgR : m.avgTradePercent)} />
        <Stat label={<Term id="sharpe">Sharpe</Term>} value={num(m.sharpe)} hint={`Sortino ${num(m.sortino)}`} />
      </div>

      <GuidedReading data={data} onOpenRobustness={() => setTab("robustness")} />

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Vue d'ensemble" },
          { id: "trades", label: `Trades (${m.trades})` },
          { id: "robustness", label: "Robustesse" },
          { id: "prop", label: "Challenge prop firm" },
        ]}
      />

      {tab === "overview" && <Overview data={data} selected={selected} onSelect={setSelected} />}
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
      {tab === "robustness" && <Robustness report={report} hasR={hasR} />}
      {tab === "prop" && <PropFirmPanel trades={report.trades} strategy={strategy} />}
    </div>
  );
}

/**
 * Beginner mode: the key numbers turned into plain sentences, each with a
 * rough judgement, so a first-time user knows what to look at and why.
 */
function GuidedReading({ data, onOpenRobustness }: { data: Stored; onOpenRobustness: () => void }) {
  const beginner = useBeginner();
  if (!beginner) return null;
  const { report, config } = data;
  const m = report.metrics;
  const capital = config.initialCapital;
  const years = (report.period.to - report.period.from) / (365.25 * 86_400_000);
  const verdict = robustnessVerdict(report);
  const lines: { tone: "good" | "bad" | "meh"; text: React.ReactNode }[] = [];

  lines.push(
    m.trades < 30
      ? { tone: "bad", text: <>Seulement {m.trades} trades en {num(years, 1)} an(s) : c&apos;est trop peu pour conclure, le résultat peut venir de la chance. Allonge la période ou assouplis les règles.</> }
      : { tone: "good", text: <>{m.trades} trades en {num(years, 1)} an(s) : assez pour que les chiffres aient un sens.</> },
  );
  const gain = capital * (m.totalReturnPercent / 100);
  lines.push({
    tone: m.totalReturnPercent <= 0 ? "bad" : m.totalReturnPercent < m.buyAndHoldPercent ? "meh" : "good",
    text: (
      <>
        Avec {money(capital)} au départ, tu finirais à {money(capital + gain)} ({pct(m.totalReturnPercent)}), frais compris.{" "}
        {m.totalReturnPercent < m.buyAndHoldPercent ? (
          <>
            Acheter et garder sans rien faire aurait rapporté {pct(m.buyAndHoldPercent)} : la stratégie fait moins bien, sauf si elle risque beaucoup moins (voir la baisse max).
          </>
        ) : (
          <>C&apos;est mieux que d&apos;acheter et garder sans rien faire ({pct(m.buyAndHoldPercent)}).</>
        )}
      </>
    ),
  });
  lines.push({
    tone: m.maxDrawdownPercent > 30 ? "bad" : m.maxDrawdownPercent > 15 ? "meh" : "good",
    text: (
      <>
        Au pire moment, ton compte a baissé de {pct(m.maxDrawdownPercent, 1, false)} depuis son plus haut, soit environ {money((capital * m.maxDrawdownPercent) / 100)} sur {money(capital)}.{" "}
        {m.maxDrawdownPercent > 30 ? "C'est une baisse que peu de gens supportent sans abandonner." : m.maxDrawdownPercent > 15 ? "C'est sensible : demande-toi si tu l'aurais supporté." : "C'est une baisse raisonnable."}
      </>
    ),
  });
  const avgWin = m.avgWinR !== null ? r(m.avgWinR) : pct(m.avgWinPercent, 2);
  const avgLoss = m.avgLossR !== null ? r(m.avgLossR) : pct(m.avgLossPercent, 2);
  lines.push({
    tone: m.profitFactor !== null && m.profitFactor >= 1.3 ? "good" : m.profitFactor !== null && m.profitFactor >= 1 ? "meh" : "bad",
    text: (
      <>
        {pct(m.winRate, 0, false)} des trades sont gagnants. Un gagnant rapporte en moyenne {avgWin}, un perdant coûte {avgLoss}. Le profit factor de {num(m.profitFactor)} veut dire que les gains
        valent {num(m.profitFactor)} fois les pertes{m.profitFactor !== null && m.profitFactor < 1 ? " : la stratégie perd de l'argent." : m.profitFactor !== null && m.profitFactor < 1.3 ? " : c'est positif mais fragile." : "."}
      </>
    ),
  });
  lines.push({
    tone: m.longestLosingStreak >= 8 ? "meh" : "good",
    text: <>La pire série a été de {m.longestLosingStreak} pertes d&apos;affilée. Imagine-la en vrai : aurais-tu continué à suivre la stratégie ?</>,
  });

  const icon = { good: "✓", meh: "~", bad: "✗" };
  const color = { good: "text-up", meh: "text-warn", bad: "text-down" };
  return (
    <Card title="Lecture guidée : ce que disent ces chiffres">
      <ul className="flex flex-col gap-2 text-sm">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2">
            <span className={`w-4 shrink-0 font-bold ${color[l.tone]}`} aria-hidden>
              {icon[l.tone]}
            </span>
            <span>{l.text}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 rounded-md border border-line bg-panel-2/60 p-2.5 text-sm">
        <strong>Verdict des contrôles de robustesse :</strong> {verdict.title} {verdict.text}{" "}
        <button onClick={onOpenRobustness} className="text-accent hover:underline">
          Voir le détail
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Un bon backtest ne promet rien pour l&apos;avenir. Avant d&apos;y mettre de l&apos;argent, vérifie la robustesse puis suis la stratégie en direct quelques semaines (bouton « Suivre en direct »).
      </p>
    </Card>
  );
}

function Overview({ data, selected, onSelect }: { data: Stored; selected: number | null; onSelect: (i: number | null) => void }) {
  const { report, strategy } = data;
  const m = report.metrics;
  const [candles, setCandles] = useState<CandleRow[]>([]);
  const [loadedFor, setLoadedFor] = useState<number | null | undefined>(undefined);
  const loading = loadedFor !== selected;
  const chart = useRef<PriceChartHandle>(null);
  const ms = INTERVAL_MS[strategy.interval];

  // Load the candles around the selected trade, or the end of the test period.
  useEffect(() => {
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
  }, [selected, report, strategy, ms]);

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
            { price: sel.entryPrice, color: "#8a97ab", title: "Entrée" },
            ...(sel.stopPrice ? [{ price: sel.stopPrice, color: "#ef4444", title: "Stop" }] : []),
            ...(sel.targetPrice ? [{ price: sel.targetPrice, color: "#22c55e", title: "Objectif" }] : []),
          ]
        : [],
    [sel],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex flex-col gap-4">
        <Card title={<Term id="courbe-capital">Courbe du capital</Term>}>
          <EquityChart points={report.equity} />
          <div className="mt-2">
            <Tip>L&apos;évolution de ton compte, trade après trade. Cherche une pente régulière ; les longues descentes sont les périodes difficiles.</Tip>
          </div>
        </Card>
        <Card
          title={sel ? `Trade du ${date(sel.entryTime)} · ${sel.side === "long" ? "achat" : "vente"} · ${sel.r !== null ? r(sel.r) : pct(sel.pnlPercent)}` : "Graphique des trades"}
          actions={
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
              {loading && <span className="text-muted">chargement…</span>}
              {selected !== null && (
                <>
                  <button disabled={selected === 0} onClick={() => onSelect(selected - 1)} className="text-muted hover:text-fg disabled:opacity-30">
                    ← précédent
                  </button>
                  <button disabled={selected >= report.trades.length - 1} onClick={() => onSelect(selected + 1)} className="text-muted hover:text-fg disabled:opacity-30">
                    suivant →
                  </button>
                  <button onClick={() => onSelect(null)} className="text-muted hover:text-fg">
                    fin du test
                  </button>
                </>
              )}
              {selected === null && report.trades.length > 0 && (
                <button onClick={() => onSelect(0)} className="text-accent hover:underline">
                  voir le premier trade
                </button>
              )}
            </div>
          }
        >
          <PriceChart ref={chart} candles={candles} markers={markers} priceLines={priceLines} />
          <div className="mt-2">
            <Tip>
              Les flèches marquent les entrées, les étiquettes les sorties avec leur résultat en <Term id="r">R</Term>. Clique sur « voir le premier trade » puis « suivant » pour vérifier que la
              stratégie fait bien ce que tu voulais.
            </Tip>
          </div>
        </Card>
      </div>
      <div className="flex flex-col gap-4">
        <Card title="Détails">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <Dt>Capital final</Dt>
            <Dd>{money(data.config.initialCapital * (1 + m.totalReturnPercent / 100))}</Dd>
            <Dt>Gain moyen gagnant</Dt>
            <Dd className="text-up">{m.avgWinR !== null ? r(m.avgWinR) : pct(m.avgWinPercent, 2)}</Dd>
            <Dt>Perte moyenne</Dt>
            <Dd className="text-down">{m.avgLossR !== null ? r(m.avgLossR) : pct(m.avgLossPercent, 2)}</Dd>
            <Dt>Meilleur trade</Dt>
            <Dd>{pct(m.bestTradePercent, 2)}</Dd>
            <Dt>Pire trade</Dt>
            <Dd>{pct(m.worstTradePercent, 2)}</Dd>
            <Dt>
              <Term id="pertes-affilee">Pertes d&apos;affilée max</Term>
            </Dt>
            <Dd>{m.longestLosingStreak}</Dd>
            <Dt>Durée moyenne</Dt>
            <Dd>{num(m.avgBars, 1)} bougies</Dd>
            <Dt>
              <Term id="exposition">Temps en position</Term>
            </Dt>
            <Dd>{pct(m.exposurePercent, 0, false)}</Dd>
            <Dt>
              <Term id="frais">Frais payés</Term>
            </Dt>
            <Dd>{money(m.totalCosts)}</Dd>
            <Dt>
              <Term id="stop">Stop</Term>
            </Dt>
            <Dd>{stopLabel(strategy)}</Dd>
            <Dt>
              <Term id="objectif">Objectif</Term>
            </Dt>
            <Dd>{targetLabel(strategy)}</Dd>
          </dl>
        </Card>
        <Card title="Par année">
          <PeriodTable rows={report.byYear} hasR={m.avgR !== null} />
        </Card>
      </div>
    </div>
  );
}

const Dt = ({ children }: { children: React.ReactNode }) => <dt className="text-muted">{children}</dt>;
const Dd = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <dd className={`num text-right ${className}`}>{children}</dd>;

function PeriodTable({ rows, hasR }: { rows: BacktestReport["byYear"]; hasR: boolean }) {
  if (!rows.length) return <p className="text-sm text-muted">Aucun trade.</p>;
  return (
    <table className="num w-full text-sm">
      <thead className="text-xs text-muted">
        <tr>
          <th className="text-left font-normal">Période</th>
          <th className="text-right font-normal">Trades</th>
          <th className="text-right font-normal">Rendement</th>
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

function TradesTable({ trades, hasR, onSelect }: { trades: Trade[]; hasR: boolean; onSelect: (i: number) => void }) {
  const [page, setPage] = useState(0);
  const size = 50;
  const rows = trades.slice(page * size, page * size + size);
  const exportCsv = () => {
    const header = "entree,sortie,sens,prix_entree,prix_sortie,raison,pnl,pnl_pct,r,bougies";
    const lines = trades.map((t) =>
      [new Date(t.entryTime).toISOString(), new Date(t.exitTime).toISOString(), t.side, t.entryPrice, t.exitPrice, t.exitReason, t.pnl.toFixed(2), t.pnlPercent.toFixed(3), t.r?.toFixed(3) ?? "", t.bars].join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "trades.csv";
    a.click();
  };
  return (
    <Card
      title="Liste des trades"
      actions={
        <Button variant="ghost" onClick={exportCsv}>
          Exporter en CSV
        </Button>
      }
    >
      {/* Phones: one compact row per trade. */}
      <ul className="-my-1 flex flex-col divide-y divide-line/50 md:hidden">
        {rows.map((t, k) => {
          const i = page * size + k;
          return (
            <li key={i}>
              <button onClick={() => onSelect(i)} className="flex w-full items-center gap-3 py-2 text-left">
                <span className="num w-7 text-xs text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <span className={t.side === "long" ? "text-up" : "text-down"}>{t.side === "long" ? "Achat" : "Vente"}</span> · {date(t.entryTime)}
                  </div>
                  <div className="num text-[11px] text-muted">
                    {price(t.entryPrice)} → {price(t.exitPrice)} · {EXIT_LABELS[t.exitReason]} · {t.bars} bougies
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
              <th className="font-normal">Entrée</th>
              <th className="font-normal">Sens</th>
              <th className="text-right font-normal">Prix d&apos;entrée</th>
              <th className="text-right font-normal">Prix de sortie</th>
              <th className="font-normal">Sortie</th>
              <th className="text-right font-normal">Durée</th>
              <th className="text-right font-normal">Résultat</th>
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
                  <td className={t.side === "long" ? "text-up" : "text-down"}>{t.side === "long" ? "Achat" : "Vente"}</td>
                  <td className="text-right">{price(t.entryPrice)}</td>
                  <td className="text-right">{price(t.exitPrice)}</td>
                  <td className="text-muted">{EXIT_LABELS[t.exitReason]}</td>
                  <td className="text-right">{t.bars}</td>
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
            Précédents
          </Button>
          <span className="text-muted">
            {page + 1} / {Math.ceil(trades.length / size)}
          </span>
          <Button variant="ghost" disabled={(page + 1) * size >= trades.length} onClick={() => setPage(page + 1)}>
            Suivants
          </Button>
        </div>
      )}
    </Card>
  );
}

function Robustness({ report, hasR }: { report: BacktestReport; hasR: boolean }) {
  const { monteCarlo: mc, edge, split, sensitivity, doubleCosts } = report.robustness;
  const fmtAvg = (avgR: number | null, avgPct: number) => (hasR && avgR !== null ? r(avgR) : pct(avgPct, 2));
  const verdict = robustnessVerdict(report);
  return (
    <div className="flex flex-col gap-4">
      <Alert tone={verdict.tone}>
        <strong>{verdict.title}</strong> {verdict.text}
      </Alert>
      <Tip title="Pourquoi cet onglet ?">
        Il est facile de trouver une stratégie qui aurait gagné par hasard sur le passé : c&apos;est le <Term id="surajustement">surajustement</Term>. Ces 4 contrôles cherchent à la
        piéger : <Term id="avantage">l&apos;avantage est-il réel</Term>, tient-il sur <Term id="validation">la fin de l&apos;historique</Term>, avec des{" "}
        <Term id="reglages-voisins">réglages voisins</Term> et des <Term id="frais-doubles">frais doublés</Term> ? Le <Term id="monte-carlo">Monte Carlo</Term> montre en plus les pires
        scénarios possibles.
      </Tip>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="L'avantage est-il réel ?">
          {edge ? (
            <div className="flex flex-col gap-2 text-sm">
              <p>
                Gain moyen par trade : <strong className={tone(edge.mean)}>{edge.unit === "R" ? r(edge.mean) : pct(edge.mean, 2)}</strong>, intervalle à 90 % :{" "}
                {edge.unit === "R" ? `${r(edge.ci90[0])} à ${r(edge.ci90[1])}` : `${pct(edge.ci90[0], 2)} à ${pct(edge.ci90[1], 2)}`}.
              </p>
              <p>
                Probabilité que le vrai gain moyen soit nul ou négatif : <strong className={edge.probabilityNoEdge < 10 ? "text-up" : edge.probabilityNoEdge < 30 ? "text-warn" : "text-down"}>{pct(edge.probabilityNoEdge, 0, false)}</strong>
              </p>
              <p className="text-xs text-muted">Calculé en retirant au hasard les trades 5 000 fois. Sous 10 %, l&apos;avantage a peu de chances d&apos;être du hasard.</p>
            </div>
          ) : (
            <p className="text-sm text-muted">Il faut au moins 10 trades.</p>
          )}
        </Card>
        <Card title="Étude puis validation sur la suite">
          <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
          <table className="num w-full min-w-[440px] text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="text-left font-normal">Période</th>
                <th className="text-right font-normal">Trades</th>
                <th className="text-right font-normal">Gagnants</th>
                <th className="text-right font-normal">Moyenne</th>
                <th className="text-right font-normal">Rendement</th>
              </tr>
            </thead>
            <tbody>
              {split.map((s) => (
                <tr key={s.label} className="border-t border-line/50">
                  <td>
                    {s.label}
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
          <p className="mt-2 text-xs text-muted">Si la stratégie a été réglée en regardant tout l&apos;historique, cette coupe ne remplace pas un vrai test sur des données jamais vues.</p>
        </Card>
        <Card title="Monte Carlo : 2 000 ordres de trades différents">
          {mc ? (
            <div className="flex flex-col gap-2 text-sm">
              <table className="num w-full">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="text-left font-normal"></th>
                    <th className="text-right font-normal">Pessimiste (5 %)</th>
                    <th className="text-right font-normal">Médian</th>
                    <th className="text-right font-normal">Optimiste (95 %)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-line/50">
                    <td>Rendement</td>
                    <td className={`text-right ${tone(mc.finalReturn.p5)}`}>{pct(mc.finalReturn.p5)}</td>
                    <td className={`text-right ${tone(mc.finalReturn.p50)}`}>{pct(mc.finalReturn.p50)}</td>
                    <td className={`text-right ${tone(mc.finalReturn.p95)}`}>{pct(mc.finalReturn.p95)}</td>
                  </tr>
                  <tr className="border-t border-line/50">
                    <td>Baisse max</td>
                    <td className="text-right text-down">{pct(-mc.maxDrawdown.p95)}</td>
                    <td className="text-right text-down">{pct(-mc.maxDrawdown.p50)}</td>
                    <td className="text-right text-down">{pct(-mc.maxDrawdown.p5)}</td>
                  </tr>
                </tbody>
              </table>
              <p>
                Chance de finir en perte : <strong>{pct(mc.probabilityOfLoss, 0, false)}</strong> · baisse de plus de 20 % : <strong>{pct(mc.probabilityDrawdownOver["20"], 0, false)}</strong> · plus de 30 % :{" "}
                <strong>{pct(mc.probabilityDrawdownOver["30"], 0, false)}</strong>
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">Il faut au moins 5 trades.</p>
          )}
        </Card>
        <Card title="Frais doublés">
          <p className="text-sm">
            Avec des frais, un spread, un glissement et un financement deux fois plus élevés : rendement <strong className={tone(doubleCosts.returnPercent)}>{pct(doubleCosts.returnPercent)}</strong>, gain moyen{" "}
            <strong className={tone(doubleCosts.avgR ?? doubleCosts.avgTradePercent)}>{fmtAvg(doubleCosts.avgR, doubleCosts.avgTradePercent)}</strong>, profit factor {num(doubleCosts.profitFactor)}.
          </p>
          <p className="mt-2 text-xs text-muted">En scalp, c&apos;est souvent ici que la stratégie casse : les frais pèsent lourd sur de petits mouvements.</p>
        </Card>
      </div>
      <Card title={`Réglages voisins : ${pct(sensitivity.profitableShare, 0, false)} des variantes restent gagnantes`}>
        {sensitivity.rows.length ? (
          <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
            <table className="num w-full min-w-[520px] whitespace-nowrap text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="text-left font-normal">Réglage</th>
                  <th className="text-left font-normal" colSpan={5}>
                    Rendement total selon la valeur (la valeur testée est en gras)
                  </th>
                </tr>
              </thead>
              <tbody>
                {sensitivity.rows.map((row, i) => (
                  <tr key={i} className="border-t border-line/50">
                    <td className="py-1.5 pr-3">{row.label}</td>
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
          <p className="text-sm text-muted">Aucun réglage numérique à faire varier.</p>
        )}
        <p className="mt-2 text-xs text-muted">Chaque réglage est décalé de −40 % à +40 %, les autres restant fixes. Si seul le réglage choisi gagne, le résultat tient probablement de la chance.</p>
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
  if (m.trades < 30) return { tone: "warn", title: "Pas assez de trades.", text: "Moins de 30 trades ne permettent pas de conclure, dans un sens comme dans l'autre." };
  if (m.totalReturnPercent <= 0) return { tone: "error", title: "Stratégie perdante sur la période.", text: "Les frais compris, elle ne gagne pas d'argent." };
  const checks = [
    edge !== null && edge.probabilityNoEdge < 10,
    valid.trades >= 10 && (valid.avgR ?? valid.avgTradePercent) > 0,
    !hasKnobs || share >= 70,
    report.robustness.doubleCosts.returnPercent > 0,
  ];
  const passed = checks.filter(Boolean).length;
  if (passed === 4) return { tone: "info", title: "Résultat solide sur les 4 contrôles.", text: "L'avantage semble réel, tient sur la suite de l'historique, sur les réglages voisins et avec des frais doublés. Ça reste un test sur le passé." };
  if (passed >= 2) return { tone: "warn", title: `Résultat fragile : ${passed} contrôles sur 4.`, text: "Regarde ci-dessous lesquels échouent avant d'y mettre de l'argent." };
  return { tone: "error", title: `Résultat peu fiable : ${passed} contrôle${passed > 1 ? "s" : ""} sur 4.`, text: "Le gain vient probablement du hasard ou d'un réglage trop ajusté au passé." };
}
