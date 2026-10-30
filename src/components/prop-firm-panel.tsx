"use client";

import { useEffect, useState } from "react";
import type { Trade } from "@/lib/engine/backtest";
import { PROP_PRESETS, simulatePropFirm, type PropResult, type PropRules, type PropSummary } from "@/lib/engine/propfirm";
import type { Strategy } from "@/lib/strategy/schema";
import { num, pct } from "@/lib/client/format";
import { Alert, Card, Field } from "./ui";

export function PropFirmPanel({ trades, strategy }: { trades: Trade[]; strategy: Strategy }) {
  const hasStop = trades.length > 0 && trades.every((t) => t.r !== null);
  const baseRisk = hasStop ? strategy.riskPerTradePercent : strategy.positionSizePercent;
  const [rules, setRules] = useState<PropRules>(PROP_PRESETS[0]);
  const [risk, setRisk] = useState(hasStop ? 1 : baseRisk);
  const [computed, setComputed] = useState<{ key: string; result: PropResult } | null>(null);
  const key = JSON.stringify({ rules, risk });
  const computing = computed?.key !== key;
  const result = computed?.result ?? null;

  useEffect(() => {
    if (trades.length < 5 || !(risk > 0)) return;
    // Debounced, and lets the "computing" message paint before the simulation blocks the main thread.
    const timer = setTimeout(() => setComputed({ key, result: simulatePropFirm(trades, rules, risk / baseRisk, 2000) }), 200);
    return () => clearTimeout(timer);
  }, [trades, rules, risk, baseRisk, key]);

  if (trades.length < 5) return <Alert>Il faut au moins 5 trades pour simuler un challenge.</Alert>;

  const setPhaseTarget = (i: number, v: number) => setRules({ ...rules, phases: rules.phases.map((p, k) => (k === i ? { ...p, targetPercent: v } : p)) });

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card title="Règles du challenge">
        <div className="flex flex-col gap-3">
          <Field label="Modèle">
            <select
              value={PROP_PRESETS.findIndex((p) => p.name === rules.name)}
              onChange={(e) => {
                const p = PROP_PRESETS[Number(e.target.value)];
                if (p) setRules(p);
              }}
            >
              {PROP_PRESETS.map((p, i) => (
                <option key={p.name} value={i}>
                  {p.name}
                </option>
              ))}
              <option value={-1} disabled>
                Personnalisé
              </option>
            </select>
          </Field>
          <Field label={hasStop ? "Risque par trade (% du compte)" : "Taille de position (% du compte)"} hint={`Le backtest a été fait à ${baseRisk} %. Les résultats sont remis à cette échelle.`}>
            <input type="number" step="0.1" min="0.1" value={risk} onChange={(e) => setRisk(Number(e.target.value))} />
          </Field>
          {rules.phases.map((p, i) => (
            <Field key={i} label={`Objectif ${p.name} (%)`}>
              <input type="number" step="0.5" value={p.targetPercent} onChange={(e) => setPhaseTarget(i, Number(e.target.value))} />
            </Field>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Perte max / jour (%)">
              <input type="number" step="0.5" value={rules.maxDailyLossPercent} onChange={(e) => setRules({ ...rules, name: "Personnalisé", maxDailyLossPercent: Number(e.target.value) })} />
            </Field>
            <Field label="Perte max totale (%)">
              <input type="number" step="0.5" value={rules.maxTotalLossPercent} onChange={(e) => setRules({ ...rules, name: "Personnalisé", maxTotalLossPercent: Number(e.target.value) })} />
            </Field>
            <Field label="Jours de trading min">
              <input type="number" value={rules.minTradingDays} onChange={(e) => setRules({ ...rules, name: "Personnalisé", minTradingDays: Number(e.target.value) })} />
            </Field>
            <Field label="Jours max / phase" hint="vide = illimité">
              <input type="number" value={rules.maxDaysPerPhase ?? ""} onChange={(e) => setRules({ ...rules, name: "Personnalisé", maxDaysPerPhase: e.target.value ? Number(e.target.value) : null })} />
            </Field>
          </div>
          <p className="text-[11px] text-muted">
            Vérifie les règles exactes de ta prop firm : elles changent souvent. La perte journalière est comptée depuis le solde du début de journée (UTC), avec la pire baisse de chaque trade.
          </p>
        </div>
      </Card>
      <div className="flex flex-col gap-4">
        {computing && <p className="text-sm text-muted">Simulation en cours…</p>}
        {result && (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <SummaryCard title="Sur l'historique réel" hint="Un challenge démarré à chaque trade du test" s={result.historical} />
              <SummaryCard title="Monte Carlo" hint="2 000 suites de trades tirées au hasard" s={result.monteCarlo} />
              <SummaryCard title="Sans avantage (hasard)" hint="Mêmes trades, gain moyen ramené à zéro" s={result.noEdge} muted />
            </div>
            <Alert tone={result.monteCarlo.passRate >= 60 ? "info" : "warn"}>{advice(result, risk, hasStop)}</Alert>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ title, hint, s, muted }: { title: string; hint: string; s: PropSummary; muted?: boolean }) {
  return (
    <Card title={title}>
      <div className={`num text-3xl font-semibold ${muted ? "text-muted" : s.passRate >= 60 ? "text-up" : s.passRate >= 35 ? "text-warn" : "text-down"}`}>{pct(s.passRate, 0, false)}</div>
      <div className="text-xs text-muted">de réussite · {hint}</div>
      <dl className="num mt-3 grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-muted">Échec perte du jour</dt>
        <dd className="text-right">{pct(s.failDaily, 0, false)}</dd>
        <dt className="text-muted">Échec perte totale</dt>
        <dd className="text-right">{pct(s.failTotal, 0, false)}</dd>
        <dt className="text-muted">Échec délai</dt>
        <dd className="text-right">{pct(s.failTime, 0, false)}</dd>
        <dt className="text-muted">Durée médiane</dt>
        <dd className="text-right">{s.medianDaysToPass !== null ? `${num(s.medianDaysToPass, 0)} j` : "—"}</dd>
        <dt className="text-muted">Non terminés</dt>
        <dd className="text-right">{pct(s.unfinished, 0, false)}</dd>
      </dl>
    </Card>
  );
}

function advice(res: PropResult, risk: number, hasStop: boolean) {
  const mc = res.monteCarlo;
  const edgeGain = mc.passRate - res.noEdge.passRate;
  const unit = hasStop ? "de risque par trade" : "de taille de position";
  if (edgeGain < 10) return `À ${risk} % ${unit}, la stratégie ne fait pas beaucoup mieux que le hasard (${pct(res.noEdge.passRate, 0, false)}) : le challenge se jouerait surtout sur la chance.`;
  if (mc.failDaily > mc.failTotal && mc.failDaily > 20) return `La perte journalière fait échouer ${pct(mc.failDaily, 0, false)} des essais : baisse le risque par trade ou évite plusieurs trades le même jour.`;
  if (mc.passRate >= 60) return `À ${risk} % ${unit}, la stratégie passerait environ ${pct(mc.passRate, 0, false)} des challenges, contre ${pct(res.noEdge.passRate, 0, false)} pour le hasard, en ${num(mc.medianDaysToPass ?? 0, 0)} jours en médiane.`;
  return `Réussite modeste à ${risk} % ${unit}. Teste plusieurs niveaux de risque : trop bas, l'objectif n'est pas atteint ; trop haut, les limites de perte cassent.`;
}
