"use client";

import { useEffect, useMemo, useState } from "react";
import { num, pct, r, tone } from "@/lib/client/format";
import type { Trade } from "@/lib/engine/backtest";
import { breakdowns, excursions, riskSizing, safeRisk, tradeUnit, type Band, type Bucket, type EventDays, type Finding, type RiskSizing, type Unit } from "@/lib/engine/insights";
import type { Strategy } from "@/lib/strategy/schema";
import { Help, Tip } from "./learn";
import { Alert, Card } from "./ui";

const fmt = (x: number | null | undefined, unit: Unit, digits = 2) => (unit === "R" ? r(x, digits) : pct(x, digits));
/** "0,25" without trailing zeros, for band bounds. */
const bound = (x: number) => x.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

/** The "Analyse" tab: where the strategy wins and loses, and what the excursions say about stops and exits. */
export function AnalysisPanel({ trades, strategy, period }: { trades: Trade[]; strategy: Strategy; period: { from: number; to: number } }) {
  const b = useMemo(() => breakdowns(trades, strategy.timezone, strategy.interval, period.from, period.to), [trades, strategy, period]);
  const e = useMemo(() => excursions(trades), [trades]);
  if (trades.length < 10) return <Alert>Il faut au moins 10 trades pour analyser d&apos;où viennent les gains et les pertes.</Alert>;
  const unit = b.unit;
  const tables = [
    b.byHour && { title: `Heure d'entrée (${strategy.timezone})`, rows: b.byHour },
    b.byWeekday && { title: "Jour d'entrée", rows: b.byWeekday },
    b.bySide && { title: "Sens", rows: b.bySide },
    { title: "Raison de sortie", rows: b.byExit },
  ].filter((x): x is { title: string; rows: Bucket[] } => !!x);

  return (
    <div className="flex flex-col gap-4">
      <Tip>Tes trades regroupés par heure, par jour, par sens, par sortie et selon les annonces économiques : de quoi voir si les pertes viennent toujours du même endroit.</Tip>
      <Card
        title={
          <span className="flex items-center">
            {!b.findings.length ? "Où ta stratégie gagne et perd" : b.avg > 0 ? "Où ta stratégie perd" : "Où ta stratégie gagne encore"}
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
              Avant d&apos;ajouter un filtre, relance le test et regarde s&apos;il tient sur la période de validation : trier après coup les trades qui ont gagné ou perdu améliore
              toujours le passé, sans rien promettre pour la suite.
            </p>
          </div>
        ) : b.avg > 0 ? (
          <p className="text-sm">
            Aucun groupe de trades ne perd nettement : les résultats ne dépendent pas d&apos;une heure, d&apos;un jour, d&apos;un sens ou des annonces économiques.
          </p>
        ) : (
          <p className="text-sm">
            La stratégie perd dans tous les groupes : le problème vient des règles elles-mêmes, pas d&apos;une heure, d&apos;un jour, d&apos;un sens ou d&apos;annonces qu&apos;il suffirait
            d&apos;écarter.
          </p>
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
        <Alert tone="info">Ajoute un stop pour mesurer, en R, jusqu&apos;où tes trades vont contre toi et en ta faveur avant de se fermer.</Alert>
      )}
    </div>
  );
}

function FindingNote({ f, unit }: { f: Finding; unit: Unit }) {
  const halves = `période d'étude ${fmt(f.study, unit)}, validation ${fmt(f.validation, unit)}`;
  const [they, them] = f.bucket.feminine ? ["elles", "elles"] : ["ils", "eux"];
  const They = they[0].toUpperCase() + they.slice(1);
  const weak = f.kind === "weak";
  const verb = weak ? "perdent" : "gagnent";
  const box = !f.steady ? "border-warn/40 bg-warn/10" : weak ? "border-down/40 bg-down/10" : "border-up/40 bg-up/10";
  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${box}`}>
      {weak ? (
        <p>
          <strong>{f.bucket.subject}</strong> font <strong className="text-down">{fmt(f.bucket.avg, unit)}</strong> en moyenne sur {f.bucket.trades} trades. Sans {them}, ton
          gain moyen passerait de <span className={tone(f.avgAll)}>{fmt(f.avgAll, unit)}</span> à <strong className={tone(f.avgWithout)}>{fmt(f.avgWithout, unit)}</strong>.
        </p>
      ) : (
        <p>
          <strong>{f.bucket.subject}</strong> gagnent <strong className="text-up">{fmt(f.bucket.avg, unit)}</strong> en moyenne sur {f.bucket.trades} trades, alors que la
          stratégie perd <span className="text-down">{fmt(f.avgAll, unit)}</span> par trade dans l&apos;ensemble.
        </p>
      )}
      <p className="mt-1 text-fg/80">
        {f.steady
          ? weak
            ? `${They} perdent du début à la fin du test (${halves}) : c'est plus probablement un vrai point faible qu'un hasard.`
            : `${They} gagnent du début à la fin du test (${halves}) : une piste à tester, en ne gardant que ces trades.`
          : f.study === null || f.validation === null
            ? `Trop peu de ces trades sur une des deux parties du test pour savoir s'${they} ${verb} tout le temps.`
            : `Mais ${they} ne ${verb} pas sur toute la période (${halves}) : ça peut être du hasard.`}
      </p>
    </div>
  );
}

