"use client";

import { tr } from "@/lib/i18n";
import { Link, rich, useRouter, useT } from "@/lib/client/i18n";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/client/api";
import { preferredMarket } from "@/lib/client/preferences";
import { defaultConfig, defaultStrategy, type BacktestConfig, type Strategy } from "@/lib/strategy/schema";
import type { Template } from "@/lib/strategy/templates";
import { INTERVALS, MAX_HISTORY_DAYS } from "@/lib/types";
import { isCrypto } from "@/lib/markets";
import { date } from "@/lib/client/format";
import { COMPARATOR_LABELS, operandLabel } from "@/lib/strategy/describe";
import { Help, useBeginner } from "./learn";
import { MarketPicker } from "./market-picker";
import { GroupsEditor } from "./rule-builder";
import { Alert, Button, Card, Field } from "./ui";

interface Meta {
  aiEnabled: boolean;
  templates: Template[];
}

interface AiResult {
  strategy: Strategy;
  explanation: string;
  assumptions: string[];
  questions: string[];
  problems: string[];
}

const FEE_PRESETS: { label: string; short: string; config: Pick<BacktestConfig, "feePercent" | "spreadPercent" | "slippagePercent" | "fundingPercentPer8h"> }[] = [
  { label: "Binance Spot (0,1 %)", short: "Binance Spot", config: { feePercent: 0.1, spreadPercent: 0.01, slippagePercent: 0.01, fundingPercentPer8h: 0 } },
  { label: "Binance Futures, ordres au marché (0,05 %)", short: "Binance Futures", config: { feePercent: 0.05, spreadPercent: 0.01, slippagePercent: 0.01, fundingPercentPer8h: 0.01 } },
  { label: "Binance Futures, ordres limites (0,02 %)", short: "Futures limites", config: { feePercent: 0.02, spreadPercent: 0.01, slippagePercent: 0, fundingPercentPer8h: 0.01 } },
  { label: "Forex, or, Nasdaq (CFD, spread serré)", short: "Courtier CFD", config: { feePercent: 0.0035, spreadPercent: 0.01, slippagePercent: 0.005, fundingPercentPer8h: 0.002 } },
  { label: "Sans frais (irréaliste)", short: "Sans frais", config: { feePercent: 0, spreadPercent: 0, slippagePercent: 0, fundingPercentPer8h: 0 } },
];
const SPOT = 0;
const CFD = 3;

const INTERVAL_LABELS: Record<Strategy["interval"], string> = { "1m": "1 min", "5m": "5 min", "15m": "15 min", "1h": "1 heure", "4h": "4 heures", "1d": "1 jour" };
/** Beginners see the intervals where fees and noise weigh least. */
const RECOMMENDED = new Set<Strategy["interval"]>(["4h", "1d"]);

const PERIODS = [
  { label: "1 an", days: 365 },
  { label: "3 ans", days: 1095 },
  { label: "5 ans", days: 1825 },
  { label: "Max", days: 100_000 },
];

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** The trading style that goes with an interval, set for beginners who don't see the field. */
function styleFor(interval: Strategy["interval"]): Strategy["style"] {
  return interval === "1m" || interval === "5m" ? "scalp" : interval === "15m" || interval === "1h" ? "day" : "swing";
}

