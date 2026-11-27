"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { useT } from "@/lib/client/i18n";
import { date, num, pct, r, tone } from "@/lib/client/format";
import { ERROR_LABELS, WEEK_DAYS, discipline, type ErrorCode, type Quality } from "@/lib/journal";
import {
  GROUPINGS,
  GROUPING_LABELS,
  MIN_SAMPLE,
  filterTrades,
  groupTrades,
  maxDrawdown,
  rCurve,
  statTrades,
  streaks,
  summaryOf,
  type CurvePoint,
  type Drawdown,
  type Group,
  type Grouping,
  type StatTrade,
  type TradeFilter,
} from "@/lib/journal-stats";
import { Help } from "./learn";
import { PlanLock } from "./plan-lock";
import { Card, Stat, Tabs } from "./ui";
import { FilterBar, setupLabel } from "./journal-filters";
import type { JournalData } from "./journal-shared";

type SetupName = (key: string | null, offPlan?: boolean) => string;

/**
 * The dashboard: the basic figures for every plan, then the R curve, the drawdown, the streaks, the
 * analyses and the cost of the mistakes for Trader and Pro. The free plan sees them on made-up trades.
 */
export function JournalDashboard({ data, filter, onFilter }: { data: JournalData; filter: TradeFilter; onFilter: (f: TradeFilter) => void }) {
  const tl = useT();
  const trades = filterTrades(statTrades(data.trades, data.accounts), filter);
  const s = summaryOf(trades);

  return (
    <div className="flex flex-col gap-4">
      <FilterBar data={data} filter={filter} onChange={onFilter} />
      {trades.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label={tl("Trades clôturés")} value={s.closed} term="trades" />
          <Stat label={tl("Taux de gagnants")} value={s.winRate === null ? "—" : pct(s.winRate * 100, 0, false)} term="gagnants" />
          <Stat label={tl("Espérance par trade")} value={r(s.expectancy)} className={tone(s.expectancy)} term="gain-moyen" />
          <Stat label={tl("Profit factor")} value={s.profitFactor === null ? "—" : num(s.profitFactor)} term="profit-factor" />
          <Stat label={tl("Résultat total")} value={r(s.totalR, 1)} className={tone(s.totalR)} term="r" />
        </div>
      ) : (
        <p className="text-sm text-muted">{tl("Aucun trade clôturé dans ces filtres : le tableau de bord se remplit à chaque clôture.")}</p>
      )}
      {data.plan.dashboard ? trades.length > 0 && <Details trades={trades} name={setupLabel(data, tl)} /> : <Locked />}
    </div>
  );
}

/** What the paid plans add, drawn on made-up trades and blurred: none of the user's numbers is behind the blur. */
function Locked() {
  const tl = useT();
  return (
    <div className="flex flex-col gap-3">
      <PlanLock>
        {tl("La courbe des R, la baisse max, les séries et les analyses par configuration, marché, heure, jour, sens, qualité et plan sont dans les offres payantes.")}
      </PlanLock>
      <div className="relative overflow-hidden rounded-lg">
        <div aria-hidden inert className="pointer-events-none select-none opacity-60 blur-[3px]">
          <Details trades={SAMPLE} name={(key) => tl(key === "s2" ? "Cassure du range" : "Rebond sur la moyenne 20")} />
        </div>
        <span className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-panel px-3 py-1 text-xs whitespace-nowrap text-muted">
          {tl("Exemple, sur des trades fictifs")}
        </span>
      </div>
    </div>
  );
}

const DAY = 86_400_000;