/** Fed and ECB decisions, US inflation and jobs figures: how the trades open on those days did against the others. */
function EventsCard({ ev, unit, avgAll }: { ev: EventDays; unit: Unit; avgAll: number }) {
  const on = ev.split.find((b) => b.key === "event");
  const off = ev.split.find((b) => b.key === "quiet");
  const total = (on?.trades ?? 0) + (off?.trades ?? 0);
  // Worth a warning when announcement days do clearly worse than the rest (a tenth of a R, or of a %, at least).
  const worse = on && off && on.trades >= 5 && on.avg < off.avg - 0.1 && on.avg < avgAll;
  return (
    <Card
      title={
        <span className="flex items-center">
          Annonces économiques
          <Help id="annonces-economiques" />
        </span>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {!on ? (
          <p>Aucun trade n&apos;était en position un jour d&apos;annonce : la stratégie n&apos;a jamais été exposée à ces rendez-vous.</p>
        ) : (
          <p className={worse ? "rounded-md border border-warn/40 bg-warn/10 px-3 py-2" : ""}>
            <strong>
              {on.trades} trade{on.trades > 1 ? "s" : ""} sur {total}
            </strong>{" "}
            {on.trades > 1 ? "étaient" : "était"} en position un jour d&apos;annonce : <strong className={tone(on.avg)}>{fmt(on.avg, unit)}</strong> en moyenne
            {off ? (
              <>
                , contre <span className={tone(off.avg)}>{fmt(off.avg, unit)}</span> les autres jours.
              </>
            ) : (
              "."
            )}
            {worse && " Ces jours-là coûtent à ta stratégie : regarde si l'écart tient sur les deux parties du test avant de les éviter."}
          </p>
        )}
        <BucketTable rows={ev.split} unit={unit} />
        {ev.kinds.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-muted">Par annonce (un trade en position pendant plusieurs annonces compte dans chacune)</p>
            <BucketTable rows={ev.kinds} unit={unit} />
          </div>
        )}
        <p className="text-xs text-muted">
          Décisions de taux de la Fed et de la BCE (dont les décisions d&apos;urgence de mars 2020), chiffres de l&apos;inflation (CPI) et de l&apos;emploi (NFP) américains, d&apos;après
          les calendriers officiels depuis 2017. Un trade compte s&apos;il était en position à un moment du jour de l&apos;annonce, à l&apos;heure de New York (de Francfort pour la BCE).
          {ev.outside > 0 && ` ${ev.outside} trade${ev.outside > 1 ? "s" : ""} hors des années couvertes ne ${ev.outside > 1 ? "sont" : "est"} pas compté${ev.outside > 1 ? "s" : ""}.`}
        </p>
      </div>
    </Card>
  );
}

