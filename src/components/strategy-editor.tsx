"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { defaultConfig, defaultStrategy, type BacktestConfig, type Strategy } from "@/lib/strategy/schema";
import type { Template } from "@/lib/strategy/templates";
import { INTERVALS, MAX_HISTORY_DAYS } from "@/lib/types";
import { isCrypto, market } from "@/lib/markets";
import Link from "next/link";
import { FieldHelp, Term, Tip } from "./learn";
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

const FEE_PRESETS: { label: string; config: Partial<BacktestConfig> }[] = [
  { label: "Binance Spot (0,1 %)", config: { feePercent: 0.1, spreadPercent: 0.01, slippagePercent: 0.01, fundingPercentPer8h: 0 } },
  { label: "Binance Futures, ordres au marché (0,05 %)", config: { feePercent: 0.05, spreadPercent: 0.01, slippagePercent: 0.01, fundingPercentPer8h: 0.01 } },
  { label: "Binance Futures, ordres limites (0,02 %)", config: { feePercent: 0.02, spreadPercent: 0.01, slippagePercent: 0, fundingPercentPer8h: 0.01 } },
  { label: "Forex, or, Nasdaq (CFD, spread serré)", config: { feePercent: 0.0035, spreadPercent: 0.01, slippagePercent: 0.005, fundingPercentPer8h: 0.002 } },
  { label: "Sans frais (irréaliste)", config: { feePercent: 0, spreadPercent: 0, slippagePercent: 0, fundingPercentPer8h: 0 } },
];

