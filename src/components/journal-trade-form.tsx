"use client";

import { useEffect, useState } from "react";
import { rich, useT } from "@/lib/client/i18n";
import { api } from "@/lib/client/api";
import { num, pct, price, r, tone } from "@/lib/client/format";
import { MARKETS } from "@/lib/markets";
import { INTERVALS } from "@/lib/types";
import {
  ERROR_CODES,
  ERROR_LABELS,
  EXIT_REASONS,
  EXIT_REASON_LABELS,
  NO_ANSWERS,
  PLAN_CHECK_LABELS,
  balance,
  closeProblem,
  closedResult,
  defaultPointValue,
  isWebLink,
  openProblem,
  planChecks,
  planStatus,
  proposedCost,
  resultAmount,
  resultR,
  riskAmount,
  riskPercent,
  sizeUnit,
  suggestedErrors,
  targetR,
  type ExitReason,
  type JournalTrade,
  type OpenFields,
  type PlanAnswers,
  type Quality,
  type Side,
  type TradeClose,
  type TradeError,
} from "@/lib/journal";
import { FieldHelp, Help, useBeginner } from "./learn";
import { NumberInput } from "./number-input";
import { Alert, Button, Field } from "./ui";
import { Choice, amount, fromLocalInput, otherTrades, toLocalInput, type JournalData } from "./journal-shared";

/** The setup field's two choices that aren't setups. */
const OFF_PLAN = "__off";
const NO_SETUP = "__none";

/** The three points of the plan the trader answers (J4.1 in the book); the risk is checked by the app. */
const QUESTIONS: [keyof PlanAnswers, string][] = [
  ["setup", "Configuration complète, avec toutes ses conditions ?"],
  ["entry", "Entrée au déclencheur prévu, ni avant ni en rattrapage ?"],
  ["exit", "Gestion et sortie comme le plan le dit ?"],
];

const POPULAR = ["BTCUSDT", "ETHUSDT", "SOLUSDT", ...MARKETS.map((m) => m.symbol)];

interface OpenDraft {
  accountId: string;
  setup: string;
  market: string;
  side: Side;
  quality: Quality | null;
  openedAt: string;
  entry: number | null;
  stop: number | null;
  size: number | null;
  /** null: the market's usual value (defaultPointValue), when it has one. */
  pointValue: number | null;
  target: number | null;
  timeframe: string;
  context: string;
  plannedEntry: number | null;
  announcement: string;
  captureUrl: string;
}

interface CloseDraft {
  closedAt: string;
  exit: number | null;
  exitReason: ExitReason | "";
  fees: number | null;
  comment: string;
  captureUrl: string;
  maeR: number | null;
  mfeR: number | null;
}

export type TradeFormMode = "open" | "close" | "edit";

function openDraft(t: JournalTrade | null, data: JournalData, accountId: string, now: number): OpenDraft {
  if (t) {
    return {
      accountId: t.accountId,
      setup: t.setupId ?? (t.offPlan ? OFF_PLAN : NO_SETUP),
      market: t.market,
      side: t.side,
      quality: t.quality,
      openedAt: toLocalInput(t.openedAt),
      entry: t.entry,
      stop: t.stop,
      size: t.size,
      pointValue: t.pointValue,
      target: t.target,
      timeframe: t.timeframe ?? "",
      context: t.context ?? "",
      plannedEntry: t.plannedEntry,
      announcement: t.announcement ?? "",
      captureUrl: t.captureUrl ?? "",
    };
  }
  const hasSetups = data.setups.some((s) => !s.archived);
  return {
    accountId,
    setup: hasSetups ? "" : NO_SETUP,
    market: data.trades[0]?.market ?? "",
    side: "long",
    quality: null,
    openedAt: toLocalInput(now),
    entry: null,
    stop: null,
    size: null,
    pointValue: null,
    target: null,
    timeframe: "",
    context: "",
    plannedEntry: null,
    announcement: "",
    captureUrl: "",
  };
}

function closeDraft(t: JournalTrade | null, now: number): CloseDraft {
  const c = t?.close;
  return {
    closedAt: toLocalInput(c?.closedAt ?? now),
    exit: c?.exit ?? null,
    exitReason: c?.exitReason ?? "",
    fees: c?.fees ?? null,
    comment: c?.comment ?? "",
    captureUrl: c?.captureUrl ?? "",
    maeR: c?.maeR ?? null,
    mfeR: c?.mfeR ?? null,
  };
}