/** One row per group, with a bar centred on zero for its average trade. */
function BucketTable({ rows, unit }: { rows: Bucket[]; unit: Unit }) {
  const max = Math.max(...rows.map((b) => Math.abs(b.avg)), 1e-9);
  return (
    <table className="num w-full text-sm">
      <thead className="text-xs text-muted">
        <tr>
          <th className="text-left font-normal"></th>
          <th className="text-right font-normal">Trades</th>
          <th className="text-right font-normal">Gagnants</th>
          <th className="text-right font-normal">Moyenne</th>
          <th className="w-[28%] font-normal"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((b) => {
          const w = (Math.abs(b.avg) / max) * 50;
          return (
            <tr key={b.key} className="border-t border-line/50">
              <td className="py-1 pr-2 text-left">{b.label}</td>
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
  const notes: string[] = [];
  if (e.winnersDepthP80 !== null && e.winners >= 10) {
    const d = e.winnersDepthP80;
    let note = `80 % de tes gagnants ne sont jamais descendus sous −${bound(d)} R avant de gagner.`;
    if (d <= 0.6 && strategy.stop.type !== "none")
      note += " Ton stop est peut-être plus large qu'il ne faut : essaie-le plus serré et compare (à risque égal, un stop plus proche agrandit aussi la position).";
    else if (d >= 0.8) note += " Ils ont souvent frôlé le stop : le resserrer couperait beaucoup de gagnants.";
    notes.push(note);
  }
  if (e.losers >= 10) {
    const share = (e.losersPast1R / e.losers) * 100;
    let note =
      e.losersPast1R === 0
        ? `Aucun de tes ${e.losers} perdants n'avait d'abord gagné +1 R : ils partent contre toi presque tout de suite.`
        : `${e.losersPast1R} perdant${e.losersPast1R > 1 ? "s" : ""} sur ${e.losers} (${pct(share, 0, false)}) ${e.losersPast1R > 1 ? "avaient" : "avait"} d'abord gagné au moins +1 R.`;
    if (strategy.breakEvenAtR === null && share >= 20)
      note += " Un stop au point mort à 1 R les aurait sortis sans perte, mais il sortirait aussi des gagnants qui reculent avant de repartir : teste-le.";
    notes.push(note);
  }
  if (e.winnersKept !== null && e.winners >= 10) {
    let note = `À la sortie, tes gagnants gardent en moyenne ${pct(e.winnersKept * 100, 0, false)} de leur meilleur moment.`;
    if (e.winnersKept < 0.5) note += " Ils rendent beaucoup avant de se fermer : un stop suiveur ou une sortie plus tôt garderait davantage.";
    notes.push(note);
  }
  return (
    <Card
      title={
        <span className="flex items-center">
          Stops et sorties : ce que disent tes trades
          <Help id="mae-mfe" />
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
          <BandChart title="Pire moment pendant le trade (sous l'entrée)" bands={e.depth} last="R et plus (stop)" />
          <BandChart title="Meilleur moment pendant le trade (au-dessus de l'entrée)" bands={e.peak} last="R ou plus" />
        </div>
      </div>
    </Card>
  );
}

function BandChart({ title, bands, last }: { title: string; bands: Band[]; last: string }) {
  const max = Math.max(...bands.map((b) => b.wins + b.losses), 1);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium">{title}</span>
        <span className="flex gap-3 text-muted">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-up" /> gagnants
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-down" /> perdants
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {bands.map((b) => (
          <div key={b.from} className="grid grid-cols-[108px_minmax(0,1fr)_52px] items-center gap-2 text-xs">
            <span className="num text-muted">{b.to === null ? `${bound(b.from)} ${last}` : `${bound(b.from)} à ${bound(b.to)} R`}</span>
            <div className="flex h-3 overflow-hidden rounded bg-panel-2">
              <div className="bg-up" style={{ width: `${(b.wins / max) * 100}%` }} title={`${b.wins} gagnants`} />
              <div className="bg-down" style={{ width: `${(b.losses / max) * 100}%` }} title={`${b.losses} perdants`} />
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
  const hasStop = tradeUnit(trades) === "R";
  const baseRisk = hasStop ? strategy.riskPerTradePercent : strategy.positionSizePercent;
  const [result, setResult] = useState<{ trades: Trade[]; sizing: RiskSizing | null } | null>(null);

  useEffect(() => {
    // Lets the tab paint before the simulation blocks the main thread.
    const timer = setTimeout(() => setResult({ trades, sizing: riskSizing(trades, baseRisk) }), 30);
    return () => clearTimeout(timer);
  }, [trades, baseRisk]);

  if (trades.length < 10) return <Alert>Il faut au moins 10 trades pour estimer le risque à prendre.</Alert>;
  if (!result || result.trades !== trades) return <p className="text-sm text-muted">Simulation en cours…</p>;
  const s = result.sizing;
  if (!s) return null;
  const unit = s.unit;
  const avgTrade = trades.reduce((sum, t) => sum + (unit === "R" ? t.r! : t.pnlPercent), 0) / trades.length;
  const safe = safeRisk(s.levels);
  const streakCost = hasStop ? (1 - (1 - baseRisk / 100) ** s.streakP95) * 100 : null;

  return (
    <div className="flex flex-col gap-4">
      <Tip>Le même avantage peut enrichir ou ruiner selon la part du capital risquée à chaque trade. Cet onglet rejoue tes trades à plusieurs niveaux de risque.</Tip>
      {hasStop ? (
        <Card
          title={
            <span className="flex items-center">
              Quel risque par trade ?
              <Help id="risque-par-trade" />
            </span>
          }
        >
          <div className="flex flex-col gap-3">
            <Alert tone={avgTrade <= 0 ? "error" : safe === null || baseRisk > safe ? "warn" : "info"}>
              {avgTrade <= 0
                ? "La stratégie perd en moyenne : risquer plus ne ferait qu'accélérer les pertes."
                : safe === null
                  ? "Même à 0,5 % par trade, la baisse dépasse 20 % dans les cas défavorables : la stratégie est très irrégulière."
                  : `Pour que la baisse reste sous 20 % même dans les cas défavorables, ne risque pas plus de ${num(safe, 1)} % par trade.${baseRisk > safe ? ` Ton réglage (${num(baseRisk, 1)} %) va au-delà.` : ""}${safe > 2 ? " Au-delà de 2 %, la plupart des traders jugent le risque excessif, même quand le test le supporte." : ""}`}
            </Alert>
            <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
              <table className="num w-full min-w-[560px] text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="text-left font-normal">Risque par trade</th>
                    <th className="text-right font-normal">Rendement médian</th>
                    <th className="text-right font-normal">Baisse max médiane</th>
                    <th className="text-right font-normal">Baisse max, cas défavorable</th>
                    <th className="text-right font-normal">Chance de −20 %</th>
                    <th className="text-right font-normal">Chance de −50 %</th>
                  </tr>
                </thead>
                <tbody>
                  {s.levels.map((l) => (
                    <tr key={l.risk} className={`border-t border-line/50 ${l.risk === baseRisk ? "font-semibold" : ""}`}>
                      <td className="py-1.5 text-left">
                        {num(l.risk, 1)} %{l.risk === baseRisk && <span className="ml-1.5 text-xs font-normal text-accent">ton réglage</span>}
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
              Tes {s.trades} trades rejoués dans {num(s.iterations, 0)} ordres tirés au hasard, à chaque niveau de risque. « Cas défavorable » : pire que 95 % des tirages. En réel,
              prévois une marge : les baisses dépassent souvent celles du test.
            </p>
          </div>
        </Card>
      ) : (
        <Alert tone="info">Sans stop, le risque d&apos;un trade n&apos;est pas défini : ajoute un stop pour comparer les niveaux de risque par trade.</Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title={
            <span className="flex items-center">
              Les séries de pertes à prévoir
              <Help id="pertes-affilee" />
            </span>
          }
        >
          <p className="text-sm">
            Sur {s.trades} trades, attends-toi à environ <strong>{s.streakP50}</strong> pertes d&apos;affilée, et jusqu&apos;à <strong>{s.streakP95}</strong> dans les cas
            défavorables.
            {streakCost !== null && ` À ${num(baseRisk, 1)} % par trade, ${s.streakP95} pertes d'affilée font environ ${pct(-streakCost, 0)}.`}
          </p>
          <p className="mt-2 text-xs text-muted">Demande-toi si tu suivrais encore la stratégie après une telle série : c&apos;est là que la plupart des traders abandonnent ou doublent la mise.</p>
        </Card>
        {s.kelly !== null && (
          <Card
            title={
              <span className="flex items-center">
                Critère de Kelly
                <Help id="kelly" />
              </span>
            }
          >
            {s.kelly > 0 ? (
              <p className="text-sm">
                Kelly donne <strong>{num(s.kelly, 1)} %</strong> du capital par trade. C&apos;est un plafond théorique, pas un réglage : il suppose que la suite ressemblera exactement au
                test et provoque des baisses très fortes. Les traders prudents restent à un quart de Kelly ou moins ({num(s.kelly / 4, 1)} %), et en général entre 0,5 et 2 %.
              </p>
            ) : (
              <p className="text-sm">Kelly vaut 0 : sans avantage mesurable, il conseille de ne pas trader cette stratégie.</p>
            )}
          </Card>
        )}
        <Card
          title={
            <span className="flex items-center">
              Ce que coûtent les frais
              <Help id="taux-equilibre" />
            </span>
          }
        >
          <div className="flex flex-col gap-2 text-sm">
            <p>
              Pour ne pas perdre, il te faut <strong>{pct(s.breakEven.needed, 0, false)}</strong> de trades gagnants avec tes frais
              {s.breakEven.neededWithoutCosts !== null && <>, {pct(s.breakEven.neededWithoutCosts, 0, false)} s&apos;ils étaient nuls</>}. Les tiens :{" "}
              <strong className={s.breakEven.actual >= s.breakEven.needed ? "text-up" : "text-down"}>{pct(s.breakEven.actual, 0, false)}</strong>.
            </p>
            <p>
              Les frais coûtent en moyenne {unit === "R" ? `${num(s.costPerTrade)} R` : pct(s.costPerTrade, 2, false)} par trade
              {s.costShareOfEdge !== null ? `, soit ${pct(s.costShareOfEdge, 0, false)} du gain moyen avant frais.` : " : la stratégie perd déjà avant frais."}
            </p>
            {s.costShareOfEdge !== null && s.costShareOfEdge >= 30 && (
              <p className="text-xs text-warn">
                Les frais mangent une grosse part de l&apos;avantage : vise des mouvements plus grands (unité de temps plus longue, objectif plus loin) ou des coûts plus bas.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
