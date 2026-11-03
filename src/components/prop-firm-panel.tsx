"use client";

import { tr } from "@/lib/i18n";
import { useT } from "@/lib/client/i18n";
import { useEffect, useMemo, useState } from "react";
import type { Trade } from "@/lib/engine/backtest";
import { eventsBetween } from "@/lib/engine/calendar";
import { PROP_PRESETS, simulatePropFirm, type PropResult, type PropRules, type PropSummary, type Run } from "@/lib/engine/propfirm";
import { isCrypto, market } from "@/lib/markets";
import { PROP_FIRMS, PROP_FIRMS_CHECKED, type AssetKind, type PropFirmOffer } from "@/lib/prop-firms";
import { PlanLock } from "./plan-lock";
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

const money = (x: number, currency: string) => `${num(Math.round(x), 0)} ${currency}`;

export function PropFirmPanel({ trades, strategy, locked = false }: { trades: Trade[]; strategy: Strategy; locked?: boolean }) {
  // Free plan: one firm at a time.
  const [firm, setFirm] = useState(0);
  const tl = useT();
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

  if (trades.length < 5) return <Alert>{tl("Il faut au moins 5 trades pour simuler un challenge.")}</Alert>;

  const custom = (patch: Partial<PropRules>) => setRules({ ...rules, ...patch, name: tl("Personnalisé") });
  const setPhase = (i: number, patch: Partial<PropRules["phases"][number]>) => custom({ phases: rules.phases.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const selected = ALL_RULES.findIndex((r) => r.name === rules.name);

  return (
    <div className="flex flex-col gap-4">
      <Card
        title={
          <span className="flex items-center">
            {tl("Avec les 3 grandes prop firms")}<Help id="prop-firm" />
          </span>
        }
        actions={
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">{hasStop ? tl("Risque par trade") : tl("Taille de position")}</span>
            <input className="w-20" type="number" step="0.1" min="0.1" value={risk} onChange={(e) => setRisk(Number(e.target.value))} />
            <span className="text-muted">%</span>
          </label>
        }
      >
        <p className="mb-3 text-sm text-muted">
          {tl("Le challenge en 2 phases phare de chaque firme, pour un compte de 100 000 $, rejoué avec les trades de ton test à ")}{num(risk, 1)} %{" "}
          {hasStop ? tl("de risque par trade") : tl("de taille de position")} {tl(" (le backtest a été fait à ")}{baseRisk} %).
        </p>
        {firms?.key !== risk ? (
          <p className="text-sm text-muted">{tl("Simulation en cours…")}</p>
        ) : locked ? (
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted">{tl("Prop firm")}</span>
              <select value={firm} onChange={(e) => setFirm(Number(e.target.value))}>
                {FLAGSHIPS.map((f, i) => (
                  <option key={f.id} value={i}>
                    {f.firm}
                  </option>
                ))}
              </select>
            </label>
            <FirmCard offer={FLAGSHIPS[firm]} res={firms.results[firm]} asset={asset} leverage={leverage} newsTrades={newsTrades} total={trades.length} onDetail={() => setRules(FLAGSHIPS[firm].rules)} />
            <PlanLock>{tl("Le comparatif côte à côte des prop firms est réservé aux offres Trader et Pro.")}</PlanLock>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-3">
            {FLAGSHIPS.map((f, i) => (
              <FirmCard key={f.id} offer={f} res={firms.results[i]} asset={asset} leverage={leverage} newsTrades={newsTrades} total={trades.length} onDetail={() => setRules(f.rules)} />
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted">
          {tl("Règles et prix relevés sur les sites officiels le ")}{tl(PROP_FIRMS_CHECKED)}{tl(", pour un compte de 100 000 $ : ils changent souvent, vérifie avant d'acheter. Backtest Lab n'est lié à aucune de ces sociétés. Réussir sur le passé ne garantit pas de réussir demain.")}</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card title={tl("Simulation détaillée")}>
          <div className="flex flex-col gap-3">
            <Field label={tl("Règles")}>
              <select
                value={selected}
                onChange={(e) => {
                  const r = ALL_RULES[Number(e.target.value)];
                  if (r) setRules(r);
                }}
              >
                <optgroup label={tl("Prop firms (règles du {0})", [PROP_FIRMS_CHECKED])}>
                  {PROP_FIRMS.map((f, i) => (
                    <option key={f.id} value={i}>
                      {f.firm} {f.program}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={tl("Modèles types")}>
                  {PROP_PRESETS.map((p, i) => (
                    <option key={p.name} value={PROP_FIRMS.length + i}>
                      {tl(p.name)}
                    </option>
                  ))}
                </optgroup>
                <option value={-1} disabled>
                  {tl("Personnalisé")}</option>
              </select>
            </Field>
            {rules.phases.map((p, i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <Field label={tl("Objectif {0} (%)", [tl(p.name)])}>
                  <input type="number" step="0.5" value={p.targetPercent} onChange={(e) => setPhase(i, { targetPercent: Number(e.target.value) })} />
                </Field>
                <Field label={tl("Jours max")} hint={tl("vide = illimité")}>
                  <input type="number" value={p.maxDays ?? ""} onChange={(e) => setPhase(i, { maxDays: e.target.value ? Number(e.target.value) : null })} />
                </Field>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <Field label={tl("Perte max / jour (%)")}>
                <input type="number" step="0.5" value={rules.maxDailyLossPercent} onChange={(e) => custom({ maxDailyLossPercent: Number(e.target.value) })} />
              </Field>
              <Field label={tl("Perte max totale (%)")}>
                <input type="number" step="0.5" value={rules.maxTotalLossPercent} onChange={(e) => custom({ maxTotalLossPercent: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label={tl("Perte max totale comptée depuis")}>
              <select value={rules.maxLossType} onChange={(e) => custom({ maxLossType: e.target.value as PropRules["maxLossType"] })}>
                <option value="static">{tl("Le solde de départ")}</option>
                <option value="eod-trailing">{tl("Le plus haut solde de fin de journée")}</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={tl("Jours min / phase")}>
                <input type="number" value={rules.minDays} onChange={(e) => custom({ minDays: Number(e.target.value) })} />
              </Field>
              <Field label={tl("Jours comptés")}>
                <select value={rules.minDaysKind} onChange={(e) => custom({ minDaysKind: e.target.value as PropRules["minDaysKind"] })}>
                  <option value="trading">{tl("Avec un trade")}</option>
                  <option value="profitable">{tl("Gagnants (+{0} %)", [num(rules.profitableDayPercent, 1)])}</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label={tl("Meilleur jour max (% du gain)")} hint={tl("vide = pas de règle")}>
                <input type="number" value={rules.bestDayPercent ?? ""} onChange={(e) => custom({ bestDayPercent: e.target.value ? Number(e.target.value) : null })} />
              </Field>
              <Field label={tl("Jours sans trade max")} hint={tl("vide = pas de règle")}>
                <input type="number" value={rules.maxInactiveDays ?? ""} onChange={(e) => custom({ maxInactiveDays: e.target.value ? Number(e.target.value) : null })} />
              </Field>
            </div>
            <p className="text-[11px] text-muted">
              {tl("La perte du jour est comptée depuis le solde au début de la journée (heure ")}{tl(ZONE_LABEL[rules.dayZone] ?? rules.dayZone)}{tl("), avec la pire baisse de chaque trade. Un challenge pas réussi au bout d'un an compte comme un échec, même sans limite de temps.")}</p>
          </div>
        </Card>
        <div className="flex flex-col gap-4">
          {computing && <p className="text-sm text-muted">{tl("Simulation en cours…")}</p>}
          {result && (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <SummaryCard title={tl("Sur l'historique réel")} hint={tl("Un challenge démarré à chaque trade du test")} s={result.historical} />
                <SummaryCard title={tl("Monte Carlo")} hint={tl("2 000 suites de trades tirées au hasard, sur un an au plus")} s={result.monteCarlo} />
                {result.noEdge && <SummaryCard title={tl("Sans avantage (hasard)")} hint={tl("Mêmes trades, gain moyen ramené à zéro")} s={result.noEdge} muted />}
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
  const phase = tr(rules.phases[Math.min(run.phaseReached, rules.phases.length - 1)]?.name ?? "");
  switch (run.outcome) {
    case "pass":
      return { tone: "text-up", text: tr("Réussi en {0} jour{1}", [run.days, run.days > 1 ? "s" : ""]) };
    case "fail_daily":
      return { tone: "text-down", text: tr("Échoué après {0} jours : perte du jour dépassée ({1})", [run.days, phase]) };
    case "fail_total":
      return { tone: "text-down", text: tr("Échoué après {0} jours : perte max dépassée ({1})", [run.days, phase]) };
    case "fail_time":
      return { tone: "text-down", text: tr("Échoué : délai dépassé ({0})", [phase]) };
    case "fail_inactive":
      return { tone: "text-down", text: tr("Échoué après {0} jours : compte expiré, trop longtemps sans trade ({1})", [run.days, phase]) };
    case "too_slow":
      return { tone: "text-warn", text: tr("Pas réussi au bout d'un an ({0} en cours)", [phase]) };
    default:
      return { tone: "text-warn", text: tr("Pas terminé à la fin du test ({0} en cours)", [phase]) };
  }
}

function rulesSummary(r: PropRules) {
  const targets = r.phases.map((p) => `${num(p.targetPercent, 0)} %`).join(tr(" puis "));
  const days = r.phases.every((p) => p.maxDays === null) ? tr("illimité") : r.phases.map((p) => (p.maxDays === null ? tr("illimité") : tr("{0} j", [p.maxDays]))).join(tr(" puis "));
  return [
    tr("Objectif{0} : {1}", [r.phases.length > 1 ? "s" : "", targets]),
    tr("Perte max : {0} % par jour, {1} % au total{2}", [num(r.maxDailyLossPercent, 0), num(r.maxTotalLossPercent, 0), r.maxLossType === "eod-trailing" ? tr(" (suit le plus haut de fin de journée)") : ""]),
    r.minDays > 0 &&
      tr(r.minDaysKind === "profitable" ? "Minimum : {0} jour{1} gagnant{1} par {2}" : "Minimum : {0} jour{1} de trading par {2}", [r.minDays, r.minDays > 1 ? "s" : "", r.phases.length > 1 ? "phase" : "challenge"]),
    r.bestDayPercent !== null && tr("Meilleur jour : {0} % du gain au plus", [r.bestDayPercent]),
    r.maxInactiveDays !== null && tr("Compte expiré après {0} jours sans trade", [r.maxInactiveDays]),
    tr("Délai : {0}", [days]),
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
  const tl = useT();
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
        <div className="text-xs text-muted">{offer.program} {tl(" · compte de 100 000 $")}</div>
      </div>
      <div>
        <div className="text-xs text-muted">{tl("Challenge commencé au début de ton test")}</div>
        <div className={`font-semibold ${v.tone}`}>{v.text}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className={`num text-2xl font-semibold ${rate}`}>{pct(mc.passRate, 0, false)}</div>
          <div className="text-[11px] text-muted">{tl("de réussite en moins d'un an (Monte Carlo)")}</div>
        </div>
        <div>
          <div className="num text-2xl font-semibold">{res.historical.unfinished >= 100 ? "—" : pct(res.historical.passRate, 0, false)}</div>
          <div className="text-[11px] text-muted">
            {res.historical.unfinished >= 100 ? tl("aucun essai ne se termine avant la fin du test") : tl("sur ton historique, en commençant à n'importe quel trade")}
          </div>
        </div>
      </div>
      <p className="text-xs">
        {attempts === null ? (
          <span className="text-down">{tl("Aucun essai réussi dans la simulation à ce risque.")}</span>
        ) : attempts > 20 ? (
          <span className="text-down">{tl("Réussite trop rare : il faudrait plus de 20 essais en moyenne pour être financé.")}</span>
        ) : (
          <>
            {tl("Environ ")}<strong>{tl("{0} essai{1}", [num(attempts, attempts < 10 ? 1 : 0), Math.round(attempts * 10) >= 20 ? "s" : ""])}</strong> {tl(" pour être financé, soit")}{" "}
            <strong>{money(attempts * offer.priceValue, offer.currency)}</strong> {tl(" de frais")}{refunded ? tl(" avancés (le dernier est remboursé)") : ""}.
            {mc.medianDaysToPass !== null && tl(" Durée médiane d'un essai réussi : {0} jours.", [num(mc.medianDaysToPass, 0)])}
          </>
        )}
      </p>
      <ul className="flex flex-col gap-0.5 text-xs">
        {rulesSummary(offer.rules).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
        <dt className="text-muted">{tl("Prix")}</dt>
        <dd>{tl(offer.price)}</dd>
        <dt className="text-muted">{tl("Frais")}</dt>
        <dd>{tl(offer.refund)}</dd>
        <dt className="text-muted">{tl("Partage")}</dt>
        <dd>{tl(offer.split)}</dd>
        {offer.payouts && (
          <>
            <dt className="text-muted">{tl("Paiements")}</dt>
            <dd>{tl(offer.payouts)}</dd>
          </>
        )}
        <dt className="text-muted">{tl("Annonces")}</dt>
        <dd>
          {tl(offer.news)}
          {newsApplies && newsTrades > 0 && (
            <span className="mt-0.5 block text-warn">
              {newsTrades > 1
                ? tl("Dans ton test, {0} trades sur {1} ont été ouverts ou fermés un jour d'annonce (Fed, BCE, CPI, NFP) : vérifie qu'aucun ordre ne tombe dans les 2 minutes autour.", [newsTrades, total])
                : tl("Dans ton test, 1 trade sur {0} a été ouvert ou fermé un jour d'annonce (Fed, BCE, CPI, NFP) : vérifie qu'aucun ordre ne tombe dans les 2 minutes autour.", [total])}</span>
          )}
        </dd>
        <dt className="text-muted">{tl("Week-end")}</dt>
        <dd>{tl(offer.weekend)}</dd>
        <dt className="text-muted">{tl("Levier")}</dt>
        <dd>
          {maxLeverage !== undefined ? (
            leverage <= maxLeverage ? (
              <span>
                {tl("Ta plus grosse position fait {0} fois le compte, sous le maximum de 1:{1} sur cet actif.", [num(leverage, 1), maxLeverage])}</span>
            ) : (
              <span className="text-down">
                {tl("Ta plus grosse position fait {0} fois le compte, au-dessus du maximum de 1:{1} sur cet actif : il faudrait réduire tes positions.", [num(leverage, 1), maxLeverage])}</span>
            )
          ) : (
            <span>{tl("Ta plus grosse position fait ")}{num(leverage, 1)} {tl(" fois le compte.")}</span>
          )}{" "}
          <span className="text-muted">{tl(offer.leverageNote)}</span>
        </dd>
      </dl>
      {offer.extras.length > 0 && (
        <ul className="list-disc pl-4 text-xs text-muted">
          {offer.extras.map((x) => (
            <li key={x}>{tl(x)}</li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={onDetail}>
          {tl("Voir le détail")}</Button>
        <a href={offer.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">
          {tl("Règles officielles ↗")}</a>
      </div>
    </div>
  );
}

function SummaryCard({ title, hint, s, muted }: { title: string; hint: string; s: PropSummary; muted?: boolean }) {
  const tl = useT();
  return (
    <Card title={title}>
      <div className={`num text-3xl font-semibold ${muted ? "text-muted" : s.passRate >= 60 ? "text-up" : s.passRate >= 35 ? "text-warn" : "text-down"}`}>{pct(s.passRate, 0, false)}</div>
      <div className="text-xs text-muted">{tl("de réussite · ")}{hint}</div>
      <dl className="num mt-3 grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-muted">{tl("Échec perte du jour")}</dt>
        <dd className="text-right">{pct(s.failDaily, 0, false)}</dd>
        <dt className="text-muted">{tl("Échec perte totale")}</dt>
        <dd className="text-right">{pct(s.failTotal, 0, false)}</dd>
        <dt className="text-muted">{tl("Échec délai ou inactivité")}</dt>
        <dd className="text-right">{pct(s.failTime, 0, false)}</dd>
        <dt className="text-muted">{tl("Pas réussi en un an")}</dt>
        <dd className="text-right">{pct(s.tooSlow, 0, false)}</dd>
        <dt className="text-muted">{tl("Durée médiane")}</dt>
        <dd className="text-right">{s.medianDaysToPass !== null ? `${num(s.medianDaysToPass, 0)} j` : "—"}</dd>
        <dt className="text-muted">{tl("Non terminés")}</dt>
        <dd className="text-right">{pct(s.unfinished, 0, false)}</dd>
      </dl>
    </Card>
  );
}

function advice(res: PropResult, risk: number, hasStop: boolean) {
  const mc = res.monteCarlo;
  const luck = res.noEdge?.passRate ?? 0;
  const edgeGain = mc.passRate - luck;
  const unit = hasStop ? tr("de risque par trade") : tr("de taille de position");
  if (edgeGain < 10) return tr("À {0} % {1}, la stratégie ne fait pas beaucoup mieux que le hasard ({2}) : le challenge se jouerait surtout sur la chance.", [risk, unit, pct(luck, 0, false)]);
  if (mc.failDaily > mc.failTotal && mc.failDaily > 20) return tr("La perte journalière fait échouer {0} des essais : baisse le risque par trade ou évite plusieurs trades le même jour.", [pct(mc.failDaily, 0, false)]);
  if (mc.passRate >= 60) return tr("À {0} % {1}, la stratégie passerait environ {2} des challenges, contre {3} pour le hasard, en {4} jours en médiane.", [risk, unit, pct(mc.passRate, 0, false), pct(luck, 0, false), num(mc.medianDaysToPass ?? 0, 0)]);
  return tr("Réussite modeste à {0} % {1}. Teste plusieurs niveaux de risque : trop bas, l'objectif n'est pas atteint ; trop haut, les limites de perte cassent.", [risk, unit]);
}