/**
 * Opens, closes or edits a trade, in a sheet over the page. Beginner mode keeps the essentials;
 * expert mode adds the target, the context and MAE / MFE. 1R and the result show while typing.
 */
export function TradeForm({
  data,
  trade,
  mode,
  accountId,
  now,
  onDone,
  onCancel,
}: {
  data: JournalData;
  trade: JournalTrade | null;
  mode: TradeFormMode;
  /** The account a new trade goes to. */
  accountId: string;
  /** When the form was opened: the default entry and exit times. */
  now: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const tl = useT();
  const beginner = useBeginner();
  const [o, setO] = useState<OpenDraft>(() => openDraft(trade, data, accountId, now));
  const [c, setC] = useState<CloseDraft>(() => closeDraft(trade, now));
  const [withClose, setWithClose] = useState(mode === "close" || Boolean(trade?.close));
  const [showOpen, setShowOpen] = useState(mode !== "close");
  const [answers, setAnswers] = useState<PlanAnswers>(trade?.planAnswers ?? NO_ANSWERS);
  const [errors, setErrors] = useState<TradeError[]>(trade?.errors ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setOpen = (patch: Partial<OpenDraft>) => setO((x) => ({ ...x, ...patch }));
  const setClose = (patch: Partial<CloseDraft>) => setC((x) => ({ ...x, ...patch }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const accounts = data.accounts.filter((a) => !a.archived || a.id === o.accountId);
  const account = data.accounts.find((a) => a.id === o.accountId);
  const currency = account?.currency ?? "USD";
  const setups = data.setups.filter((s) => !s.archived || s.id === o.setup);
  const usualPointValue = defaultPointValue(o.market);
  const pointValue = o.pointValue ?? usualPointValue;
  const showPointValue = usualPointValue === null || !beginner || (o.pointValue !== null && o.pointValue !== usualPointValue);
  const lots = sizeUnit(o.market) === "lots";
  const markets = [...new Set([...data.trades.map((t) => t.market), ...POPULAR])];

  const fields: OpenFields | null =
    o.entry !== null && o.stop !== null && o.size !== null && pointValue !== null
      ? { side: o.side, entry: o.entry, stop: o.stop, size: o.size, pointValue, target: o.target, openedAt: fromLocalInput(o.openedAt) ?? now }
      : null;
  const shape = fields && openProblem(fields);
  const risk = fields && !shape ? riskAmount(fields) : null;
  // The capital before this trade: the start plus the account's other closed trades.
  const others = data.trades.filter((t) => t.accountId === o.accountId && t.id !== trade?.id);
  const capital = account ? balance(account.capital, others.map((t) => closedResult(t, currency)?.amount ?? 0)) : 0;
  const riskPct = risk !== null ? riskPercent(risk, capital) : null;
  const planRisk = account?.riskPct ?? null;
  // A tenth of margin: 1.04 % for a 1 % plan is rounding, not a broken rule.
  const tooMuch = planRisk !== null && riskPct !== null && riskPct > planRisk * 1.1;
  const toTarget = fields && !shape ? targetR(fields) : null;

  // The plan's rules, checked live as the server will check them on saving.
  const setupId = o.setup && o.setup !== OFF_PLAN && o.setup !== NO_SETUP ? o.setup : null;
  const checks =
    account && fields && !shape ? planChecks({ openedAt: fields.openedAt, setupId, riskPct }, account, otherTrades(data, o.accountId, trade?.id ?? null, currency)) : [];
  const ruleBreaks = checks.filter((x) => x !== "risk");
  const status = planStatus(checks, answers);
  const suggested = suggestedErrors(checks, answers);
  const riskRatio = riskPct !== null && planRisk ? riskPct / planRisk : null;

  const exitFields = c.exit !== null ? { exit: c.exit, closedAt: fromLocalInput(c.closedAt) ?? now, fees: c.fees ?? 0 } : null;
  const result = fields && !shape && exitFields ? { r: resultR(fields, exitFields), amount: resultAmount(fields, exitFields) } : null;

  const save = async () => {
    setError(null);
    const openedAt = fromLocalInput(o.openedAt);
    if (!o.accountId) return setError(tl("Choisis le compte du trade."));
    if (!o.market.trim()) return setError(tl("Indique le marché."));
    if (!o.setup) return setError(tl("Choisis la configuration du trade, ou « Hors plan »."));
    if (openedAt === null) return setError(tl("Indique la date et l'heure d'entrée."));
    if (o.entry === null || o.stop === null) return setError(tl("Indique le prix d'entrée et le stop."));
    if (o.size === null) return setError(tl("Indique la taille de la position."));
    if (pointValue === null) return setError(tl("Indique la valeur du point pour ce marché."));
    if (shape) return setError(tl(shape));
    for (const link of [o.captureUrl, withClose ? c.captureUrl : ""]) if (link.trim() && !isWebLink(link.trim())) return setError(tl("Le lien de capture doit être une adresse web (https://…)."));
    let close: TradeClose | null = null;
    if (withClose) {
      const closedAt = fromLocalInput(c.closedAt);
      if (c.exit === null) return setError(tl("Indique le prix de sortie."));
      if (closedAt === null) return setError(tl("Indique la date et l'heure de sortie."));
      if (!c.exitReason) return setError(tl("Choisis la raison de la sortie."));
      const problem = closeProblem(fields!, { exit: c.exit, closedAt, fees: c.fees ?? 0 });
      if (problem) return setError(tl(problem));
      close = {
        closedAt,
        exit: c.exit,
        exitReason: c.exitReason,
        fees: c.fees ?? 0,
        comment: c.comment.trim() || null,
        captureUrl: c.captureUrl.trim() || null,
        maeR: c.maeR,
        mfeR: c.mfeR,
      };
    }
    const body = {
      accountId: o.accountId,
      setupId: o.setup === OFF_PLAN || o.setup === NO_SETUP ? null : o.setup,
      offPlan: o.setup === OFF_PLAN,
      market: o.market.trim().toUpperCase(),
      side: o.side,
      quality: o.quality,
      openedAt,
      entry: o.entry,
      stop: o.stop,
      size: o.size,
      pointValue,
      target: o.target,
      timeframe: o.timeframe.trim() || null,
      context: o.context.trim() || null,
      plannedEntry: o.plannedEntry,
      announcement: o.announcement.trim() || null,
      captureUrl: o.captureUrl.trim() || null,
      close,
      planAnswers: answers,
      // The register is for trades out of the plan.
      errors: status === false ? errors : [],
    };
    setBusy(true);
    try {
      await api(trade ? `/api/journal/trades/${trade.id}` : "/api/journal/trades", { method: trade ? "PUT" : "POST", json: body });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!trade || !confirm(tl("Supprimer ce trade du journal ? C'est définitif."))) return;
    setBusy(true);
    try {
      await api(`/api/journal/trades/${trade.id}`, { method: "DELETE" });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const title = mode === "close" ? tl("Clôturer le trade") : trade ? tl("Modifier le trade") : tl("Nouveau trade");

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-center bg-black/60 sm:items-start sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex w-full max-w-2xl flex-col overflow-hidden border-line bg-panel pt-[env(safe-area-inset-top)] sm:max-h-[calc(100vh-3rem)] sm:rounded-lg sm:border sm:pt-0">
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onCancel} className="px-2 text-lg leading-none text-muted hover:text-fg" aria-label={tl("Fermer")}>
            ✕
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          {showOpen ? (
            <section className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {accounts.length > 1 && (
                  <Field label={tl("Compte")}>
                    <select value={o.accountId} onChange={(e) => setOpen({ accountId: e.target.value })}>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label={tl("Marché")} term="symbole">
                  <input list="journal-markets" value={o.market} maxLength={40} placeholder="EURUSD, BTCUSDT, NAS100…" onChange={(e) => setOpen({ market: e.target.value })} />
                  <datalist id="journal-markets">
                    {markets.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </Field>
                <Field label={tl("Sens")}>
                  <Choice
                    value={o.side}
                    onChange={(side) => setOpen({ side })}
                    options={[
                      { id: "long", label: tl("Achat"), tone: "border-up bg-up/15 text-up" },
                      { id: "short", label: tl("Vente"), tone: "border-down bg-down/15 text-down" },
                    ]}
                  />
                </Field>
                <Field label={tl("Configuration")} term="configuration">
                  <select value={o.setup} onChange={(e) => setOpen({ setup: e.target.value })}>
                    {o.setup === "" && <option value="">{tl("Choisir…")}</option>}
                    {setups.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                    {setups.length === 0 && <option value={NO_SETUP}>{tl("Sans configuration")}</option>}
                    <option value={OFF_PLAN}>{tl("Hors plan (aucune de mes configurations)")}</option>
                  </select>
                  {setups.length === 0 && <FieldHelp>{tl("Décris tes configurations dans l'onglet Configurations pour suivre chacune à part.")}</FieldHelp>}
                </Field>
                <Field label={tl("Prix d'entrée")}>
                  <NumberInput nullable value={o.entry} onChange={(entry) => setOpen({ entry })} min={0} />
                </Field>
                <Field label={tl("Stop initial")} term="stop">
                  <NumberInput nullable value={o.stop} onChange={(stop) => setOpen({ stop })} min={0} />
                </Field>
                <Field label={lots ? tl("Taille (lots)") : tl("Taille (quantité)")} term="taille">
                  <NumberInput nullable value={o.size} onChange={(size) => setOpen({ size })} min={0} step={lots ? 0.01 : 1} />
                </Field>
                {showPointValue && (
                  <Field label={tl("Valeur du point")} term="valeur-du-point" hint={tl("Gain pour 1 de taille quand le prix bouge de 1, en {0}.", [currency])}>
                    <NumberInput nullable value={pointValue} onChange={(v) => setOpen({ pointValue: v })} min={0} />
                  </Field>
                )}
                <Field label={tl("Qualité")} term="qualite">
                  <Choice
                    value={o.quality}
                    onChange={(q) => setOpen({ quality: o.quality === q ? null : q })}
                    options={[
                      { id: "A", label: "A" },
                      { id: "B", label: "B" },
                      { id: "C", label: "C" },
                    ]}
                  />
                </Field>
                <Field label={tl("Date et heure d'entrée")}>
                  <input type="datetime-local" value={o.openedAt} onChange={(e) => setOpen({ openedAt: e.target.value })} />
                </Field>
                {!beginner && (
                  <>
                    <Field label={tl("Objectif")} term="objectif">
                      <NumberInput nullable value={o.target} onChange={(target) => setOpen({ target })} min={0} />
                    </Field>
                    <Field label={tl("Entrée prévue")} hint={tl("Le prix du déclencheur, pour mesurer ton écart à l'entrée.")}>
                      <NumberInput nullable value={o.plannedEntry} onChange={(plannedEntry) => setOpen({ plannedEntry })} min={0} />
                    </Field>
                    <Field label={tl("Unité de temps")} term="unite-de-temps">
                      <input list="journal-timeframes" value={o.timeframe} maxLength={20} placeholder="1h" onChange={(e) => setOpen({ timeframe: e.target.value })} />
                      <datalist id="journal-timeframes">
                        {INTERVALS.map((i) => (
                          <option key={i} value={i} />
                        ))}
                      </datalist>
                    </Field>
                    <Field label={tl("Annonce économique proche")} term="annonces-economiques">
                      <input value={o.announcement} maxLength={200} placeholder={tl("NFP à 14h30")} onChange={(e) => setOpen({ announcement: e.target.value })} />
                    </Field>
                  </>
                )}
              </div>
              {!beginner && (
                <Field label={tl("Contexte")}>
                  <textarea rows={2} maxLength={500} value={o.context} placeholder={tl("Tendance de fond, niveau clé, ce qui t'a fait entrer.")} onChange={(e) => setOpen({ context: e.target.value })} />
                </Field>
              )}
              <Field label={tl("Lien vers une capture de l'entrée")} hint={tl("TradingView, une image en ligne… Le journal garde le lien, pas l'image.")}>
                <input type="url" value={o.captureUrl} maxLength={500} placeholder="https://www.tradingview.com/x/…" onChange={(e) => setOpen({ captureUrl: e.target.value })} />
              </Field>

              {risk !== null && account && (
                <div className="rounded-md border border-line bg-panel-2/60 px-3 py-2 text-sm">
                  <span className="font-medium">
                    1R = {amount(risk, currency)}
                    {riskPct !== null && <span className="text-muted"> · {tl("{0} du capital", [pct(riskPct, 2, false)])}</span>}
                  </span>
                  <Help id="r" />
                  {toTarget !== null && <span className="text-muted"> · {tl("objectif à {0}", [r(toTarget, 1)])}</span>}
                </div>
              )}
              {shape && <Alert tone="warn">{tl(shape)}</Alert>}
              {tooMuch && (
                <Alert tone="warn">
                  {tl("Ce trade risque {0} du capital, ton plan prévoit {1} par trade. Réduis la taille, ou enregistre-le en connaissance de cause.", [
                    pct(riskPct, 2, false),
                    pct(planRisk, 2, false),
                  ])}
                </Alert>
              )}
              {ruleBreaks.length > 0 && (
                <Alert tone="warn">
                  {tl("Hors des règles de ton plan :")}
                  <ul className="mt-1 list-disc pl-5">
                    {ruleBreaks.map((x) => (
                      <li key={x}>{tl(PLAN_CHECK_LABELS[x])}</li>
                    ))}
                  </ul>
                </Alert>
              )}
              {fields && !shape && account && checks.length === 0 && <p className="text-xs text-up">✓ {tl("Conforme aux règles de ton plan.")}</p>}
            </section>
          ) : (
            <section className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-panel-2/60 px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{o.market}</span> · {o.side === "long" ? tl("Achat") : tl("Vente")} · {tl("entrée {0}, stop {1}", [o.entry !== null ? price(o.entry) : "—", o.stop !== null ? price(o.stop) : "—"])}
                {risk !== null && <span className="text-muted"> · 1R = {amount(risk, currency)}</span>}
              </span>
              <button onClick={() => setShowOpen(true)} className="text-xs text-accent hover:underline">
                {tl("Modifier l'entrée")}
              </button>
            </section>
          )}

          {mode !== "close" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={withClose} onChange={(e) => setWithClose(e.target.checked)} />
              {!trade ? tl("Le trade est déjà terminé : noter aussi la sortie") : trade.close ? tl("Trade clôturé (décoche pour le rouvrir)") : tl("Clôturer le trade")}
            </label>
          )}

          {withClose && (
            <section className="flex flex-col gap-3 border-t border-line pt-4">
              <h3 className="text-sm font-semibold">{tl("Sortie")}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={tl("Prix de sortie")}>
                  <NumberInput nullable value={c.exit} onChange={(exit) => setClose({ exit })} min={0} />
                </Field>
                <Field label={tl("Date et heure de sortie")}>
                  <input type="datetime-local" value={c.closedAt} onChange={(e) => setClose({ closedAt: e.target.value })} />
                </Field>
                <Field label={tl("Raison de la sortie")}>
                  <select value={c.exitReason} onChange={(e) => setClose({ exitReason: e.target.value as ExitReason })}>
                    {c.exitReason === "" && <option value="">{tl("Choisir…")}</option>}
                    {EXIT_REASONS.map((x) => (
                      <option key={x} value={x}>
                        {tl(EXIT_REASON_LABELS[x])}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={tl("Frais (commission, swap), en {0}", [currency])} term="frais">
                  <NumberInput nullable value={c.fees} onChange={(fees) => setClose({ fees })} min={0} placeholder="0" />
                </Field>
                {!beginner && (
                  <>
                    <Field label={tl("Pire moment (MAE), en R")} term="mae-mfe" hint={tl("−0,6 si le prix est allé à 0,6R contre toi.")}>
                      <NumberInput nullable value={c.maeR} onChange={(maeR) => setClose({ maeR })} step={0.1} />
                    </Field>
                    <Field label={tl("Meilleur moment (MFE), en R")} hint={tl("2,4 si le prix est allé jusqu'à 2,4R en ta faveur.")}>
                      <NumberInput nullable value={c.mfeR} onChange={(mfeR) => setClose({ mfeR })} step={0.1} />
                    </Field>
                  </>
                )}
              </div>
              <div className="flex flex-col gap-2 rounded-md border border-line p-3">
                <h4 className="text-sm font-semibold">
                  {tl("Respect du plan")}
                  <Help id="respect-du-plan" />
                </h4>
                {QUESTIONS.map(([key, question]) => (
                  <div key={key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1">{tl(question)}</span>
                    <div className="w-36">
                      <Choice
                        value={answers[key] === null ? null : answers[key] ? "yes" : "no"}
                        onChange={(v) => setAnswers({ ...answers, [key]: v === "yes" })}
                        options={[
                          { id: "yes", label: tl("Oui"), tone: "border-up bg-up/15 text-up" },
                          { id: "no", label: tl("Non"), tone: "border-down bg-down/15 text-down" },
                        ]}
                      />
                    </div>
                  </div>
                ))}
                {checks.length > 0 && <p className="text-xs text-down">{tl("Règles du plan non respectées : {0}.", [checks.map((x) => tl(PLAN_CHECK_LABELS[x])).join(", ")])}</p>}
                <p className={`text-sm font-medium ${status === true ? "text-up" : status === false ? "text-down" : "text-muted"}`}>
                  {status === true ? tl("Dans le plan.") : status === false ? tl("Hors plan.") : tl("Réponds aux trois questions pour classer le trade.")}
                </p>
                {status === false && (
                  <div className="flex flex-col gap-1.5 border-t border-line pt-2">
                    <h4 className="text-sm font-semibold">
                      {tl("Registre des erreurs")}
                      <Help id="registre-des-erreurs" />
                    </h4>
                    <p className="text-xs text-muted">
                      {tl("Coche ce qui s'est passé. Le coût est en R : le résultat réel moins ce qu'aurait donné le plan. Une erreur qui gagne coûte un R positif.")}
                    </p>
                    {ERROR_CODES.map((code) => {
                      const picked = errors.find((e) => e.code === code);
                      return (
                        <div key={code} className="flex flex-wrap items-center gap-2 text-sm">
                          <label className="flex min-w-0 flex-1 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={Boolean(picked)}
                              onChange={(e) =>
                                setErrors(
                                  e.target.checked ? [...errors, { code, costR: proposedCost(code, result?.r ?? null, riskRatio) }] : errors.filter((x) => x.code !== code),
                                )
                              }
                            />
                            <span className="font-mono text-xs text-muted">{code}</span>
                            {tl(ERROR_LABELS[code])}
                            {suggested.includes(code) && <span className="rounded bg-warn/15 px-1 text-[10px] text-warn">{tl("proposé")}</span>}
                          </label>
                          {picked && (
                            <NumberInput
                              nullable
                              value={picked.costR}
                              onChange={(v) => setErrors(errors.map((x) => (x.code === code ? { ...x, costR: v } : x)))}
                              step={0.1}
                              className="w-24"
                              aria-label={tl("Coût en R")}
                              placeholder={tl("coût en R")}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <Field label={tl("Ce que tu retiens, en une phrase")}>
                <input value={c.comment} maxLength={280} placeholder={tl("Bonne entrée, sortie trop tôt par peur de rendre le gain.")} onChange={(e) => setClose({ comment: e.target.value })} />
              </Field>
              <Field label={tl("Lien vers une capture de la sortie")}>
                <input type="url" value={c.captureUrl} maxLength={500} placeholder="https://…" onChange={(e) => setClose({ captureUrl: e.target.value })} />
              </Field>
              {result && (
                <div className="rounded-md border border-line bg-panel-2/60 px-3 py-2 text-sm">
                  {rich(tl("Résultat : {0}"), [
                    <span key="r" className={`num font-semibold ${tone(result.r)}`}>
                      {r(result.r)}
                    </span>,
                  ])}
                  <span className={`num ${tone(result.amount)}`}> · {amount(result.amount, currency, true)}</span>
                  {c.fees ? <span className="text-muted"> · {tl("frais déduits : {0}", [num(c.fees)])}</span> : null}
                </div>
              )}
            </section>
          )}

          {error && <Alert tone="error">{error}</Alert>}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button onClick={save} disabled={busy}>
            {tooMuch && showOpen ? tl("Enregistrer quand même") : withClose && mode === "close" ? tl("Clôturer") : tl("Enregistrer")}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {tl("Annuler")}
          </Button>
          {trade && (
            <button onClick={remove} disabled={busy} className="ml-auto text-xs text-muted hover:text-down">
              {tl("Supprimer le trade")}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