/** 64 made-up trades for the locked preview, the same on every visit. */
const SAMPLE: StatTrade[] = (() => {
  let seed = 11;
  const rand = () => (seed = (seed * 16_807) % 2_147_483_647) / 2_147_483_647;
  const start = Date.UTC(2026, 0, 5, 9);
  return Array.from({ length: 64 }, (_, i) => {
    const win = rand() < 0.47;
    const result = win ? 1 + Math.round(rand() * 16) / 10 : -1;
    const closedAt = start + Math.round(i * 1.6) * DAY;
    return {
      id: `x${i}`,
      accountId: "x",
      setupId: i % 3 ? "s1" : "s2",
      offPlan: false,
      market: ["EURUSD", "XAUUSD", "US100"][(i * 7) % 3],
      side: i % 2 ? "long" : "short",
      quality: (["A", "B", "C"] as Quality[])[(i * 5) % 3],
      openedAt: closedAt - 3_600_000,
      closedAt,
      r: result,
      amount: result * 100,
      currency: "USD",
      planFollowed: i % 6 !== 0,
      errors: i % 6 === 0 ? [{ code: "E1" as ErrorCode, costR: result }] : [],
      day: new Date(closedAt).toISOString().slice(0, 10),
      weekday: Math.round(i * 1.6) % 5,
      hour: 9 + (i % 7),
    } satisfies StatTrade;
  });
})();