export function StrategyEditor({ id }: { id?: string }) {
  const tl = useT();
  const router = useRouter();
  const beginner = useBeginner();
  const [meta, setMeta] = useState<Meta | null>(null);
  // A new strategy starts on the market chosen in the welcome questions. The editor only
  // renders in the browser (after the session check), so the choice can be read right away.
  const [market] = useState(() => (id ? null : preferredMarket()) ?? defaultStrategy().symbol);
  const [strategy, setStrategy] = useState<Strategy>(() => ({ ...defaultStrategy(), symbol: market }));
  // Plain spot buying is what most people mean by "buying crypto": start with its costs; a CFD broker's otherwise.
  const [fees, setFees] = useState<number | null>(isCrypto(market) ? SPOT : CFD);
  const [config, setConfig] = useState<BacktestConfig>(() => ({ ...withDefaultPeriod(defaultConfig(), defaultStrategy()), ...FEE_PRESETS[isCrypto(market) ? SPOT : CFD].config }));
  const [text, setText] = useState("");
  const [savedId, setSavedId] = useState<string | undefined>(id);
  const [ai, setAi] = useState<AiResult | null>(null);
  const [busy, setBusy] = useState<"ai" | "save" | "run" | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the error is a spent quota that a recharge would lift.
  const [recharge, setRecharge] = useState<string | null>(null);
  const fail = (e: unknown) => {
    setError((e as Error).message);
    setRecharge(e instanceof ApiError ? e.recharge : null);
  };
  const [notice, setNotice] = useState<string | null>(null);
  // Beginners see a summary of the rules and no idea box until they ask for them.
  const [editRules, setEditRules] = useState(false);
  const [showIdea, setShowIdea] = useState(false);

  useEffect(() => {
    api<Meta>("/api/meta").then(setMeta).catch((e) => setError(e.message));
    if (id) {
      api<{ strategy: Strategy; sourceText: string | null }>(`/api/strategies/${id}`)
        .then((s) => {
          setStrategy(s.strategy);
          setText(s.sourceText ?? "");
          // A saved strategy reopens with the usual test length for its interval, not a single year.
          setConfig((c) => withDefaultPeriod(c, s.strategy));
        })
        .catch((e) => setError(e.message));
    }
  }, [id]);

  const set =<K extends keyof Strategy>(k: K, v: Strategy[K]) => setStrategy((s) => ({ ...s, [k]: v }));

  const applyFees = (i: number) => {
    setFees(i);
    setConfig((c) => ({ ...c, ...FEE_PRESETS[i].config }));
  };

  /** A cost typed by hand: the profile no longer applies. */
  const setCost = (k: "feePercent" | "spreadPercent" | "slippagePercent" | "fundingPercentPer8h", v: string) => {
    setFees(null);
    setConfig((c) => ({ ...c, [k]: Number(v) }));
  };

  /** A new market family brings its own realistic costs: exchange fees for crypto, spreads at a CFD broker otherwise. */
  const chooseMarket = (symbol: string) => {
    if (isCrypto(symbol) !== isCrypto(strategy.symbol) || fees === null) applyFees(isCrypto(symbol) ? SPOT : CFD);
    set("symbol", symbol);
  };

  const chooseInterval = (interval: Strategy["interval"]) => {
    const s = { ...strategy, interval, style: beginner ? styleFor(interval) : strategy.style };
    setStrategy(s);
    setConfig((c) => clampPeriod(c, s));
  };

  const choosePeriod = (days: number) => {
    const end = Date.parse(config.endDate);
    const span = Math.min(days, MAX_HISTORY_DAYS[strategy.interval]);
    setConfig({ ...config, startDate: new Date(end - span * 86_400_000).toISOString().slice(0, 10) });
  };

  const translate = async () => {
    setBusy("ai");
    setError(null);
    try {
      const hasRules = [...strategy.entryLong, ...strategy.entryShort].some((g) => g.conditions.length);
      const res = await api<AiResult>("/api/ai/parse", { json: { text, current: ai && hasRules ? strategy : null } });
      setAi(res);
      setStrategy(res.strategy);
      setConfig((c) => withDefaultPeriod(c, res.strategy));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const saved = await api<{ id: string }>("/api/strategies", { json: { id: savedId ?? null, strategy, sourceText: text || null } });
    setSavedId(saved.id);
    if (!id) window.history.replaceState(null, "", `/strategies/${saved.id}`);
    return saved.id;
  };

  const onSave = async () => {
    setBusy("save");
    setError(null);
    try {
      await save();
      setNotice(tl("Stratégie enregistrée."));
      setTimeout(() => setNotice(null), 2500);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const run = async () => {
    setBusy("run");
    setError(null);
    try {
      const strategyId = await save();
      const { jobId } = await api<{ jobId: string }>("/api/backtests", { json: { strategy, config, strategyId } });
      // The worker computes the backtest; follow its progress until the report exists.
      for (;;) {
        const state = await api<JobState>(`/api/jobs/${jobId}`);
        setJob(state);
        if (state.status === "done" && state.resultId) {
          router.push(`/backtests/${state.resultId}`);
          return;
        }
        if (state.status === "failed") throw new Error(state.error ?? tl("Le calcul a échoué."));
        await new Promise((r) => setTimeout(r, 700));
      }
    } catch (e) {
      fail(e);
      setBusy(null);
      setJob(null);
    }
  };

  const runLabel = job ? jobLabel(job) : tl("Backtest en cours…");

  const applyTemplate = (t: Template) => {
    // With a market chosen in the welcome questions, a template brings its rules but keeps that market.
    const s = preferredMarket() ? { ...t.strategy, symbol: strategy.symbol } : t.strategy;
    setText(t.prompt);
    setStrategy(s);
    setConfig((c) => withDefaultPeriod(c, s));
    setAi(null);
  };

  const years = (Date.parse(config.endDate) - Date.parse(config.startDate)) / (365.25 * 86_400_000);

  return (
    <div className="grid gap-4 pb-24 md:pb-0 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
        {beginner && (
          <p className="text-sm text-muted">
            {rich(tl("Choisis un modèle, un marché, puis lance le test. Un {0} explique chaque case."), [<span key="q" className="font-bold text-accent">?</span>])}
          </p>
        )}

        <Card title={beginner ? tl("1. Choisis un modèle") : tl("1. Stratégie")}>
          <div className="flex flex-col gap-3">
            {meta && (
              <Templates
                templates={meta.templates}
                current={strategy.name}
                onPick={applyTemplate}
                beginner={beginner}
              />
            )}
            {beginner && !showIdea ? (
              <button onClick={() => setShowIdea(true)} className="self-start text-sm text-accent hover:underline">
                {tl("Ou décris ta propre idée en français →")}</button>
            ) : (
            <div className="flex flex-col gap-2">
              <textarea
                rows={beginner ? 3 : 4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={tl("Ex. : En 4 heures sur ETHUSDT, j'achète quand la MME 20 croise au-dessus de la MME 50. Stop à 2 ATR, objectif 3R.")}
                className="w-full"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={translate} disabled={!meta?.aiEnabled || busy !== null || text.trim().length < 5}>
                  {busy === "ai" ? tl("Traduction en cours…") : ai ? tl("Modifier avec l'IA") : tl("Traduire en règles avec l'IA")}
                </Button>
                {meta && !meta.aiEnabled && <span className="text-xs text-muted">{tl("IA indisponible : le constructeur ci-dessous marche sans.")}</span>}
              </div>
            </div>
            )}
            {ai && <AiSummary ai={ai} />}
          </div>
        </Card>

        <Card title={beginner ? tl("2. Choisis le marché") : tl("2. Marché")}>
          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-1.5 flex items-center text-xs text-muted">
                {tl("Marché")}<Help id="symbole" />
              </div>
              <MarketPicker value={strategy.symbol} onChange={chooseMarket} />
            </div>

            <div>
              <div className="mb-1.5 flex items-center text-xs text-muted">
                {tl("Unité de temps")}<Help id="unite-de-temps" />
              </div>
              <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:px-0">
                {INTERVALS.map((i) => (
                  <button
                    key={i}
                    onClick={() => chooseInterval(i)}
                    aria-pressed={strategy.interval === i}
                    className={`shrink-0 rounded-md border px-3 py-1.5 text-sm ${strategy.interval === i ? "border-accent bg-accent/10 text-fg" : "border-line text-muted hover:text-fg"}`}
                  >
                    {beginner ? tl(INTERVAL_LABELS[i]) : i}
                    {beginner && RECOMMENDED.has(i) && <span className="ml-1 text-[10px] text-up">{tl("conseillé")}</span>}
                  </button>
                ))}
              </div>
            </div>

            {!beginner && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Field label={tl("Sens")} term="sens">
                <select value={strategy.direction} onChange={(e) => set("direction", e.target.value as Strategy["direction"])}>
                  <option value="long">{tl("Achat seulement")}</option>
                  <option value="short">{tl("Vente à découvert seulement")}</option>
                  <option value="both">{tl("Les deux")}</option>
                </select>
              </Field>
              <Field label={tl("Nom")}>
                <input value={strategy.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
                  <Field label={tl("Style")} term="style">
                    <select value={strategy.style} onChange={(e) => set("style", e.target.value as Strategy["style"])}>
                      <option value="scalp">{tl("Scalp")}</option>
                      <option value="day">{tl("Day trading")}</option>
                      <option value="swing">{tl("Swing")}</option>
                    </select>
                  </Field>
                  <Field label={tl("Fuseau horaire")} term="fuseau">
                    <select value={strategy.timezone} onChange={(e) => set("timezone", e.target.value)}>
                      {timezones(strategy.timezone).map((tz) => (
                        <option key={tz} value={tz}>
                          {tz.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </Field>
            </div>
            )}
          </div>
        </Card>

        <Card title={beginner ? tl("3. Les règles") : tl("3. Règles d'entrée et de sortie")}>
          {beginner && !editRules ? (
            <div className="flex flex-col gap-2">
              <RulesSummary strategy={strategy} />
              <button onClick={() => setEditRules(true)} className="self-start text-sm text-accent hover:underline">
                {tl("Modifier les règles →")}</button>
            </div>
          ) : (
          <div className="flex flex-col gap-5">
            {strategy.direction !== "short" && (
              <RuleSection title={tl("Quand acheter")} color="text-up">
                <GroupsEditor value={strategy.entryLong} onChange={(v) => set("entryLong", v)} emptyHint={tl("Aucune règle d'achat.")} />
              </RuleSection>
            )}
            {strategy.direction !== "long" && (
              <RuleSection title={tl("Quand vendre à découvert")} color="text-down">
                <GroupsEditor value={strategy.entryShort} onChange={(v) => set("entryShort", v)} emptyHint={tl("Aucune règle de vente.")} />
              </RuleSection>
            )}
            {strategy.direction !== "short" && (
              <RuleSection title={tl("Sortie d'un achat (optionnel)")}>
                <GroupsEditor value={strategy.exitLong} onChange={(v) => set("exitLong", v)} emptyHint={tl("Sortie seulement par le stop, l'objectif ou le temps.")} />
              </RuleSection>
            )}
            {strategy.direction !== "long" && (
              <RuleSection title={tl("Sortie d'une vente (optionnel)")}>
                <GroupsEditor value={strategy.exitShort} onChange={(v) => set("exitShort", v)} emptyHint={tl("Sortie seulement par le stop, l'objectif ou le temps.")} />
              </RuleSection>
            )}
            {!beginner && (
              <p className="text-xs text-muted">
                {tl("Règles évaluées à la clôture de chaque bougie, ordre à l'ouverture suivante. Stop et objectif surveillés dans la bougie ; si les deux sont touchés, le stop compte en premier.")}</p>
            )}
          </div>
          )}
        </Card>

        <Card title={beginner ? tl("4. Limiter les pertes") : tl("4. Risque, sorties et horaires")}>
          <div className="flex flex-col gap-3">
            <div className={`grid gap-3 ${beginner ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`}>
              <Field label={tl("Stop")} term="stop">
                <select
                  value={strategy.stop.type}
                  onChange={(e) => set("stop", { ...strategy.stop, type: e.target.value as Strategy["stop"]["type"], value: strategy.stop.value ?? 2, atrPeriod: strategy.stop.atrPeriod ?? 14 })}
                >
                  <option value="none">{tl("Aucun")}</option>
                  <option value="percent">{tl("En %")}</option>
                  <option value="atr">{tl("En ATR")}</option>
                  <option value="swing">{tl("Plus bas / haut récent")}</option>
                </select>
              </Field>
              {strategy.stop.type !== "none" ? (
                <Field label={strategy.stop.type === "percent" ? "Distance (%)" : strategy.stop.type === "atr" ? tl("Multiple d'ATR") : tl("Nombre de bougies")} term={strategy.stop.type === "atr" ? "atr" : undefined}>
                  <input type="number" step="any" inputMode="decimal" value={strategy.stop.value ?? ""} onChange={(e) => set("stop", { ...strategy.stop, value: numOrNull(e.target.value) })} />
                </Field>
              ) : (
                beginner && <p className="self-end text-[11px] text-warn">{tl("Sans stop, une seule perte peut être énorme.")}</p>
              )}
              <Field label={tl("Objectif")} term="objectif">
                <select
                  value={strategy.takeProfit.type}
                  onChange={(e) =>
                    set("takeProfit", { ...strategy.takeProfit, type: e.target.value as Strategy["takeProfit"]["type"], value: strategy.takeProfit.value ?? 2, atrPeriod: strategy.takeProfit.atrPeriod ?? 14 })
                  }
                >
                  <option value="none">{tl("Aucun")}</option>
                  <option value="r_multiple">{tl("En R (× le stop)")}</option>
                  <option value="percent">{tl("En %")}</option>
                  <option value="atr">{tl("En ATR")}</option>
                </select>
              </Field>
              {strategy.takeProfit.type !== "none" && (
                <Field label={strategy.takeProfit.type === "r_multiple" ? tl("Objectif en R") : tl("Valeur de l'objectif")} term={strategy.takeProfit.type === "r_multiple" ? "r" : undefined}>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={strategy.takeProfit.value ?? ""}
                    onChange={(e) => set("takeProfit", { ...strategy.takeProfit, value: numOrNull(e.target.value) })}
                  />
                </Field>
              )}
              <Field label={tl("Risque par trade (%)")} term="risque-par-trade">
                <input type="number" step="any" inputMode="decimal" value={strategy.riskPerTradePercent} onChange={(e) => set("riskPerTradePercent", Number(e.target.value))} />
              </Field>
              {!beginner && (
                <>
                  <Field label={tl("Stop suiveur")} term="stop-suiveur">
                    <select
                      value={strategy.trailingStop.type}
                      onChange={(e) =>
                        set("trailingStop", { ...strategy.trailingStop, type: e.target.value as Strategy["trailingStop"]["type"], value: strategy.trailingStop.value ?? 2, atrPeriod: strategy.trailingStop.atrPeriod ?? 14 })
                      }
                    >
                      <option value="none">{tl("Aucun")}</option>
                      <option value="percent">{tl("En %")}</option>
                      <option value="atr">{tl("En ATR")}</option>
                    </select>
                  </Field>
                  {strategy.trailingStop.type !== "none" && (
                    <Field label={tl("Distance du stop suiveur")} term="stop-suiveur">
                      <input type="number" step="any" value={strategy.trailingStop.value ?? ""} onChange={(e) => set("trailingStop", { ...strategy.trailingStop, value: numOrNull(e.target.value) })} />
                    </Field>
                  )}
                  <Field label={tl("Point mort à (R)")} hint={tl("vide = jamais")} term="point-mort">
                    <input type="number" step="any" value={strategy.breakEvenAtR ?? ""} onChange={(e) => set("breakEvenAtR", numOrNull(e.target.value))} />
                  </Field>
                  <Field label={tl("Durée max (bougies)")} hint={tl("vide = illimitée")} term="duree-max">
                    <input type="number" value={strategy.maxBarsInTrade ?? ""} onChange={(e) => set("maxBarsInTrade", numOrNull(e.target.value))} />
                  </Field>
                  <Field label={tl("Taille sans stop (%)")} term="taille">
                    <input type="number" step="any" value={strategy.positionSizePercent} onChange={(e) => set("positionSizePercent", Number(e.target.value))} />
                  </Field>
                  <Field label={tl("Levier max")} term="levier">
                    <input type="number" step="any" value={strategy.maxLeverage} onChange={(e) => set("maxLeverage", Number(e.target.value))} />
                  </Field>
                  <div className="col-span-2">
                    <Field label={tl("Entrées entre")} hint={tl("heure locale, vide = toute la journée")} term="horaires">
                      <div className="flex items-center gap-1">
                        <input
                          type="time"
                          value={strategy.tradingWindow?.start ?? ""}
                          onChange={(e) => set("tradingWindow", e.target.value ? { start: e.target.value, end: strategy.tradingWindow?.end ?? "23:59" } : null)}
                        />
                        <span>{tl("et")}</span>
                        <input
                          type="time"
                          value={strategy.tradingWindow?.end ?? ""}
                          onChange={(e) => set("tradingWindow", e.target.value ? { start: strategy.tradingWindow?.start ?? "00:00", end: e.target.value } : null)}
                        />
                      </div>
                    </Field>
                  </div>
                  <Field label={tl("Tout fermer à")} hint={tl("vide = jamais")} term="fermer-a">
                    <input type="time" value={strategy.exitAtTime ?? ""} onChange={(e) => set("exitAtTime", e.target.value || null)} />
                  </Field>
                  <Field label={tl("Jours d'entrée")} term="jours">
                    <div className="flex flex-wrap gap-1">
                      {DAYS.map((d, i) => {
                        const day = i + 1;
                        const on = strategy.tradingDays.includes(day);
                        return (
                          <button
                            key={d}
                            onClick={() => set("tradingDays", on ? strategy.tradingDays.filter((x) => x !== day) : [...strategy.tradingDays, day].sort())}
                            className={`rounded px-1.5 py-0.5 text-xs ${on ? "bg-accent text-white" : "border border-line text-muted"}`}
                          >
                            {tl(d)}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                </>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        <Card title={beginner ? tl("5. Lance le test") : tl("5. Paramètres du test")}>
          <div className="flex flex-col gap-3">
            <div>
              <div className="mb-1.5 flex items-center text-xs text-muted">
                {tl("Période")}<Help id="periode-test" />
              </div>
              <div className="flex gap-1.5">
                {PERIODS.map((p) => {
                  const span = Math.min(p.days, MAX_HISTORY_DAYS[strategy.interval]);
                  const on = Math.abs(years * 365.25 - span) < 3;
                  return (
                    <button
                      key={p.label}
                      onClick={() => choosePeriod(p.days)}
                      className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${on ? "border-accent bg-accent/10 text-fg" : "border-line text-muted hover:text-fg"}`}
                    >
                      {tl(p.label)}
                    </button>
                  );
                })}
              </div>
            </div>
            {beginner ? (
              <p className="text-[11px] text-muted">
                {tl("Du {0} au {1}", [date(new Date(config.startDate).getTime(), false), date(new Date(config.endDate).getTime(), false)])}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={tl("Du")}>
                    <input type="date" value={config.startDate} onChange={(e) => setConfig({ ...config, startDate: e.target.value })} />
                  </Field>
                  <Field label={tl("Au")}>
                    <input type="date" value={config.endDate} onChange={(e) => setConfig({ ...config, endDate: e.target.value })} />
                  </Field>
                </div>
                <p className="text-[11px] text-muted">{tl("Max ")}{MAX_HISTORY_DAYS[strategy.interval]} {tl(" jours en ")}{strategy.interval}.</p>
              </>
            )}
            <Field label={tl("Capital de départ (USD)")} term="capital">
              <input type="number" inputMode="numeric" value={config.initialCapital} onChange={(e) => setConfig({ ...config, initialCapital: Number(e.target.value) })} />
            </Field>
            {beginner ? (
              <div className="flex items-center text-xs text-muted">
                {tl("Frais : ")}<span className="ml-1 text-fg">{fees !== null ? tl(FEE_PRESETS[fees].short) : tl("personnalisés")}</span>
                <Help id="frais" />
              </div>
            ) : (
              <Field label={tl("Frais")} term="frais">
                <select value={fees ?? ""} onChange={(e) => e.target.value !== "" && applyFees(Number(e.target.value))}>
                  <option value="" disabled>
                    {tl("Personnalisés")}</option>
                  {FEE_PRESETS.map((p, i) => (
                    <option key={p.label} value={i}>
                      {tl(p.label)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {!beginner && (
              <div className="grid grid-cols-2 gap-2">
                <Field label={tl("Frais / côté (%)")} term="frais">
                  <input type="number" step="any" value={config.feePercent} onChange={(e) => setCost("feePercent", e.target.value)} />
                </Field>
                <Field label={tl("Spread (%)")} term="spread">
                  <input type="number" step="any" value={config.spreadPercent} onChange={(e) => setCost("spreadPercent", e.target.value)} />
                </Field>
                <Field label={tl("Glissement (%)")} term="glissement">
                  <input type="number" step="any" value={config.slippagePercent} onChange={(e) => setCost("slippagePercent", e.target.value)} />
                </Field>
                <Field label={tl("Financement / 8h (%)")} term="financement">
                  <input type="number" step="any" value={config.fundingPercentPer8h} onChange={(e) => setCost("fundingPercentPer8h", e.target.value)} />
                </Field>
              </div>
            )}
            {error && (
              <Alert tone="error">
                {error}
                {recharge && (
                  <Link href="/tarifs#recharges" className="mt-1 block font-semibold underline">
                    {tl("Voir les recharges →")}</Link>
                )}
              </Alert>
            )}
            {notice && <Alert tone="info">{notice}</Alert>}
            <div className="hidden flex-col gap-2 md:flex">
              {job && <ProgressBar job={job} />}
              <Button onClick={run} disabled={busy !== null} className="py-2">
                {busy === "run" ? runLabel : tl("Lancer le backtest")}
              </Button>
            </div>
            <Button variant="ghost" onClick={onSave} disabled={busy !== null}>
              {tl("Enregistrer sans tester")}</Button>
            {savedId && (
              <Button variant="ghost" onClick={() => router.push(`/live?strategy=${savedId}`)} disabled={busy !== null}>
                {tl("Suivre en direct")}</Button>
            )}
          </div>
        </Card>
      </div>

      {/* Phones: the run button stays within reach above the tab bar. */}
      <div className="fixed inset-x-0 bottom-[calc(58px+env(safe-area-inset-bottom))] z-20 border-t border-line bg-panel/95 px-3 py-2 backdrop-blur md:hidden">
        {error && (
          <p className="mb-1.5 line-clamp-3 text-xs text-down">
            {error}
            {recharge && (
              <Link href="/tarifs#recharges" className="ml-1 font-semibold underline">
                {tl("Recharger")}</Link>
            )}
          </p>
        )}
        {job && <ProgressBar job={job} />}
        <Button onClick={run} disabled={busy !== null} className="w-full py-2.5">
          {busy === "run" ? runLabel : tl("Lancer le backtest · {0} {1} · {2} an{3}", [strategy.symbol, strategy.interval, Math.round(years), Math.round(years) > 1 ? "s" : ""])}
        </Button>
      </div>
    </div>
  );
}

/** Starting points: cards with a one-line pitch for beginners, compact chips for experts. */
function Templates({ templates, current, onPick, beginner }: { templates: Template[]; current: string; onPick: (t: Template) => void; beginner: boolean }) {
  const tl = useT();
  if (!beginner) {
    return (
      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs text-muted">{tl("Modèles :")}</span>
        {templates.map((t) => (
          <button key={t.id} onClick={() => onPick(t)} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted hover:border-accent hover:text-fg">
            {t.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="no-scrollbar -mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-3">
      {templates.map((t) => {
        const [style, name] = t.label.split(" · ");
        const selected = t.strategy.name === current;
        return (
          <button
            key={t.id}
            onClick={() => onPick(t)}
            className={`w-60 shrink-0 snap-start rounded-lg border p-3 text-left transition sm:w-auto ${selected ? "border-accent bg-accent/10" : "border-line bg-panel-2/50 hover:border-accent/60"}`}
          >
            <div className="text-[11px] uppercase tracking-wide text-accent">{style}</div>
            <div className="mt-0.5 text-sm font-semibold leading-snug">{name ?? t.label}</div>
            <div className="mt-1 line-clamp-2 text-xs text-muted">{t.prompt}</div>
          </button>
        );
      })}
    </div>
  );
}

/** The rules in one line per side, for beginners: "Achète quand : RSI 2 < 10 et Clôture > MM 200". */
function RulesSummary({ strategy }: { strategy: Strategy }) {
  const tl = useT();
  const phrase = (groups: Strategy["entryLong"]) =>
    groups
      .filter((g) => g.conditions.length)
      .map((g) => g.conditions.map((c) => `${operandLabel(c.left)} ${tl(COMPARATOR_LABELS[c.op])} ${operandLabel(c.right)}`).join(tl(" et ")))
      .join(tl(", ou "));
  const lines = [
    strategy.direction !== "short" && { label: tl("Achète quand"), text: phrase(strategy.entryLong), tone: "text-up" },
    strategy.direction !== "long" && { label: tl("Vend à découvert quand"), text: phrase(strategy.entryShort), tone: "text-down" },
    strategy.direction !== "short" && phrase(strategy.exitLong) && { label: tl("Sort quand"), text: phrase(strategy.exitLong), tone: "text-fg" },
  ].filter(Boolean) as { label: string; text: string; tone: string }[];
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {lines.map((l) => (
        <li key={l.label}>
          <span className={`font-semibold ${l.tone}`}>{l.label} : </span>
          {l.text || <span className="text-muted">{tl("aucune règle, choisis un modèle")}</span>}
        </li>
      ))}
    </ul>
  );
}

function AiSummary({ ai }: { ai: AiResult }) {
  const tl = useT();
  return (
    <div className="flex flex-col gap-2 rounded-md border border-accent/30 bg-accent/5 p-3 text-sm">
      <p>{ai.explanation}</p>
      {ai.assumptions.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted">{tl("Choix faits par l'IA (à vérifier)")}</div>
          <ul className="ml-4 list-disc text-xs text-muted">
            {ai.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {ai.questions.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-warn">{tl("Questions")}</div>
          <ul className="ml-4 list-disc text-xs">
            {ai.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">{tl("Réponds dans la zone de texte puis clique sur « Modifier avec l'IA ».")}</p>
        </div>
      )}
      {ai.problems.map((p, i) => (
        <p key={i} className="text-xs text-warn">
          {p}
        </p>
      ))}
    </div>
  );
}

interface JobState {
  status: "queued" | "running" | "done" | "failed";
  progress: number;
  message: string | null;
  resultId: string | null;
  error: string | null;
  ahead: number;
}

function jobLabel(job: JobState) {
  if (job.status === "queued") return job.ahead > 0 ? tr("En file d'attente ({0} avant toi)…", [job.ahead]) : tr("Démarrage…");
  return `${job.message ?? tr("Calcul")} · ${job.progress} %`;
}

function ProgressBar({ job }: { job: JobState }) {
  return (
    <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-panel-2">
      <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.max(3, job.progress)}%` }} />
    </div>
  );
}

function RuleSection({ title, color = "text-fg", children }: { title: string; color?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className={`mb-2 text-sm font-semibold ${color}`}>{title}</h3>
      {children}
    </div>
  );
}

const COMMON_TIMEZONES = ["Europe/Paris", "Europe/Brussels", "Europe/Zurich", "Europe/London", "America/Montreal", "America/New_York", "Africa/Casablanca", "Africa/Abidjan", "Africa/Dakar", "Indian/Reunion", "America/Martinique", "Asia/Dubai", "Asia/Tokyo", "UTC"];

/** Common zones for French-speaking traders first, then every zone the browser knows. */
function timezones(current: string): string[] {
  let all: string[] = [];
  try {
    all = Intl.supportedValuesOf("timeZone");
  } catch {
    // Older browsers: the common list is enough.
  }
  return [...new Set([current, ...COMMON_TIMEZONES, ...all])];
}

function numOrNull(v: string) {
  return v === "" ? null : Number(v);
}

/** A useful default test length per interval: long for swing, shorter where data is heavy. */
const DEFAULT_PERIOD_DAYS: Record<Strategy["interval"], number> = { "1m": 90, "5m": 365, "15m": 730, "1h": 1095, "4h": 1825, "1d": 1825 };

function withDefaultPeriod(c: BacktestConfig, s: Strategy): BacktestConfig {
  const end = Date.parse(c.endDate);
  return { ...c, startDate: new Date(end - DEFAULT_PERIOD_DAYS[s.interval] * 86_400_000).toISOString().slice(0, 10) };
}

/** Shortens the test period when the interval only allows less history. */
function clampPeriod(c: BacktestConfig, s: Strategy): BacktestConfig {
  const max = MAX_HISTORY_DAYS[s.interval];
  const end = Date.parse(c.endDate);
  const start = Date.parse(c.startDate);
  if ((end - start) / 86_400_000 <= max) return c;
  return { ...c, startDate: new Date(end - max * 86_400_000).toISOString().slice(0, 10) };
}
