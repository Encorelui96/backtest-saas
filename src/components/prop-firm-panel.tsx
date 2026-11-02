"use client";

import { useEffect, useMemo, useState } from "react";
import type { Trade } from "@/lib/engine/backtest";
import { eventsBetween } from "@/lib/engine/calendar";
import { PROP_PRESETS, simulatePropFirm, type PropResult, type PropRules, type PropSummary, type Run } from "@/lib/engine/propfirm";
import { isCrypto, market } from "@/lib/markets";
import { PROP_FIRMS, PROP_FIRMS_CHECKED, type AssetKind, type PropFirmOffer } from "@/lib/prop-firms";
import type { Strategy } from "@/lib/strategy/schema";
import { num, pct } from "@/lib/client/format";
import { Help } from "./learn";
import { Alert, Button, Card, Field } from "./ui";

const ALL_RULES = [...PROP_FIRMS.map((f) => f.rules), ...PROP_PRESETS];
const FLAGSHIPS = PROP_FIRMS.filter((f) => f.flagship);
const ZONE_LABEL: Record<string, string> = {
  UTC: "UTC",
  "Europe/Prague": "de Prague",
  "Europe/Athens": "du serveur (UTC+2, UTC+3 en été)",
};

const money = (x: number, currency: string) => `${Math.round(x).toLocaleString("fr-FR")} ${currency}`;