function Details({ trades, name }: { trades: StatTrade[]; name: SetupName }) {
  const tl = useT();
  const [by, setBy] = useState<Grouping>("setup");
  const s = summaryOf(trades);
  const curve = rCurve(trades);
  const dd = maxDrawdown(curve);
  const st = streaks(trades);
  const d = discipline(trades);
  const unpriced = trades.flatMap((t) => t.errors).filter((e) => e.costR === null).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label={tl("Gain moyen")} value={r(s.avgWinR)} className={tone(s.avgWinR)} hint={tl("par trade gagnant")} />
        <Stat label={tl("Perte moyenne")} value={r(s.avgLossR)} className={tone(s.avgLossR)} hint={tl("par trade perdant")} />
        <Stat
          label={tl("Baisse max")}
          value={dd ? r(dd.depth, 1) : "—"}
          className={tone(dd?.depth)}
          hint={dd && dd.depth < 0 ? (dd.recovered ? tl("rattrapée depuis") : tl("pas encore rattrapée")) : undefined}
          term="drawdown"
        />
        <Stat label={tl("Pertes d'affilée")} value={st.losses} hint={tl("{0} gains d'affilée au mieux", [st.wins])} term="pertes-affilee" />
        <Stat label={tl("Meilleur / pire trade")} value={s.bestR === null ? "—" : `${r(s.bestR, 1)} / ${r(s.worstR, 1)}`} />
      </div>

      {curve.length > 0 && (
        <Card
          title={
            <span>
              {tl("Courbe des R")}
              <Help id="courbe-des-r" />
            </span>
          }
        >
          <RCurveChart curve={curve} drawdown={dd} />
        </Card>
      )}

      <Card title={tl("Analyses")}>
        <Tabs tabs={GROUPINGS.map((g) => ({ id: g, label: tl(GROUPING_LABELS[g]) }))} value={by} onChange={setBy} />
        <GroupTable groups={groupTrades(trades, by)} by={by} name={name} />
      </Card>

      {d.register.length > 0 && (
        <Card title={tl("Coût des erreurs")}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-normal">{tl("Erreur")}</th>
                <th className="py-1 text-right font-normal">{tl("Nombre")}</th>
                <th className="py-1 text-right font-normal">{tl("Coût")}</th>
                <th className="hidden py-1 text-right font-normal sm:table-cell">{tl("Par erreur")}</th>
              </tr>
            </thead>
            <tbody>
              {[...d.register]
                .sort((a, b) => a.costR - b.costR)
                .map((x) => (
                  <tr key={x.code} className="border-t border-line/60">
                    <td className="py-1.5">
                      <span className="font-mono text-xs text-muted">{x.code}</span> {tl(ERROR_LABELS[x.code])}
                    </td>
                    <td className="num py-1.5 text-right">{x.count}</td>
                    <td className={`num py-1.5 text-right ${tone(x.costR)}`}>{r(x.costR, 1)}</td>
                    <td className={`num hidden py-1.5 text-right sm:table-cell ${tone(x.costR)}`}>{r(x.costR / x.count)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm">
            {tl("Sans ces erreurs, le résultat aurait été de {0} au lieu de {1}.", [r(s.totalR - d.costR, 1), r(s.totalR, 1)])}
            {unpriced > 0 && <span className="text-muted"> {tl("{0} erreurs sans coût chiffré n'y sont pas comptées.", [unpriced])}</span>}
          </p>
        </Card>
      )}
    </div>
  );
}

function GroupTable({ groups, by, name }: { groups: Group[]; by: Grouping; name: SetupName }) {
  const tl = useT();
  const widest = Math.max(0, ...groups.map((g) => Math.abs(g.summary.expectancy ?? 0)));
  const label = (g: Group) => {
    if (by === "setup") return name(g.key);
    if (by === "market") return g.label ?? g.key;
    if (by === "hour") return tl("{0} h", [Number(g.key)]);
    if (by === "weekday") return tl(WEEK_DAYS[Number(g.key)]);
    if (by === "side") return g.key === "long" ? tl("Achat") : tl("Vente");
    if (by === "quality") return g.key === "none" ? tl("Sans note") : g.key;
    return g.key === "in" ? tl("Dans le plan") : g.key === "out" ? tl("Hors plan") : tl("Pas encore classés");
  };

  return (
    <div className="mt-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-1 font-normal">{tl(GROUPING_LABELS[by])}</th>
            <th className="py-1 text-right font-normal">{tl("Trades")}</th>
            <th className="hidden py-1 text-right font-normal sm:table-cell">{tl("Gagnants")}</th>
            <th className="py-1 pl-3 font-normal">{tl("Espérance")}</th>
            <th className="py-1 text-right font-normal">{tl("Total")}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const e = g.summary.expectancy;
            const width = e === null || widest === 0 ? 0 : (Math.abs(e) / widest) * 50;
            return (
              <tr key={g.key} className="border-t border-line/60">
                <td className="max-w-40 py-1.5 pr-2">
                  <span className="block truncate">{label(g)}</span>
                </td>
                <td className="num py-1.5 text-right whitespace-nowrap">
                  {g.summary.closed}
                  {g.indicative && <span className="ml-1 hidden rounded border border-line px-1 text-[10px] text-muted sm:inline">{tl("indication")}</span>}
                  {g.indicative && (
                    <span className="ml-0.5 text-muted sm:hidden" aria-label={tl("indication")}>
                      *
                    </span>
                  )}
                </td>
                <td className="num hidden py-1.5 text-right sm:table-cell">{g.summary.winRate === null ? "—" : pct(g.summary.winRate * 100, 0, false)}</td>
                <td className="py-1.5 pl-3">
                  <span className="flex items-center gap-2">
                    {/* A bar from the middle: right for a positive expectancy, left for a negative one; the value says it too. */}
                    <span className="relative hidden h-2 w-24 shrink-0 rounded-sm bg-panel-2 sm:block" aria-hidden>
                      <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
                      {e !== null && e !== 0 && (
                        <span className={`absolute inset-y-0 rounded-sm ${e > 0 ? "left-1/2 bg-up" : "right-1/2 bg-down"}`} style={{ width: `${width}%` }} />
                      )}
                    </span>
                    <span className={`num ${tone(e)}`}>{r(e)}</span>
                  </span>
                </td>
                <td className={`num py-1.5 text-right ${tone(g.summary.totalR)}`}>{r(g.summary.totalR, 1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">
        {groups.some((g) => g.indicative) && tl("« indication » (* sur téléphone) : moins de {0} trades, quelques trades chanceux suffisent à faire basculer le chiffre.", [MIN_SAMPLE])}
        {by === "hour" && <> {tl("Heure d'ouverture du trade, dans le fuseau horaire du plan de son compte.")}</>}
        {by === "plan" && <> {tl("Dans le plan : ta méthode. Hors plan : ce que coûtent tes écarts.")}</>}
      </p>
    </div>
  );
}

/**
 * The R added up trade after trade: one line, so no legend, the card's title names it. The red band
 * is the max drawdown. A crosshair follows the pointer (or the arrow keys) and reads the trade under it.
 */
function RCurveChart({ curve, drawdown }: { curve: CurvePoint[]; drawdown: Drawdown | null }) {
  const tl = useT();
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000;
  const H = 300;
  const n = curve.length;
  const totals = curve.map((p) => p.total);
  const top = Math.max(0, ...totals);
  const bottom = Math.min(0, ...totals);
  const span = Math.max(1, top - bottom);
  const hi = top + span * 0.08;
  const lo = bottom - span * 0.08;
  const x = (k: number) => (k / n) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const path = `M0,${y(0)} ${curve.map((p) => `L${x(p.n)},${y(p.total)}`).join(" ")}`;
  const point = hover === null ? null : curve[hover];
  const last = curve[n - 1];

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const k = Math.round(((e.clientX - box.left) / box.width) * n);
    setHover(Math.min(n, Math.max(1, k)) - 1);
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
    if (e.key === "Escape") setHover(null);
    else if (e.key === "Home") setHover(0);
    else if (e.key === "End") setHover(n - 1);
    else if (e.key in moves) setHover(Math.min(n - 1, Math.max(0, (hover ?? n - 1) + moves[e.key])));
    else return;
    e.preventDefault();
  };
  // Only the labels far enough apart are written, so they never overlap.
  const ticks = [top, 0, bottom].filter((v, i, all) => all.findIndex((w) => Math.abs(y(w) - y(v)) < H * 0.12) === i);
  const at = (v: number) => `${(y(v) / H) * 100}%`;
  const left = point ? (x(point.n) / W) * 100 : 0;

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative w-12 shrink-0" aria-hidden>
          {ticks.map((v) => (
            <span key={v} className="num absolute right-0 -translate-y-1/2 text-[10px] whitespace-nowrap text-muted" style={{ top: at(v) }}>
              {v === 0 ? "0 R" : r(v, 1)}
            </span>
          ))}
        </div>
        <div
          className="relative h-48 flex-1 cursor-crosshair outline-none focus-visible:ring-2 focus-visible:ring-accent sm:h-64"
          style={{ touchAction: "pan-y" }}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setHover(null)}
          onKeyDown={key}
          onBlur={() => setHover(null)}
          tabIndex={0}
          role="img"
          aria-label={tl("Courbe des R : {0} après {1} trades. Flèches gauche et droite pour lire chaque trade.", [r(last.total, 1), n])}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            {drawdown && drawdown.depth < 0 && (
              <rect x={x(drawdown.peak)} width={Math.max(2, x(drawdown.trough) - x(drawdown.peak))} y={0} height={H} fill="var(--down)" opacity={0.1} />
            )}
            <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--border)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {point && <line x1={x(point.n)} x2={x(point.n)} y1={0} y2={H} stroke="var(--muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
          </svg>
          {point && (
            <>
              <span
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-panel"
                style={{ left: `${left}%`, top: at(point.total) }}
              />
              <div
                className={`pointer-events-none absolute top-1 z-10 w-max max-w-56 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs shadow-lg ${left > 50 ? "-translate-x-full" : ""}`}
                style={{ left: `calc(${left}% ${left > 50 ? "- 8px" : "+ 8px"})` }}
              >
                <div className={`num text-sm font-semibold ${tone(point.total)}`}>{r(point.total, 1)}</div>
                <div className="text-muted">
                  {tl("Trade n° {0}", [point.n])} · {point.market} · <span className={`num ${tone(point.r)}`}>{r(point.r)}</span>
                </div>
                <div className="text-muted">{date(point.closedAt, false)}</div>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="mt-1 flex justify-between pl-14 text-[10px] text-muted">
        <span>{tl("Trade n° {0}", [1])}</span>
        <span>{tl("du plus ancien au plus récent")}</span>
        <span>{tl("Trade n° {0}", [n])}</span>
      </div>
      {drawdown && drawdown.depth < 0 && (
        <p className="mt-2 text-xs text-muted">
          {drawdown.peak === 0
            ? tl("Zone rouge : la baisse max, {0}, du départ au trade n° {1}.", [r(drawdown.depth, 1), drawdown.trough])
            : tl("Zone rouge : la baisse max, {0}, du trade n° {1} au n° {2}.", [r(drawdown.depth, 1), drawdown.peak, drawdown.trough])}
        </p>
      )}
    </div>
  );
}
