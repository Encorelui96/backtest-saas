"use client";

import { rich, useT } from "@/lib/client/i18n";
import { useEffect, useMemo, useState } from "react";
import { num, pct, r, tone, formatLocale } from "@/lib/client/format";
import type { Trade } from "@/lib/engine/backtest";
import { breakdowns, excursions, riskSizing, safeRisk, tradeUnit, type Band, type Bucket, type EventDays, type Finding, type RiskSizing, type Unit } from "@/lib/engine/insights";
import type { Strategy } from "@/lib/strategy/schema";
import { Help, Tip } from "./learn";
import { Alert, Card } from "./ui";

const fmt = (x: number | null | undefined, unit: Unit, digits = 2) => (unit === "R" ? r(x, digits) : pct(x, digits));
/** "0,25" without trailing zeros, for band bounds. */
const bound = (x: number) => x.toLocaleString(formatLocale(), { maximumFractionDigits: 2 });

/** The "Analyse" tab: where the strategy wins and loses, and what the excursions say about stops and exits. */
export function AnalysisPanel({ trades, strategy, period }: { trades: Trade[]; strategy: Strategy; period: { from: number; to: number } }) {
  const tl = useT();
  const b = useMemo(() => breakdowns(trades, strategy.timezone, strategy.interval, period.from, period.to), [trades, strategy, period]);
  const e = useMemo(() => excursions(trades), [trades]);
  if (trades.length < 10) return <Alert>{tl("Il faut au moins 10 trades pour analyser d'où viennent les gains et les pertes.")}</Alert>;
  const unit = b.unit;
  const tables = [
    b.byHour && { title: tl("Heure d'entrée ({0})", [strategy.timezone]), rows: b.byHour },
    b.byWeekday && { title: tl("Jour d'entrée"), rows: b.byWeekday },
    b.bySide && { title: tl("Sens"), rows: b.bySide },
    { title: tl("Raison de sortie"), rows: b.byExit },
  ].filter((x): x is { title: string; rows: Bucket[] } => !!x);

  return (
    <div className="flex flex-col gap-4">
      <Tip>{tl("Tes trades regroupés par heure, par jour, par sens, par sortie et selon les annonces économiques : de quoi voir si les pertes viennent toujours du même endroit.")}</Tip>
      <Card
        title={
          <span className="flex items-center">
            {!b.findings.length ? tl("Où ta stratégie gagne et perd") : b.avg > 0 ? tl("Où ta stratégie perd") : tl("Où ta stratégie gagne encore")}
            <Help id="analyse-trades" />
          </span>
        }
      >
        {b.findings.length ? (
          <div className="flex flex-col gap-3">
            {b.findings.map((f) => (
              <FindingNote key={f.bucket.key} f={f} unit={unit} />
            ))}
            <p className="text-xs text-muted">
              {tl("Avant d'ajouter un filtre, relance le test et regarde s'il tient sur la période de validation : trier après coup les trades qui ont gagné ou perdu améliore toujours le passé, sans rien promettre pour la suite.")}</p>
          </div>
        ) : b.avg > 0 ? (
          <p className="text-sm">
            {tl("Aucun groupe de trades ne perd nettement : les résultats ne dépendent pas d'une heure, d'un jour, d'un sens ou des annonces économiques.")}</p>
        ) : (
          <p className="text-sm">
            {tl("La stratégie perd dans tous les groupes : le problème vient des règles elles-mêmes, pas d'une heure, d'un jour, d'un sens ou d'annonces qu'il suffirait d'écarter.")}</p>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {tables.map((t) => (
          <Card key={t.title} title={t.title}>
            <BucketTable rows={t.rows} unit={unit} />
          </Card>
        ))}
      </div>
      {b.events && <EventsCard ev={b.events} unit={unit} avgAll={b.avg} />}
      {e ? (
        <ExcursionsCard e={e} strategy={strategy} />
      ) : (
        <Alert tone="info">{tl("Ajoute un stop pour mesurer, en R, jusqu'où tes trades vont contre toi et en ta faveur avant de se fermer.")}</Alert>
      )}
    </div>
  );
}

function FindingNote({ f, unit }: { f: Finding; unit: Unit }) {
  const tl = useT();
  const halves = tl("période d'étude {0}, validation {1}", [fmt(f.study, unit), fmt(f.validation, unit)]);
  // French pronouns follow the subject's gender ("Les ventes… elles", "Les achats… ils").
  const [they, them] = f.bucket.feminine ? ["elles", "elles"] : ["ils", "eux"];
  const They = they[0].toUpperCase() + they.slice(1);
  const weak = f.kind === "weak";
  const box = !f.steady ? "border-warn/40 bg-warn/10" : weak ? "border-down/40 bg-down/10" : "border-up/40 bg-up/10";
  const subject = <strong>{tl(f.bucket.subject)}</strong>;
  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${box}`}>
      <p>
        {weak
          ? rich(tl("{0} font {1} en moyenne sur {2} trades. Sans {3}, ton gain moyen passerait de {4} à {5}."), [
              subject,
              <strong key="a" className="text-down">{fmt(f.bucket.avg, unit)}</strong>,
              f.bucket.trades,
              them,
              <span key="b" className={tone(f.avgAll)}>{fmt(f.avgAll, unit)}</span>,
              <strong key="c" className={tone(f.avgWithout)}>{fmt(f.avgWithout, unit)}</strong>,
            ])
          : rich(tl("{0} gagnent {1} en moyenne sur {2} trades, alors que la stratégie perd {3} par trade dans l'ensemble."), [
              subject,
              <strong key="a" className="text-up">{fmt(f.bucket.avg, unit)}</strong>,
              f.bucket.trades,
              <span key="b" className="text-down">{fmt(f.avgAll, unit)}</span>,
            ])}
      </p>
      <p className="mt-1 text-fg/80">
        {f.steady
          ? weak
            ? tl("{0} perdent du début à la fin du test ({1}) : c'est plus probablement un vrai point faible qu'un hasard.", [They, halves])
            : tl("{0} gagnent du début à la fin du test ({1}) : une piste à tester, en ne gardant que ces trades.", [They, halves])
          : f.study === null || f.validation === null
            ? weak
              ? tl("Trop peu de ces trades sur une des deux parties du test pour savoir s'{0} perdent tout le temps.", [they])
              : tl("Trop peu de ces trades sur une des deux parties du test pour savoir s'{0} gagnent tout le temps.", [they])
            : weak
              ? tl("Mais {0} ne perdent pas sur toute la période ({1}) : ça peut être du hasard.", [they, halves])
              : tl("Mais {0} ne gagnent pas sur toute la période ({1}) : ça peut être du hasard.", [they, halves])}
      </p>
    </div>
  );
}

/** Fed and ECB decisions, US inflation and jobs figures: how the trades open on those days did against the others. */
function EventsCard({ ev, unit, avgAll }: { ev: EventDays; unit: Unit; avgAll: number }) {
  const tl = useT();
  const on = ev.split.find((b) => b.key === "event");
  const off = ev.split.find((b) => b.key === "quiet");
  const total = (on?.trades ?? 0) + (off?.trades ?? 0);
  // Worth a warning when announcement days do clearly worse than the rest (a tenth of a R, or of a %, at least).
  const worse = on && off && on.trades >= 5 && on.avg < off.avg - 0.1 && on.avg < avgAll;
  return (
    <Card
      title={
        <span className="flex items-center">
          {tl("Annonces économiques")}<Help id="annonces-economiques" />
        </span>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {!on ? (
          <p>{tl("Aucun trade n'était en position un jour d'annonce : la stratégie n'a jamais été exposée à ces rendez-vous.")}</p>
        ) : (
          <p className={worse ? "rounded-md border border-warn/40 bg-warn/10 px-3 py-2" : ""}>
            {rich(
              on.trades > 1
                ? tl("{0} trades sur {1} étaient en position un jour d'annonce : {2} en moyenne")
                : tl("{0} trade sur {1} était en position un jour d'annonce : {2} en moyenne"),
              [<strong key="n">{on.trades}</strong>, <strong key="t">{total}</strong>, <strong key="a" className={tone(on.avg)}>{fmt(on.avg, unit)}</strong>],
            )}
            {off ? rich(tl(", contre {0} les autres jours."), [<span key="o" className={tone(off.avg)}>{fmt(off.avg, unit)}</span>]) : "."}
            {worse && tl(" Ces jours-là coûtent à ta stratégie : regarde si l'écart tient sur les deux parties du test avant de les éviter.")}
          </p>
        )}
        <BucketTable rows={ev.split} unit={unit} />
        {ev.kinds.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-muted">{tl("Par annonce (un trade en position pendant plusieurs annonces compte dans chacune)")}</p>
            <BucketTable rows={ev.kinds} unit={unit} />
          </div>
        )}
        <p className="text-xs text-muted">
          {tl("Décisions de taux de la Fed et de la BCE (dont les décisions d'urgence de mars 2020), chiffres de l'inflation (CPI) et de l'emploi (NFP) américains, d'après les calendriers officiels depuis 2017. Un trade compte s'il était en position à un moment du jour de l'annonce, à l'heure de New York (de Francfort pour la BCE).")}{ev.outside > 0 && (ev.outside > 1 ? tl(" {0} trades hors des années couvertes ne sont pas comptés.", [ev.outside]) : tl(" 1 trade hors des années couvertes n'est pas compté."))}
        </p>
      </div>
    </Card>
  );
}

/** One row per group, with a bar centred on zero for its average trade. */
function BucketTable({ rows, unit }: { rows: Bucket[]; unit: Unit }) {
  const tl = useT();
  const max = Math.max(...rows.map((b) => Math.abs(b.avg)), 1e-9);
  return (
    <table className="num w-full text-sm">
      <thead className="text-xs text-muted">
        <tr>
          <th className="text-left font-normal"></th>
          <th className="text-right font-normal">{tl("Trades")}</th>
          <th className="text-right font-normal">{tl("Gagnants")}</th>
          <th className="text-right font-normal">{tl("Moyenne")}</th>
          <th className="w-[28%] font-normal"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((b) => {
          const w = (Math.abs(b.avg) / max) * 50;
          return (
            <tr key={b.key} className="border-t border-line/50">
              <td className="py-1 pr-2 text-left">{tl(b.label)}</td>
              <td className="text-right">{b.trades}</td>
              <td className="text-right">{pct(b.winRate, 0, false)}</td>
              <td className={`text-right ${tone(b.avg)}`}>{fmt(b.avg, unit)}</td>
              <td className="pl-3">
                <div className="relative h-2 rounded bg-panel-2" aria-hidden>
                  <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
                  <div className={`absolute inset-y-0 rounded ${b.avg >= 0 ? "left-1/2 bg-up" : "bg-down"}`} style={b.avg >= 0 ? { width: `${w}%` } : { width: `${w}%`, right: "50%" }} />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ExcursionsCard({ e, strategy }: { e: NonNullable<ReturnType<typeof excursions>>; strategy: Strategy }) {
  const tl = useT();
  const notes: string[] = [];
  if (e.winnersDepthP80 !== null && e.winners >= 10) {
    const d = e.winnersDepthP80;
    let note = tl("80 % de tes gagnants ne sont jamais descendus sous −{0} R avant de gagner.", [bound(d)]);
    if (d <= 0.6 && strategy.stop.type !== "none")
      note += tl(" Ton stop est peut-être plus large qu'il ne faut : essaie-le plus serré et compare (à risque égal, un stop plus proche agrandit aussi la position).");
    else if (d >= 0.8) note += tl(" Ils ont souvent frôlé le stop : le resserrer couperait beaucoup de gagnants.");
    notes.push(note);
  }
  if (e.losers >= 10) {
    const share = (e.losersPast1R / e.losers) * 100;
    let note =
      e.losersPast1R === 0
        ? tl("Aucun de tes {0} perdants n'avait d'abord gagné +1 R : ils partent contre toi presque tout de suite.", [e.losers])
        : e.losersPast1R > 1
          ? tl("{0} perdants sur {1} ({2}) avaient d'abord gagné au moins +1 R.", [e.losersPast1R, e.losers, pct(share, 0, false)])
          : tl("1 perdant sur {0} ({1}) avait d'abord gagné au moins +1 R.", [e.losers, pct(share, 0, false)]);
    if (strategy.breakEvenAtR === null && share >= 20)
      note += tl(" Un stop au point mort à 1 R les aurait sortis sans perte, mais il sortirait aussi des gagnants qui reculent avant de repartir : teste-le.");
    notes.push(note);
  }
  if (e.winnersKept !== null && e.winners >= 10) {
    let note = tl("À la sortie, tes gagnants gardent en moyenne {0} de leur meilleur moment.", [pct(e.winnersKept * 100, 0, false)]);
    if (e.winnersKept < 0.5) note += tl(" Ils rendent beaucoup avant de se fermer : un stop suiveur ou une sortie plus tôt garderait davantage.");
    notes.push(note);
  }
  return (
    <Card
      title={
        <span className="flex items-center">
          {tl("Stops et sorties : ce que disent tes trades")}<Help id="mae-mfe" />
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <div className="grid gap-4 md:grid-cols-2">
          <BandChart title={tl("Pire moment pendant le trade (sous l'entrée)")} bands={e.depth} last={tl("R et plus (stop)")} />
          <BandChart title={tl("Meilleur moment pendant le trade (au-dessus de l'entrée)")} bands={e.peak} last={tl("R ou plus")} />
        </div>
      </div>
    </Card>
  );
}

function BandChart({ title, bands, last }: { title: string; bands: Band[]; last: string }) {
  const tl = useT();
  const max = Math.max(...bands.map((b) => b.wins + b.losses), 1);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium">{title}</span>
        <span className="flex gap-3 text-muted">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-up" /> {tl("gagnants")}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-down" /> {tl("perdants")}
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {bands.map((b) => (
          <div key={b.from} className="grid grid-cols-[108px_minmax(0,1fr)_52px] items-center gap-2 text-xs">
            <span className="num text-muted">{b.to === null ? `${bound(b.from)} ${last}` : tl("{0} à {1} R", [bound(b.from), bound(b.to)])}</span>
            <div className="flex h-3 overflow-hidden rounded bg-panel-2">
              <div className="bg-up" style={{ width: `${(b.wins / max) * 100}%` }} title={tl("{0} gagnants", [b.wins])} />
              <div className="bg-down" style={{ width: `${(b.losses / max) * 100}%` }} title={tl("{0} perdants", [b.losses])} />
            </div>
            <span className="num text-right text-muted">
              {b.wins} / {b.losses}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The "Risque" tab: drawdowns at several risk levels, losing streaks to expect, Kelly and the weight of costs. */
export function RiskPanel({ trades, strategy }: { trades: Trade[]; strategy: Strategy }) {
  const tl = useT();
  const hasStop = tradeUnit(trades) === "R";
  const baseRisk = hasStop ? strategy.riskPerTradePercent : strategy.positionSizePercent;
  const [result, setResult] = useState<{ trades: Trade[]; sizing: RiskSizing | null } | null>(null);

  useEffect(() => {
    // Lets the tab paint before the simulation blocks the main thread.
    const timer = setTimeout(() => setResult({ trades, sizing: riskSizing(trades, baseRisk) }), 30);
    return () => clearTimeout(timer);
  }, [trades, baseRisk]);

  if (trades.length < 10) return <Alert>{tl("Il faut au moins 10 trades pour estimer le risque à prendre.")}</Alert>;
  if (!result || result.trades !== trades) return <p className="text-sm text-muted">{tl("Simulation en cours…")}</p>;
  const s = result.sizing;
  if (!s) return null;
  const unit = s.unit;
  const avgTrade = trades.reduce((sum, t) => sum + (unit === "R" ? t.r! : t.pnlPercent), 0) / trades.length;
  const safe = safeRisk(s.levels);
  const streakCost = hasStop ? (1 - (1 - baseRisk / 100) ** s.streakP95) * 100 : null;

  return (
    <div className="flex flex-col gap-4">
      <Tip>{tl("Le même avantage peut enrichir ou ruiner selon la part du capital risquée à chaque trade. Cet onglet rejoue tes trades à plusieurs niveaux de risque.")}</Tip>
      {hasStop ? (
        <Card
          title={
            <span className="flex items-center">
              {tl("Quel risque par trade ?")}<Help id="risque-par-trade" />
            </span>
          }
        >
          <div className="flex flex-col gap-3">
            <Alert tone={avgTrade <= 0 ? "error" : safe === null || baseRisk > safe ? "warn" : "info"}>
              {avgTrade <= 0
                ? tl("La stratégie perd en moyenne : risquer plus ne ferait qu'accélérer les pertes.")
                : safe === null
                  ? tl("Même à 0,5 % par trade, la baisse dépasse 20 % dans les cas défavorables : la stratégie est très irrégulière.")
                  : tl("Pour que la baisse reste sous 20 % même dans les cas défavorables, ne risque pas plus de {0} % par trade.{1}{2}", [num(safe, 1), baseRisk > safe ? tl(" Ton réglage ({0} %) va au-delà.", [num(baseRisk, 1)]) : "", safe > 2 ? tl(" Au-delà de 2 %, la plupart des traders jugent le risque excessif, même quand le test le supporte.") : ""])}
            </Alert>
            <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
              <table className="num w-full min-w-[560px] text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="text-left font-normal">{tl("Risque par trade")}</th>
                    <th className="text-right font-normal">{tl("Rendement médian")}</th>
                    <th className="text-right font-normal">{tl("Baisse max médiane")}</th>
                    <th className="text-right font-normal">{tl("Baisse max, cas défavorable")}</th>
                    <th className="text-right font-normal">{tl("Chance de −20 %")}</th>
                    <th className="text-right font-normal">{tl("Chance de −50 %")}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.levels.map((l) => (
                    <tr key={l.risk} className={`border-t border-line/50 ${l.risk === baseRisk ? "font-semibold" : ""}`}>
                      <td className="py-1.5 text-left">
                        {num(l.risk, 1)} %{l.risk === baseRisk && <span className="ml-1.5 text-xs font-normal text-accent">{tl("ton réglage")}</span>}
                      </td>
                      <td className={`text-right ${tone(l.medianReturn)}`}>{pct(l.medianReturn, 0)}</td>
                      <td className="text-right text-down">{pct(-l.drawdownP50, 0)}</td>
                      <td className="text-right text-down">{pct(-l.drawdownP95, 0)}</td>
                      <td className="text-right">{pct(l.probDrawdown20, 0, false)}</td>
                      <td className={`text-right ${l.probDrawdown50 >= 5 ? "text-down" : ""}`}>{pct(l.probDrawdown50, 0, false)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">
              {tl("Tes ")}{s.trades} {tl(" trades rejoués dans ")}{num(s.iterations, 0)} {tl(" ordres tirés au hasard, à chaque niveau de risque. « Cas défavorable » : pire que 95 % des tirages. En réel, prévois une marge : les baisses dépassent souvent celles du test.")}</p>
          </div>
        </Card>
      ) : (
        <Alert tone="info">{tl("Sans stop, le risque d'un trade n'est pas défini : ajoute un stop pour comparer les niveaux de risque par trade.")}</Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title={
            <span className="flex items-center">
              {tl("Les séries de pertes à prévoir")}<Help id="pertes-affilee" />
            </span>
          }
        >
          <p className="text-sm">
            {tl("Sur ")}{s.trades} {tl(" trades, attends-toi à environ ")}<strong>{s.streakP50}</strong> {tl(" pertes d'affilée, et jusqu'à ")}<strong>{s.streakP95}</strong> {tl(" dans les cas défavorables.")}{streakCost !== null && tl(" À {0} % par trade, {1} pertes d'affilée font environ {2}.", [num(baseRisk, 1), s.streakP95, pct(-streakCost, 0)])}
          </p>
          <p className="mt-2 text-xs text-muted">{tl("Demande-toi si tu suivrais encore la stratégie après une telle série : c'est là que la plupart des traders abandonnent ou doublent la mise.")}</p>
        </Card>
        {s.kelly !== null && (
          <Card
            title={
              <span className="flex items-center">
                {tl("Critère de Kelly")}<Help id="kelly" />
              </span>
            }
          >
            {s.kelly > 0 ? (
              <p className="text-sm">
                {tl("Kelly donne ")}<strong>{num(s.kelly, 1)} %</strong> {tl(" du capital par trade. C'est un plafond théorique, pas un réglage : il suppose que la suite ressemblera exactement au test et provoque des baisses très fortes. Les traders prudents restent à un quart de Kelly ou moins (")}{num(s.kelly / 4, 1)} {tl(" %), et en général entre 0,5 et 2 %.")}</p>
            ) : (
              <p className="text-sm">{tl("Kelly vaut 0 : sans avantage mesurable, il conseille de ne pas trader cette stratégie.")}</p>
            )}
          </Card>
        )}
        <Card
          title={
            <span className="flex items-center">
              {tl("Ce que coûtent les frais")}<Help id="taux-equilibre" />
            </span>
          }
        >
          <div className="flex flex-col gap-2 text-sm">
            <p>
              {tl("Pour ne pas perdre, il te faut ")}<strong>{pct(s.breakEven.needed, 0, false)}</strong> {tl(" de trades gagnants avec tes frais")}{s.breakEven.neededWithoutCosts !== null && <>, {pct(s.breakEven.neededWithoutCosts, 0, false)} {tl(" s'ils étaient nuls")}</>}{tl(". Les tiens :")}{" "}
              <strong className={s.breakEven.actual >= s.breakEven.needed ? "text-up" : "text-down"}>{pct(s.breakEven.actual, 0, false)}</strong>.
            </p>
            <p>
              {tl("Les frais coûtent en moyenne ")}{unit === "R" ? `${num(s.costPerTrade)} R` : pct(s.costPerTrade, 2, false)} {tl(" par trade")}{s.costShareOfEdge !== null ? tl(", soit {0} du gain moyen avant frais.", [pct(s.costShareOfEdge, 0, false)]) : tl(" : la stratégie perd déjà avant frais.")}
            </p>
            {s.costShareOfEdge !== null && s.costShareOfEdge >= 30 && (
              <p className="text-xs text-warn">
                {tl("Les frais mangent une grosse part de l'avantage : vise des mouvements plus grands (unité de temps plus longue, objectif plus loin) ou des coûts plus bas.")}</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