/** One-click markets above the symbol field. */
const QUICK_MARKETS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "NAS100"];

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function StrategyEditor({ id }: { id?: string }) {
  const router = useRouter();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [strategy, setStrategy] = useState<Strategy>(defaultStrategy);
  const [config, setConfig] = useState<BacktestConfig>(defaultConfig);
  const [text, setText] = useState("");
  const [savedId, setSavedId] = useState<string | undefined>(id);
  const [ai, setAi] = useState<AiResult | null>(null);
  const [busy, setBusy] = useState<"ai" | "save" | "run" | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [symbols, setSymbols] = useState<string[]>([]);
  // The symbol the suggestions were fetched for, so a warning never shows for a stale list.
  const [symbolsFor, setSymbolsFor] = useState<string | null>(null);

  useEffect(() => {
    api<Meta>("/api/meta").then(setMeta).catch((e) => setError(e.message));
    if (id) {
      api<{ strategy: Strategy; sourceText: string | null }>(`/api/strategies/${id}`)
        .then((s) => {
          setStrategy(s.strategy);
          setText(s.sourceText ?? "");
          setConfig((c) => clampPeriod(c, s.strategy));
        })
        .catch((e) => setError(e.message));
    }
  }, [id]);

  useEffect(() => {
    const q = strategy.symbol;
    const timer = setTimeout(() => {
      api<{ symbol: string }[]>(`/api/symbols?q=${encodeURIComponent(q)}`)
        .then((rows) => {
          setSymbols(rows.map((r) => r.symbol));
          setSymbolsFor(q);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [strategy.symbol]);

  const set = <K extends keyof Strategy>(k: K, v: Strategy[K]) => setStrategy((s) => ({ ...s, [k]: v }));

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
      setError((e as Error).message);
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
      setNotice("Stratégie enregistrée.");
      setTimeout(() => setNotice(null), 2500);
    } catch (e) {
      setError((e as Error).message);
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
        if (state.status === "failed") throw new Error(state.error ?? "Le calcul a échoué.");
        await new Promise((r) => setTimeout(r, 700));
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
      setJob(null);
    }
  };

  const runLabel = job ? jobLabel(job) : "Backtest en cours…";

  const applyTemplate = (t: Template) => {
    setText(t.prompt);
    setStrategy(t.strategy);
    setConfig((c) => withDefaultPeriod(c, t.strategy));
    setAi(null);
  };

  return (
    <div className="grid gap-4 pb-20 md:pb-0 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-4">
        <Tip title="Mode débutant : comment ça marche">
          <ol className="ml-4 list-decimal">
            <li>Choisis un modèle ci-dessous (ou décris ton idée en français et laisse l&apos;IA la traduire).</li>
            <li>Regarde les règles qu&apos;il a remplies : chaque terme souligné s&apos;explique d&apos;un clic.</li>
            <li>Garde les réglages proposés pour le risque et les frais, ils sont réalistes.</li>
            <li>Clique sur « Lancer le backtest », puis lis les résultats avec la lecture guidée.</li>
          </ol>
          <p className="mt-1">
            Pas sûr d&apos;un mot ? Tout est dans <Link href="/apprendre" className="underline">la page Apprendre</Link>. Tu peux repasser en mode Expert en haut de la page.
          </p>
        </Tip>
        <Card title="1. Décris ta stratégie">
          <div className="flex flex-col gap-3">
            <Tip>
              Écris comme tu parles : l&apos;unité de temps, la crypto, quand acheter, où mettre le <Term id="stop">stop</Term> et l&apos;<Term id="objectif">objectif</Term>. Pour
              un premier essai, le modèle « Swing · Rebond RSI(2) » est le plus simple à comprendre.
            </Tip>
            <textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex. : En 15 minutes sur BTCUSDT, j'achète quand le RSI 14 passe sous 30 et que le prix est au-dessus de la MM 200 en 1 heure. Stop sous le plus bas des 10 dernières bougies, objectif 2R, je ferme tout à 22h."
              className="w-full"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={translate} disabled={!meta?.aiEnabled || busy !== null || text.trim().length < 5}>
                {busy === "ai" ? "Traduction en cours…" : ai ? "Modifier avec l'IA" : "Traduire en règles avec l'IA"}
              </Button>
              {meta && !meta.aiEnabled && (
                <span className="text-xs text-muted">IA non configurée : ajoute ANTHROPIC_API_KEY dans .env.local. Le constructeur ci-dessous marche sans.</span>
              )}
            </div>
            {meta && (
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted">Modèles :</span>
                {meta.templates.map((t) => (
                  <button key={t.id} onClick={() => applyTemplate(t)} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted hover:border-accent hover:text-fg">
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            {ai && (
              <div className="flex flex-col gap-2 rounded-md border border-accent/30 bg-accent/5 p-3 text-sm">
                <p>{ai.explanation}</p>
                {ai.assumptions.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-muted">Choix faits par l&apos;IA (à vérifier)</div>
                    <ul className="ml-4 list-disc text-xs text-muted">
                      {ai.assumptions.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {ai.questions.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-warn">Questions</div>
                    <ul className="ml-4 list-disc text-xs">
                      {ai.questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                    <p className="mt-1 text-xs text-muted">Réponds dans la zone de texte puis clique sur « Modifier avec l&apos;IA ».</p>
                  </div>
                )}
                {ai.problems.map((p, i) => (
                  <p key={i} className="text-xs text-warn">
                    {p}
                  </p>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card title="2. Marché et style">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Nom">
              <input value={strategy.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <div className="col-span-2 flex flex-wrap items-center gap-1.5 md:col-span-4">
              <span className="text-xs text-muted">Marchés :</span>
              {QUICK_MARKETS.map((s) => (
                <button
                  key={s}
                  onClick={() => set("symbol", s)}
                  title={market(s)?.label}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${strategy.symbol === s ? "border-accent text-fg" : "border-line text-muted hover:border-accent hover:text-fg"}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <Field
              label={<Term id="symbole">Marché</Term>}
              help={<FieldHelp>{market(strategy.symbol) ? `${market(strategy.symbol)!.label} : fermé le week-end.` : "BTCUSDT = bitcoin en dollars."}</FieldHelp>}
            >
              <input list="symbols" value={strategy.symbol} onChange={(e) => set("symbol", e.target.value.toUpperCase())} />
              <datalist id="symbols">
                {symbols.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              {symbolsFor === strategy.symbol && strategy.symbol.length >= 5 && !symbols.includes(strategy.symbol) && (
                <span className="text-[11px] text-warn">Marché introuvable{symbols[0] ? ` : ${symbols[0]} ?` : "."}</span>
              )}
            </Field>
            <Field label={<Term id="unite-de-temps">Unité de temps</Term>} help={<FieldHelp>Durée d&apos;une bougie. Débute en 4h ou 1d.</FieldHelp>}>
              <select
                value={strategy.interval}
                onChange={(e) => {
                  const s = { ...strategy, interval: e.target.value as Strategy["interval"] };
                  setStrategy(s);
                  setConfig((c) => clampPeriod(c, s));
                }}
              >
                {INTERVALS.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </select>
            </Field>
            <Field label={<Term id="style">Style</Term>}>
              <select value={strategy.style} onChange={(e) => set("style", e.target.value as Strategy["style"])}>
                <option value="scalp">Scalp</option>
                <option value="day">Day trading</option>
                <option value="swing">Swing</option>
              </select>
            </Field>
            <Field label="Sens" help={<FieldHelp term="short">Pour débuter : achat seulement.</FieldHelp>}>
              <select value={strategy.direction} onChange={(e) => set("direction", e.target.value as Strategy["direction"])}>
                <option value="long">Achat seulement</option>
                <option value="short">Vente à découvert seulement</option>
                <option value="both">Les deux</option>
              </select>
            </Field>
            <Field label={<Term id="fuseau">Fuseau horaire</Term>}>
              <select value={strategy.timezone} onChange={(e) => set("timezone", e.target.value)}>
                {timezones(strategy.timezone).map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card title="3. Règles">
          <div className="flex flex-col gap-5">
            <Tip title="Lire une règle">
              Chaque ligne est une <Term id="signal">condition</Term>, par exemple « RSI 14 &lt; 30 ». Les conditions reliées par <Term id="et-ou">ET</Term> doivent être vraies en même
              temps ; un nouveau groupe (OU) est une autre façon d&apos;entrer. Le chiffre à côté d&apos;un indicateur est sa <Term id="periode">période</Term>. Les noms d&apos;indicateurs
              soulignés s&apos;expliquent d&apos;un clic.
            </Tip>
            {strategy.direction !== "short" && (
              <RuleSection title="Entrée à l'achat" color="text-up">
                <GroupsEditor value={strategy.entryLong} onChange={(v) => set("entryLong", v)} emptyHint="Aucune règle d'achat." />
              </RuleSection>
            )}
            {strategy.direction !== "long" && (
              <RuleSection title="Entrée à la vente à découvert" color="text-down">
                <GroupsEditor value={strategy.entryShort} onChange={(v) => set("entryShort", v)} emptyHint="Aucune règle de vente." />
              </RuleSection>
            )}
            {strategy.direction !== "short" && (
              <RuleSection title="Sortie d'un achat (optionnel)">
                <GroupsEditor value={strategy.exitLong} onChange={(v) => set("exitLong", v)} emptyHint="Sortie uniquement par stop, objectif ou temps." />
              </RuleSection>
            )}
            {strategy.direction !== "long" && (
              <RuleSection title="Sortie d'une vente (optionnel)">
                <GroupsEditor value={strategy.exitShort} onChange={(v) => set("exitShort", v)} emptyHint="Sortie uniquement par stop, objectif ou temps." />
              </RuleSection>
            )}
            <p className="text-xs text-muted">
              Les règles sont vérifiées à la clôture de chaque bougie, l&apos;ordre part à l&apos;ouverture de la suivante. Stop et objectif sont surveillés dans la bougie ; si les deux
              sont touchés, le stop compte en premier.
            </p>
          </div>
        </Card>

        <Card title="4. Gestion du risque et des horaires">
          <div className="mb-3">
            <Tip title="La partie la plus importante">
              Une bonne gestion du risque compte plus que les règles d&apos;entrée. Garde un <Term id="stop">stop</Term>, un <Term id="risque-par-trade">risque par trade</Term> de 1 % et
              un objectif en <Term id="r">R</Term> : tu sais ainsi à l&apos;avance combien chaque trade peut te coûter.
            </Tip>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label={<Term id="stop">Stop</Term>} help={<FieldHelp>Où couper la perte. En ATR, il s&apos;adapte à l&apos;agitation du marché.</FieldHelp>}>
              <select value={strategy.stop.type} onChange={(e) => set("stop", { ...strategy.stop, type: e.target.value as Strategy["stop"]["type"], value: strategy.stop.value ?? 2, atrPeriod: strategy.stop.atrPeriod ?? 14 })}>
                <option value="none">Aucun</option>
                <option value="percent">En %</option>
                <option value="atr">En ATR</option>
                <option value="swing">Plus bas / haut récent</option>
              </select>
            </Field>
            {strategy.stop.type !== "none" && (
              <Field label={strategy.stop.type === "percent" ? "Distance (%)" : strategy.stop.type === "atr" ? "Multiple d'ATR" : "Nombre de bougies"}>
                <input type="number" step="any" value={strategy.stop.value ?? ""} onChange={(e) => set("stop", { ...strategy.stop, value: numOrNull(e.target.value) })} />
              </Field>
            )}
            <Field label={<Term id="objectif">Objectif</Term>} help={<FieldHelp term="r">2R = viser 2 fois ce que tu risques.</FieldHelp>}>
              <select value={strategy.takeProfit.type} onChange={(e) => set("takeProfit", { ...strategy.takeProfit, type: e.target.value as Strategy["takeProfit"]["type"], value: strategy.takeProfit.value ?? 2, atrPeriod: strategy.takeProfit.atrPeriod ?? 14 })}>
                <option value="none">Aucun</option>
                <option value="r_multiple">En R (× le stop)</option>
                <option value="percent">En %</option>
                <option value="atr">En ATR</option>
              </select>
            </Field>
            {strategy.takeProfit.type !== "none" && (
              <Field label="Valeur de l'objectif">
                <input type="number" step="any" value={strategy.takeProfit.value ?? ""} onChange={(e) => set("takeProfit", { ...strategy.takeProfit, value: numOrNull(e.target.value) })} />
              </Field>
            )}
            <Field label={<Term id="stop-suiveur">Stop suiveur</Term>}>
              <select value={strategy.trailingStop.type} onChange={(e) => set("trailingStop", { ...strategy.trailingStop, type: e.target.value as Strategy["trailingStop"]["type"], value: strategy.trailingStop.value ?? 2, atrPeriod: strategy.trailingStop.atrPeriod ?? 14 })}>
                <option value="none">Aucun</option>
                <option value="percent">En %</option>
                <option value="atr">En ATR</option>
              </select>
            </Field>
            {strategy.trailingStop.type !== "none" && (
              <Field label="Distance du stop suiveur">
                <input type="number" step="any" value={strategy.trailingStop.value ?? ""} onChange={(e) => set("trailingStop", { ...strategy.trailingStop, value: numOrNull(e.target.value) })} />
              </Field>
            )}
            <Field label={<Term id="point-mort">Stop au point mort à (R)</Term>} hint="vide = jamais">
              <input type="number" step="any" value={strategy.breakEvenAtR ?? ""} onChange={(e) => set("breakEvenAtR", numOrNull(e.target.value))} />
            </Field>
            <Field label={<Term id="duree-max">Durée max (bougies)</Term>} hint="vide = illimitée">
              <input type="number" value={strategy.maxBarsInTrade ?? ""} onChange={(e) => set("maxBarsInTrade", numOrNull(e.target.value))} />
            </Field>
            <Field label={<Term id="risque-par-trade">Risque par trade (%)</Term>} hint="perte au stop, en % du capital" help={<FieldHelp>1 % est un bon départ.</FieldHelp>}>
              <input type="number" step="any" value={strategy.riskPerTradePercent} onChange={(e) => set("riskPerTradePercent", Number(e.target.value))} />
            </Field>
            <Field label={<Term id="taille">Taille sans stop (% du capital)</Term>}>
              <input type="number" step="any" value={strategy.positionSizePercent} onChange={(e) => set("positionSizePercent", Number(e.target.value))} />
            </Field>
            <Field label={<Term id="levier">Levier max</Term>} help={<FieldHelp>Plus il est haut, plus une perte peut être grosse.</FieldHelp>}>
              <input type="number" step="any" value={strategy.maxLeverage} onChange={(e) => set("maxLeverage", Number(e.target.value))} />
            </Field>
            <div className="col-span-2">
              <Field label="Entrées entre" hint="heure locale, vide = toute la journée">
                <div className="flex items-center gap-1">
                  <input type="time" value={strategy.tradingWindow?.start ?? ""} onChange={(e) => set("tradingWindow", e.target.value ? { start: e.target.value, end: strategy.tradingWindow?.end ?? "23:59" } : null)} />
                  <span>et</span>
                  <input type="time" value={strategy.tradingWindow?.end ?? ""} onChange={(e) => set("tradingWindow", e.target.value ? { start: strategy.tradingWindow?.start ?? "00:00", end: e.target.value } : null)} />
                </div>
              </Field>
            </div>
            <Field label="Tout fermer à" hint="day trading, vide = jamais">
              <input type="time" value={strategy.exitAtTime ?? ""} onChange={(e) => set("exitAtTime", e.target.value || null)} />
            </Field>
            <Field label="Jours d'entrée">
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
                      {d}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
        <Card title="5. Paramètres du test">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Du">
                <input type="date" value={config.startDate} onChange={(e) => setConfig({ ...config, startDate: e.target.value })} />
              </Field>
              <Field label="Au">
                <input type="date" value={config.endDate} onChange={(e) => setConfig({ ...config, endDate: e.target.value })} />
              </Field>
            </div>
            <p className="text-[11px] text-muted">Maximum {MAX_HISTORY_DAYS[strategy.interval]} jours en {strategy.interval}. Le premier test d&apos;un symbole télécharge l&apos;historique (jusqu&apos;à une minute en 1m).</p>
            <Tip>Teste sur plusieurs années : une stratégie doit traverser des marchés qui montent, qui baissent et qui stagnent.</Tip>
            <Field label={<Term id="capital">Capital de départ (USD)</Term>} help={<FieldHelp>Argent fictif : rien n&apos;est réellement investi.</FieldHelp>}>
              <input type="number" value={config.initialCapital} onChange={(e) => setConfig({ ...config, initialCapital: Number(e.target.value) })} />
            </Field>
            <Field
              label={<Term id="frais">Frais</Term>}
              help={<FieldHelp>{isCrypto(strategy.symbol) ? "Choisis « Binance Spot » si tu achètes sur Binance sans levier." : "Choisis « Forex, or, Nasdaq » pour un courtier CFD."}</FieldHelp>}
            >
              <select
                onChange={(e) => {
                  const p = FEE_PRESETS[Number(e.target.value)];
                  if (p) setConfig({ ...config, ...p.config });
                }}
                defaultValue=""
              >
                <option value="" disabled>
                  Choisir un profil…
                </option>
                {FEE_PRESETS.map((p, i) => (
                  <option key={p.label} value={i}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Frais / côté (%)">
                <input type="number" step="any" value={config.feePercent} onChange={(e) => setConfig({ ...config, feePercent: Number(e.target.value) })} />
              </Field>
              <Field label={<Term id="spread">Spread (%)</Term>}>
                <input type="number" step="any" value={config.spreadPercent} onChange={(e) => setConfig({ ...config, spreadPercent: Number(e.target.value) })} />
              </Field>
              <Field label={<Term id="glissement">Glissement (%)</Term>}>
                <input type="number" step="any" value={config.slippagePercent} onChange={(e) => setConfig({ ...config, slippagePercent: Number(e.target.value) })} />
              </Field>
              <Field label={<Term id="financement">Financement / 8h (%)</Term>}>
                <input type="number" step="any" value={config.fundingPercentPer8h} onChange={(e) => setConfig({ ...config, fundingPercentPer8h: Number(e.target.value) })} />
              </Field>
            </div>
            {error && <Alert tone="error">{error}</Alert>}
            {notice && <Alert tone="info">{notice}</Alert>}
            {job && <ProgressBar job={job} />}
            <Button onClick={run} disabled={busy !== null}>
              {busy === "run" ? runLabel : "Lancer le backtest"}
            </Button>
            <Button variant="ghost" onClick={onSave} disabled={busy !== null}>
              Enregistrer sans tester
            </Button>
            {savedId && (
              <Button variant="ghost" onClick={() => router.push(`/live?strategy=${savedId}`)} disabled={busy !== null}>
                Suivre en direct
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* Phones: the run button stays within reach above the tab bar. */}
      <div className="fixed inset-x-0 bottom-[calc(58px+env(safe-area-inset-bottom))] z-20 border-t border-line bg-panel/95 px-3 py-2 backdrop-blur md:hidden">
        {error && <p className="mb-1.5 line-clamp-2 text-xs text-down">{error}</p>}
        {job && <ProgressBar job={job} />}
        <Button onClick={run} disabled={busy !== null} className="w-full py-2.5">
          {busy === "run" ? runLabel : `Lancer le backtest · ${strategy.symbol} ${strategy.interval}`}
        </Button>
      </div>
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
  if (job.status === "queued") return job.ahead > 0 ? `En file d'attente (${job.ahead} avant toi)…` : "Démarrage…";
  return `${job.message ?? "Calcul"} · ${job.progress} %`;
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
const DEFAULT_PERIOD_DAYS: Record<Strategy["interval"], number> = { "1m": 90, "5m": 365, "15m": 730, "1h": 1095, "4h": 1825, "1d": 2555 };

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