export function PropFirmPanel({ trades, strategy }: { trades: Trade[]; strategy: Strategy }) {
  const hasStop = trades.length > 0 && trades.every((t) => t.r !== null);
  const baseRisk = hasStop ? strategy.riskPerTradePercent : strategy.positionSizePercent;
  const [rules, setRules] = useState<PropRules>(PROP_FIRMS[0].rules);
  const [risk, setRisk] = useState(hasStop ? 1 : baseRisk);
  const [computed, setComputed] = useState<{ key: string; result: PropResult } | null>(null);
  const [firms, setFirms] = useState<{ key: number; results: PropResult[] } | null>(null);
  const key = JSON.stringify({ rules, risk });
  const computing = computed?.key !== key;
  const result = computed?.result ?? null;

  useEffect(() => {
    if (trades.length < 5 || !(risk > 0)) return;
    // Debounced, and lets the "computing" message paint before the simulation blocks the main thread.
    const timer = setTimeout(() => setComputed({ key, result: simulatePropFirm(trades, rules, risk / baseRisk, { iterations: 2000 }) }), 200);
    return () => clearTimeout(timer);
  }, [trades, rules, risk, baseRisk, key]);

  useEffect(() => {
    if (trades.length < 5 || !(risk > 0)) return;
    const timer = setTimeout(
      () => setFirms({ key: risk, results: FLAGSHIPS.map((f) => simulatePropFirm(trades, f.rules, risk / baseRisk, { iterations: 1000, noEdge: false })) }),
      300,
    );
    return () => clearTimeout(timer);
  }, [trades, risk, baseRisk]);

  const asset: AssetKind = isCrypto(strategy.symbol) ? "crypto" : (market(strategy.symbol)?.kind ?? "forex");
  // Biggest position of the test, as a multiple of the account, at the chosen risk.
  const leverage = useMemo(() => Math.max(0, ...trades.map((t) => t.notional / t.equityBefore)) * (risk / baseRisk), [trades, risk, baseRisk]);
  // Trades opened or closed on the day of a Fed, ECB, CPI or NFP announcement.
  const newsTrades = useMemo(() => trades.filter((t) => eventsBetween(t.entryTime, t.entryTime).length || eventsBetween(t.exitTime, t.exitTime).length).length, [trades]);

  if (trades.length < 5) return <Alert>Il faut au moins 5 trades pour simuler un challenge.</Alert>;

  const custom = (patch: Partial<PropRules>) => setRules({ ...rules, ...patch, name: "Personnalisé" });
  const setPhase = (i: number, patch: Partial<PropRules["phases"][number]>) => custom({ phases: rules.phases.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const selected = ALL_RULES.findIndex((r) => r.name === rules.name);

  return (
    <div className="flex flex-col gap-4">
      <Card
        title={
          <span className="flex items-center">
            Avec les 3 grandes prop firms
            <Help id="prop-firm" />
          </span>
        }
        actions={
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">{hasStop ? "Risque par trade" : "Taille de position"}</span>
            <input className="w-20" type="number" step="0.1" min="0.1" value={risk} onChange={(e) => setRisk(Number(e.target.value))} />
            <span className="text-muted">%</span>
          </label>
        }
      >
        <p className="mb-3 text-sm text-muted">
          Le challenge en 2 phases phare de chaque firme, pour un compte de 100 000 $, rejoué avec les trades de ton test à {num(risk, 1)} %{" "}
          {hasStop ? "de risque par trade" : "de taille de position"} (le backtest a été fait à {baseRisk} %).
        </p>
        {firms?.key !== risk ? (
          <p className="text-sm text-muted">Simulation en cours…</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-3">
            {FLAGSHIPS.map((f, i) => (
              <FirmCard key={f.id} offer={f} res={firms.results[i]} asset={asset} leverage={leverage} newsTrades={newsTrades} total={trades.length} onDetail={() => setRules(f.rules)} />
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted">
          Règles et prix relevés sur les sites officiels le {PROP_FIRMS_CHECKED}, pour un compte de 100 000 $ : ils changent souvent, vérifie avant d&apos;acheter. Backtest Lab n&apos;est lié à
          aucune de ces sociétés. Réussir sur le passé ne garantit pas de réussir demain.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card title="Simulation détaillée">
          <div className="flex flex-col gap-3">
            <Field label="Règles">
              <select
                value={selected}
                onChange={(e) => {
                  const r = ALL_RULES[Number(e.target.value)];
                  if (r) setRules(r);
                }}
              >
                <optgroup label={`Prop firms (règles du ${PROP_FIRMS_CHECKED})`}>
                  {PROP_FIRMS.map((f, i) => (
                    <option key={f.id} value={i}>
                      {f.firm} {f.program}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Modèles types">
                  {PROP_PRESETS.map((p, i) => (
                    <option key={p.name} value={PROP_FIRMS.length + i}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
                <option value={-1} disabled>
                  Personnalisé
                </option>
              </select>
            </Field>
            {rules.phases.map((p, i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <Field label={`Objectif ${p.name} (%)`}>
                  <input type="number" step="0.5" value={p.targetPercent} onChange={(e) => setPhase(i, { targetPercent: Number(e.target.value) })} />
                </Field>
                <Field label="Jours max" hint="vide = illimité">
                  <input type="number" value={p.maxDays ?? ""} onChange={(e) => setPhase(i, { maxDays: e.target.value ? Number(e.target.value) : null })} />
                </Field>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Perte max / jour (%)">
                <input type="number" step="0.5" value={rules.maxDailyLossPercent} onChange={(e) => custom({ maxDailyLossPercent: Number(e.target.value) })} />
              </Field>
              <Field label="Perte max totale (%)">
                <input type="number" step="0.5" value={rules.maxTotalLossPercent} onChange={(e) => custom({ maxTotalLossPercent: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="Perte max totale comptée depuis">
              <select value={rules.maxLossType} onChange={(e) => custom({ maxLossType: e.target.value as PropRules["maxLossType"] })}>
                <option value="static">Le solde de départ</option>
                <option value="eod-trailing">Le plus haut solde de fin de journée</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Jours min / phase">
                <input type="number" value={rules.minDays} onChange={(e) => custom({ minDays: Number(e.target.value) })} />
              </Field>
              <Field label="Jours comptés">
                <select value={rules.minDaysKind} onChange={(e) => custom({ minDaysKind: e.target.value as PropRules["minDaysKind"] })}>
                  <option value="trading">Avec un trade</option>
                  <option value="profitable">Gagnants (+{num(rules.profitableDayPercent, 1)} %)</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Meilleur jour max (% du gain)" hint="vide = pas de règle">
                <input type="number" value={rules.bestDayPercent ?? ""} onChange={(e) => custom({ bestDayPercent: e.target.value ? Number(e.target.value) : null })} />
              </Field>
              <Field label="Jours sans trade max" hint="vide = pas de règle">
                <input type="number" value={rules.maxInactiveDays ?? ""} onChange={(e) => custom({ maxInactiveDays: e.target.value ? Number(e.target.value) : null })} />
              </Field>
            </div>
            <p className="text-[11px] text-muted">
              La perte du jour est comptée depuis le solde au début de la journée (heure {ZONE_LABEL[rules.dayZone] ?? rules.dayZone}), avec la pire baisse de chaque trade. Un challenge
              pas réussi au bout d&apos;un an compte comme un échec, même sans limite de temps.
            </p>
          </div>
        </Card>
        <div className="flex flex-col gap-4">
          {computing && <p className="text-sm text-muted">Simulation en cours…</p>}
          {result && (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <SummaryCard title="Sur l'historique réel" hint="Un challenge démarré à chaque trade du test" s={result.historical} />
                <SummaryCard title="Monte Carlo" hint="2 000 suites de trades tirées au hasard, sur un an au plus" s={result.monteCarlo} />
                {result.noEdge && <SummaryCard title="Sans avantage (hasard)" hint="Mêmes trades, gain moyen ramené à zéro" s={result.noEdge} muted />}
              </div>
              <Alert tone={result.monteCarlo.passRate >= 60 ? "info" : "warn"}>{advice(result, risk, hasStop)}</Alert>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function verdict(run: Run, rules: PropRules) {
  const phase = rules.phases[Math.min(run.phaseReached, rules.phases.length - 1)]?.name ?? "";
  switch (run.outcome) {
    case "pass":
      return { tone: "text-up", text: `Réussi en ${run.days} jour${run.days > 1 ? "s" : ""}` };
    case "fail_daily":
      return { tone: "text-down", text: `Échoué après ${run.days} jours : perte du jour dépassée (${phase})` };
    case "fail_total":
      return { tone: "text-down", text: `Échoué après ${run.days} jours : perte max dépassée (${phase})` };
    case "fail_time":
      return { tone: "text-down", text: `Échoué : délai dépassé (${phase})` };
    case "fail_inactive":
      return { tone: "text-down", text: `Échoué après ${run.days} jours : compte expiré, trop longtemps sans trade (${phase})` };
    case "too_slow":
      return { tone: "text-warn", text: `Pas réussi au bout d'un an (${phase} en cours)` };
    default:
      return { tone: "text-warn", text: `Pas terminé à la fin du test (${phase} en cours)` };
  }
}

function rulesSummary(r: PropRules) {
  const targets = r.phases.map((p) => `${num(p.targetPercent, 0)} %`).join(" puis ");
  const days = r.phases.every((p) => p.maxDays === null) ? "illimité" : r.phases.map((p) => (p.maxDays === null ? "illimité" : `${p.maxDays} j`)).join(" puis ");
  return [
    `Objectif${r.phases.length > 1 ? "s" : ""} : ${targets}`,
    `Perte max : ${num(r.maxDailyLossPercent, 0)} % par jour, ${num(r.maxTotalLossPercent, 0)} % au total${r.maxLossType === "eod-trailing" ? " (suit le plus haut de fin de journée)" : ""}`,
    r.minDays > 0 &&
      `Minimum : ${r.minDays} jour${r.minDays > 1 ? "s" : ""} ${r.minDaysKind === "profitable" ? `gagnant${r.minDays > 1 ? "s" : ""}` : "de trading"} par ${r.phases.length > 1 ? "phase" : "challenge"}`,
    r.bestDayPercent !== null && `Meilleur jour : ${r.bestDayPercent} % du gain au plus`,
    r.maxInactiveDays !== null && `Compte expiré après ${r.maxInactiveDays} jours sans trade`,
    `Délai : ${days}`,
  ].filter((x): x is string => !!x);
}

function FirmCard({
  offer,
  res,
  asset,
  leverage,
  newsTrades,
  total,
  onDetail,
}: {
  offer: PropFirmOffer;
  res: PropResult;
  asset: AssetKind;
  leverage: number;
  newsTrades: number;
  total: number;
  onDetail: () => void;
}) {
  const mc = res.monteCarlo;
  const v = verdict(res.fromStart, offer.rules);
  const rate = mc.passRate >= 60 ? "text-up" : mc.passRate >= 35 ? "text-warn" : "text-down";
  const attempts = mc.passRate > 0 ? 100 / mc.passRate : null;
  const refunded = !offer.refund.startsWith("Non");
  const maxLeverage = offer.leverage[asset];
  // FTMO's list of restricted announcements leaves crypto out.
  const newsApplies = offer.newsRestriction !== null && !(offer.firm === "FTMO" && asset === "crypto");
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-panel-2/40 p-3 text-sm">
      <div>
        <div className="text-base font-semibold">{offer.firm}</div>
        <div className="text-xs text-muted">{offer.program} · compte de 100 000 $</div>
      </div>
      <div>
        <div className="text-xs text-muted">Challenge commencé au début de ton test</div>
        <div className={`font-semibold ${v.tone}`}>{v.text}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className={`num text-2xl font-semibold ${rate}`}>{pct(mc.passRate, 0, false)}</div>
          <div className="text-[11px] text-muted">de réussite en moins d&apos;un an (Monte Carlo)</div>
        </div>
        <div>
          <div className="num text-2xl font-semibold">{res.historical.unfinished >= 100 ? "—" : pct(res.historical.passRate, 0, false)}</div>
          <div className="text-[11px] text-muted">
            {res.historical.unfinished >= 100 ? "aucun essai ne se termine avant la fin du test" : "sur ton historique, en commençant à n'importe quel trade"}
          </div>
        </div>
      </div>
      <p className="text-xs">
        {attempts === null ? (
          <span className="text-down">Aucun essai réussi dans la simulation à ce risque.</span>
        ) : attempts > 20 ? (
          <span className="text-down">Réussite trop rare : il faudrait plus de 20 essais en moyenne pour être financé.</span>
        ) : (
          <>
            Environ <strong>{num(attempts, attempts < 10 ? 1 : 0)} essai{attempts >= 2 ? "s" : ""}</strong> pour être financé, soit{" "}
            <strong>{money(attempts * offer.priceValue, offer.currency)}</strong> de frais
            {refunded ? " avancés (le dernier est remboursé)" : ""}.
            {mc.medianDaysToPass !== null && ` Durée médiane d'un essai réussi : ${num(mc.medianDaysToPass, 0)} jours.`}
          </>
        )}
      </p>
      <ul className="flex flex-col gap-0.5 text-xs">
        {rulesSummary(offer.rules).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
        <dt className="text-muted">Prix</dt>
        <dd>{offer.price}</dd>
        <dt className="text-muted">Frais</dt>
        <dd>{offer.refund}</dd>
        <dt className="text-muted">Partage</dt>
        <dd>{offer.split}</dd>
        {offer.payouts && (
          <>
            <dt className="text-muted">Paiements</dt>
            <dd>{offer.payouts}</dd>
          </>
        )}
        <dt className="text-muted">Annonces</dt>
        <dd>
          {offer.news}
          {newsApplies && newsTrades > 0 && (
            <span className="mt-0.5 block text-warn">
              Dans ton test, {newsTrades} trade{newsTrades > 1 ? "s" : ""} sur {total} {newsTrades > 1 ? "ont" : "a"} été ouvert{newsTrades > 1 ? "s" : ""} ou fermé{newsTrades > 1 ? "s" : ""} un
              jour d&apos;annonce (Fed, BCE, CPI, NFP) : vérifie qu&apos;aucun ordre ne tombe dans les 2 minutes autour.
            </span>
          )}
        </dd>
        <dt className="text-muted">Week-end</dt>
        <dd>{offer.weekend}</dd>
        <dt className="text-muted">Levier</dt>
        <dd>
          {maxLeverage !== undefined ? (
            leverage <= maxLeverage ? (
              <span>
                Ta plus grosse position fait {num(leverage, 1)} fois le compte, sous le maximum de 1:{maxLeverage} sur cet actif.
              </span>
            ) : (
              <span className="text-down">
                Ta plus grosse position fait {num(leverage, 1)} fois le compte, au-dessus du maximum de 1:{maxLeverage} sur cet actif : il faudrait réduire tes positions.
              </span>
            )
          ) : (
            <span>Ta plus grosse position fait {num(leverage, 1)} fois le compte.</span>
          )}{" "}
          <span className="text-muted">{offer.leverageNote}</span>
        </dd>
      </dl>
      {offer.extras.length > 0 && (
        <ul className="list-disc pl-4 text-xs text-muted">
          {offer.extras.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={onDetail}>
          Voir le détail
        </Button>
        <a href={offer.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">
          Règles officielles ↗
        </a>
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
        <dt className="text-muted">Échec délai ou inactivité</dt>
        <dd className="text-right">{pct(s.failTime, 0, false)}</dd>
        <dt className="text-muted">Pas réussi en un an</dt>
        <dd className="text-right">{pct(s.tooSlow, 0, false)}</dd>
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
  const luck = res.noEdge?.passRate ?? 0;
  const edgeGain = mc.passRate - luck;
  const unit = hasStop ? "de risque par trade" : "de taille de position";
  if (edgeGain < 10) return `À ${risk} % ${unit}, la stratégie ne fait pas beaucoup mieux que le hasard (${pct(luck, 0, false)}) : le challenge se jouerait surtout sur la chance.`;
  if (mc.failDaily > mc.failTotal && mc.failDaily > 20) return `La perte journalière fait échouer ${pct(mc.failDaily, 0, false)} des essais : baisse le risque par trade ou évite plusieurs trades le même jour.`;
  if (mc.passRate >= 60) return `À ${risk} % ${unit}, la stratégie passerait environ ${pct(mc.passRate, 0, false)} des challenges, contre ${pct(luck, 0, false)} pour le hasard, en ${num(mc.medianDaysToPass ?? 0, 0)} jours en médiane.`;
  return `Réussite modeste à ${risk} % ${unit}. Teste plusieurs niveaux de risque : trop bas, l'objectif n'est pas atteint ; trop haut, les limites de perte cassent.`;
}
