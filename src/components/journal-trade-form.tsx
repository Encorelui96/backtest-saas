"use client";

import { useEffect, useState } from "react";
import { rich, useT } from "@/lib/client/i18n";
import { api } from "@/lib/client/api";
import { date, num, pct, price, r, tone } from "@/lib/client/format";
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
  sizeForRisk,
  sizeStep,
  sizeUnit,
  stopFromTicks,
  suggestedErrors,
  targetR,
  tickOf,
  ticksBetween,
  VERDICT_LABELS,
  type ChartAnalysis,
  type ExitReason,
  type JournalTrade,
  type OpenFields,
  type PlanAnswers,
  type Quality,
  type Side,
  type TradeError,
} from "@/lib/journal";
import { captureDraft, guessExitReason, plannedStop, reachedTarget, type CaptureResult } from "@/lib/journal-capture";
import { FieldHelp, Help, useBeginner } from "./learn";
import { NumberInput } from "./number-input";
import { Alert, Button, Field } from "./ui";
import { Choice, amount, fromLocalInput, otherTrades, toLocalInput, type CaptureQuota, type JournalData } from "./journal-shared";
import { CaptureButton, CaptureImport, OffsetSelect, savedOffset } from "./journal-capture";
import { ImageStrip, type PendingImage } from "./journal-images";

/** How the trader likes to give the stop and the size, remembered in this browser. */
const MODES_KEY = "backtest-lab:journal-entry-modes";

function savedModes(): { stop: "price" | "ticks"; size: "size" | "risk" } {
  try {
    const m = JSON.parse(localStorage.getItem(MODES_KEY) ?? "{}") as { stop?: string; size?: string };
    return { stop: m.stop === "ticks" ? "ticks" : "price", size: m.size === "risk" ? "risk" : "size" };
  } catch {
    return { stop: "price", size: "size" };
  }
}

function saveModes(m: { stop: "price" | "ticks"; size: "size" | "risk" }) {
  try {
    localStorage.setItem(MODES_KEY, JSON.stringify(m));
  } catch {
    // Private browsing: the choice lasts for this form only.
  }
}

const VERDICT_TONES: Record<ChartAnalysis["verdict"], string> = {
  respected: "border-up/40 bg-up/10 text-up",
  partly: "border-warn/40 bg-warn/10 text-warn",
  not: "border-down/40 bg-down/10 text-down",
  unclear: "border-line bg-panel-2/60 text-muted",
};

/** The setup field's two choices that aren't setups. */
const OFF_PLAN = "__off";
const NO_SETUP = "__none";

/** What can break the plan, besides the rules the app checks (J4.1 in the book): ticked when the trader answers "no". */
const BREAKS: [keyof PlanAnswers, string][] = [
  ["setup", "Configuration incomplète"],
  ["entry", "Entrée avant le déclencheur ou en rattrapage"],
  ["exit", "Gestion ou sortie hors du plan"],
];

const POPULAR = ["BTCUSDT", "ETHUSDT", "SOLUSDT", ...MARKETS.map((m) => m.symbol)];

interface Draft {
  accountId: string;
  setup: string;
  market: string;
  side: Side;
  quality: Quality | null;
  openedAt: string;
  entry: number | null;
  stop: number | null;
  /** The stop given in price, or in ticks (pips) from the entry. */
  stopMode: "price" | "ticks";
  stopTicks: number | null;
  /** No stop on this trade: 1R is the planned risk. */
  noStop: boolean;
  size: number | null;
  /** The size given directly, or worked out from the amount risked. */
  sizeMode: "size" | "risk";
  riskAmount: number | null;
  notes: string;
  /** null: the market's usual value (defaultPointValue), when it has one. */
  pointValue: number | null;
  target: number | null;
  timeframe: string;
  context: string;
  plannedEntry: number | null;
  announcement: string;
  captureUrl: string;
  ticket: string | null;
  /** Empty while the trade is still open. */
  exit: number | null;
  closedAt: string;
  /** "": proposed from the result (guessExitReason). */
  exitReason: ExitReason | "";
  fees: number | null;
  comment: string;
  exitCaptureUrl: string;
  maeR: number | null;
  mfeR: number | null;
}

export type TradeFormMode = "open" | "close" | "edit";

function draftOf(t: JournalTrade | null, data: JournalData, accountId: string, now: number): Draft {
  const c = t?.close;
  if (t) {
    return {
      accountId: t.accountId,
      setup: t.setupId ?? (t.offPlan ? OFF_PLAN : NO_SETUP),
      market: t.market,
      side: t.side,
      quality: t.quality,
      openedAt: toLocalInput(t.openedAt),
      entry: t.entry,
      stop: t.noStop ? null : t.stop,
      stopMode: "price",
      stopTicks: null,
      noStop: t.noStop,
      size: t.size,
      sizeMode: "size",
      riskAmount: null,
      notes: t.notes ?? "",
      pointValue: t.pointValue,
      target: t.target,
      timeframe: t.timeframe ?? "",
      context: t.context ?? "",
      plannedEntry: t.plannedEntry,
      announcement: t.announcement ?? "",
      captureUrl: t.captureUrl ?? "",
      ticket: t.ticket,
      exit: c?.exit ?? null,
      closedAt: toLocalInput(c?.closedAt ?? now),
      exitReason: c?.exitReason ?? "",
      fees: c?.fees ?? null,
      comment: c?.comment ?? "",
      exitCaptureUrl: c?.captureUrl ?? "",
      maeR: c?.maeR ?? null,
      mfeR: c?.mfeR ?? null,
    };
  }
  const hasSetups = data.setups.some((s) => !s.archived);
  const modes = savedModes();
  return {
    accountId,
    setup: hasSetups ? "" : NO_SETUP,
    market: data.trades[0]?.market ?? "",
    side: "long",
    quality: null,
    openedAt: toLocalInput(now),
    entry: null,
    stop: null,
    stopMode: modes.stop,
    stopTicks: null,
    noStop: false,
    size: null,
    sizeMode: modes.size,
    riskAmount: null,
    notes: "",
    pointValue: null,
    target: null,
    timeframe: "",
    context: "",
    plannedEntry: null,
    announcement: "",
    captureUrl: "",
    ticket: null,
    exit: null,
    closedAt: toLocalInput(now),
    exitReason: "",
    fees: null,
    comment: "",
    exitCaptureUrl: "",
    maeR: null,
    mfeR: null,
  };
}

/** "Plan followed?" from the saved answers: yes when all three are yes, no with what broke. */
function followedOf(a: PlanAnswers): { followed: boolean | null; broke: (keyof PlanAnswers)[] } {
  const broke = BREAKS.map(([k]) => k).filter((k) => a[k] === false);
  if (broke.length) return { followed: false, broke };
  return { followed: a.setup && a.entry && a.exit ? true : null, broke: [] };
}

/** Two small choices side by side: how a field is given. */
function Modes<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <span className="inline-flex rounded border border-line p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => value !== o.id && onChange(o.id)}
          className={`rounded px-1.5 py-0.5 ${value === o.id ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/**
 * One screen for a trade: a screenshot fills it, or five fields (market, side, entry, stop, size);
 * the exit when there is one; "plan followed?" in one tap. The rest waits under "More details".
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
  const [d, setD] = useState<Draft>(() => draftOf(trade, data, accountId, now));
  const [plan, setPlan] = useState(() => followedOf(trade?.planAnswers ?? NO_ANSWERS));
  const [errors, setErrors] = useState<TradeError[]>(trade?.errors ?? []);
  const [details, setDetails] = useState(false);
  const [captured, setCaptured] = useState<CaptureResult | null>(null);
  const [quota, setQuota] = useState<CaptureQuota>(data.plan.captures);
  const [offset, setOffset] = useState(savedOffset);
  const [keptImages, setKeptImages] = useState<string[]>(trade?.images ?? []);
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [images, setImages] = useState(data.plan.images);
  const [analysis, setAnalysis] = useState<ChartAnalysis | null>(trade?.analysis ?? null);
  const [analysing, setAnalysing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const accounts = data.accounts.filter((a) => !a.archived || a.id === d.accountId);
  const account = data.accounts.find((a) => a.id === d.accountId);
  const currency = account?.currency ?? "USD";
  const setups = data.setups.filter((s) => !s.archived || s.id === d.setup);
  const usualPointValue = defaultPointValue(d.market);
  const pointValue = d.pointValue ?? usualPointValue;
  const showPointValue = usualPointValue === null || !beginner || (d.pointValue !== null && d.pointValue !== usualPointValue);
  const unit = sizeUnit(d.market);
  const tick = tickOf(d.market);
  const markets = [...new Set([...data.trades.map((t) => t.market), ...POPULAR])];

  // The capital before this trade: the start plus the account's other closed trades.
  const others = data.trades.filter((t) => t.accountId === d.accountId && t.id !== trade?.id);
  const capital = account ? balance(account.capital, others.map((t) => closedResult(t, currency)?.amount ?? 0)) : 0;
  const planRisk = account?.riskPct ?? null;
  const plannedRisk = planRisk !== null ? (capital * planRisk) / 100 : null;
  // The stop given in ticks (or pips) becomes a price; the size given as an amount risked becomes lots or contracts,
  // rounded down so the real risk stays under the amount.
  const inTicks = d.stopMode === "ticks" && tick !== null;
  const givenStop = inTicks ? (d.entry !== null && d.stopTicks ? stopFromTicks(d.side, d.entry, d.stopTicks, tick.size) : null) : d.stop;
  const byRisk = d.sizeMode === "risk" && !d.noStop;
  // Left empty, the amount risked is the plan's.
  const riskTarget = d.riskAmount ?? (plannedRisk ? Math.round(plannedRisk * 100) / 100 : null);
  const riskedSize =
    byRisk && d.entry !== null && givenStop !== null && pointValue !== null && riskTarget !== null ? sizeForRisk(riskTarget, d.entry, givenStop, pointValue, sizeStep(d.market)) : null;
  const size = byRisk ? (riskedSize ? riskedSize : null) : d.size;
  // Without a stop, 1R is the planned risk: the stop is put where it would cost exactly that. A trade saved that way keeps
  // its stop while its prices stay the same, so that editing it later doesn't move 1R with the capital.
  const keptStop =
    trade?.noStop && d.noStop && d.entry === trade.entry && size === trade.size && d.side === trade.side && pointValue === trade.pointValue ? trade.stop : null;
  const stop = d.noStop ? (keptStop ?? plannedStop(d.side, d.entry, size, pointValue, plannedRisk)) : givenStop;

  const openedAt = fromLocalInput(d.openedAt) ?? now;
  const fields: OpenFields | null =
    d.entry !== null && stop !== null && size !== null && pointValue !== null ? { side: d.side, entry: d.entry, stop, size, pointValue, target: d.target, openedAt } : null;
  const shape = fields && openProblem(fields);
  const risk = fields && !shape ? riskAmount(fields) : null;
  const riskPct = risk !== null ? riskPercent(risk, capital) : null;
  // A tenth of margin: 1.04 % for a 1 % plan is rounding, not a broken rule.
  const tooMuch = !d.noStop && planRisk !== null && riskPct !== null && riskPct > planRisk * 1.1;
  const toTarget = fields && !shape ? targetR(fields) : null;

  const closed = d.exit !== null || mode === "close";
  const exitFields = d.exit !== null ? { exit: d.exit, closedAt: fromLocalInput(d.closedAt) ?? now, fees: d.fees ?? 0 } : null;
  const result = fields && !shape && exitFields ? { r: resultR(fields, exitFields), amount: resultAmount(fields, exitFields) } : null;
  const exitReason: ExitReason = d.exitReason || guessExitReason(result?.r ?? null, d.noStop, reachedTarget(d.side, d.exit, d.target));

  // The plan's rules, checked live as the server will check them on saving.
  const setupId = d.setup && d.setup !== OFF_PLAN && d.setup !== NO_SETUP ? d.setup : null;
  const checks =
    account && fields && !shape ? planChecks({ openedAt, setupId, riskPct, noStop: d.noStop }, account, otherTrades(data, d.accountId, trade?.id ?? null, currency)) : [];
  const ruleBreaks = checks.filter((x) => x !== "risk");
  const answers: PlanAnswers =
    plan.followed === null ? NO_ANSWERS : { setup: !plan.broke.includes("setup"), entry: !plan.broke.includes("entry"), exit: !plan.broke.includes("exit") };
  const status = planStatus(checks, closed ? answers : NO_ANSWERS);
  const suggested = suggestedErrors(checks, answers);
  const riskRatio = riskPct !== null && planRisk ? riskPct / planRisk : null;

  /** A screenshot read: one trade fills the form, several open the import list. */
  const fill = (res: CaptureResult, q: CaptureQuota) => {
    setQuota(q);
    setError(null);
    if (res.trades.length === 0) {
      setError(res.notes || tl("Aucun trade clôturé trouvé sur cette capture."));
      return;
    }
    if (res.trades.length > 1 || !account) {
      setCaptured(res);
      return;
    }
    const c = captureDraft(res.trades[0], account.timeZone, offset);
    setCaptured(res);
    set({
      market: c.market,
      side: c.side,
      size: c.size,
      entry: c.entry,
      stop: c.stop,
      stopMode: "price",
      noStop: false,
      sizeMode: "size",
      pointValue: c.pointValue,
      target: c.target ?? d.target,
      exit: c.exit,
      fees: c.fees || null,
      ticket: c.ticket,
      openedAt: c.openedAt !== null ? toLocalInput(c.openedAt) : d.openedAt,
      closedAt: c.closedAt !== null ? toLocalInput(c.closedAt) : d.closedAt,
      exitReason: "",
    });
  };

  /** The platform's clock moved: the times read are moved with it. */
  const shift = (n: number) => {
    setOffset(n);
    if (!captured || captured.trades.length !== 1 || !account) return;
    const c = captureDraft(captured.trades[0], account.timeZone, n);
    set({ ...(c.openedAt !== null && { openedAt: toLocalInput(c.openedAt) }), ...(c.closedAt !== null && { closedAt: toLocalInput(c.closedAt) }) });
  };

  const save = async () => {
    setError(null);
    if (!d.accountId) return setError(tl("Choisis le compte du trade."));
    if (!d.market.trim()) return setError(tl("Indique le marché."));
    if (!d.setup) return setError(tl("Choisis la configuration du trade, ou « Hors plan »."));
    if (fromLocalInput(d.openedAt) === null) return setError(tl("Indique la date et l'heure d'entrée."));
    if (d.entry === null) return setError(tl("Indique le prix d'entrée."));
    if (pointValue === null) return setError(tl("Indique la valeur du point pour ce marché."));
    if (!d.noStop && givenStop === null) return setError(tl("Indique le stop, ou coche « Pas de stop »."));
    if (byRisk && riskTarget === null) return setError(tl("Indique le montant que tu risques."));
    if (byRisk && riskedSize === 0) return setError(tl("Avec ce risque, même la plus petite taille le dépasse : augmente le risque ou rapproche le stop."));
    if (size === null) return setError(tl("Indique la taille de la position."));
    if (stop === null) return setError(tl("Sans stop, il faut le risque par trade du compte pour mesurer 1R."));
    if (shape) return setError(tl(shape));
    for (const link of [d.captureUrl, d.exitCaptureUrl]) if (link.trim() && !isWebLink(link.trim())) return setError(tl("Le lien de capture doit être une adresse web (https://…)."));
    if (mode === "close" && d.exit === null) return setError(tl("Indique le prix de sortie."));
    let close = null;
    if (d.exit !== null) {
      const closedAt = fromLocalInput(d.closedAt);
      if (closedAt === null) return setError(tl("Indique la date et l'heure de sortie."));
      const problem = closeProblem(fields!, { exit: d.exit, closedAt, fees: d.fees ?? 0 });
      if (problem) return setError(tl(problem));
      if (plan.followed === false && plan.broke.length === 0 && checks.length === 0) return setError(tl("Dis ce qui n'a pas suivi le plan."));
      close = {
        closedAt,
        exit: d.exit,
        exitReason,
        fees: d.fees ?? 0,
        comment: d.comment.trim() || null,
        captureUrl: d.exitCaptureUrl.trim() || null,
        maeR: d.maeR,
        mfeR: d.mfeR,
      };
    }
    const body = {
      accountId: d.accountId,
      setupId,
      offPlan: d.setup === OFF_PLAN,
      market: d.market.trim().toUpperCase(),
      side: d.side,
      quality: d.quality,
      openedAt: fromLocalInput(d.openedAt),
      entry: d.entry,
      stop,
      size,
      pointValue,
      target: d.target,
      timeframe: d.timeframe.trim() || null,
      context: d.context.trim() || null,
      plannedEntry: d.plannedEntry,
      announcement: d.announcement.trim() || null,
      captureUrl: d.captureUrl.trim() || null,
      noStop: d.noStop,
      ticket: d.ticket,
      notes: d.notes.trim() || null,
      analysis,
      close,
      planAnswers: close ? answers : NO_ANSWERS,
      // The register is for trades out of the plan.
      errors: close && status === false ? errors : [],
    };
    setBusy(true);
    try {
      const saved = await api<JournalTrade>(trade ? `/api/journal/trades/${trade.id}` : "/api/journal/trades", { method: trade ? "PUT" : "POST", json: body });
      // The charts chosen go with the trade once it exists.
      for (const p of pending) {
        await api("/api/journal/images", { json: { image: p.data, tradeId: saved.id } });
        setPending((list) => list.filter((x) => x.key !== p.key));
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const removeImage = async (id: string) => {
    if (!confirm(tl("Supprimer ce graphique du journal ? C'est définitif."))) return;
    try {
      const res = await api<{ images: { used: number; limit: number } }>(`/api/journal/images/${id}`, { method: "DELETE" });
      setKeptImages((list) => list.filter((x) => x !== id));
      setImages(res.images);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  /** The AI's reading of one chart against the setup: kept with the trade when it is saved. */
  const analyse = async (image: { id?: string; pending?: PendingImage }) => {
    setError(null);
    setAnalysing(true);
    try {
      const res = await api<{ analysis: ChartAnalysis; captures: CaptureQuota }>("/api/journal/analysis", {
        json: {
          ...(image.id ? { imageId: image.id } : { image: image.pending!.data }),
          setupId,
          trade: { market: d.market.trim() || "?", side: d.side, entry: d.entry, stop: d.noStop ? null : stop, noStop: d.noStop, target: d.target, exit: d.exit, r: result?.r ?? null, checks },
        },
      });
      setAnalysis(res.analysis);
      setQuota(res.captures);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalysing(false);
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
  const several = captured !== null && captured.trades.length > 1 && account !== undefined;

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
          {accounts.length > 1 && (
            <Field label={tl("Compte")}>
              <select value={d.accountId} onChange={(e) => set({ accountId: e.target.value })} disabled={busy}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {!trade && <CaptureButton quota={quota} onRead={fill} disabled={busy} />}

          {several && captured && account ? (
            <CaptureImport data={data} result={captured} account={account} offset={offset} onOffset={setOffset} onDone={onDone} onCancel={() => setCaptured(null)} />
          ) : (
            <>
              {captured && account && (
                <div className="flex flex-col gap-1 rounded-md border border-line bg-panel-2/60 px-3 py-2 text-xs">
                  <span className="text-fg">
                    {tl("Rempli depuis la capture : vérifie les chiffres. La plateforme montre le dernier stop : remets celui du départ s'il a bougé, ou ajoute-le s'il n'y est pas.")}
                  </span>
                  {captured.notes && <span className="text-muted">{captured.notes}</span>}
                  <OffsetSelect value={offset} onChange={shift} timeZone={account.timeZone} />
                </div>
              )}

              <section className="grid gap-3 sm:grid-cols-2">
                <Field label={tl("Marché")} term="symbole">
                  <input list="journal-markets" value={d.market} maxLength={40} placeholder="EURUSD, BTCUSDT, NAS100…" onChange={(e) => set({ market: e.target.value })} />
                  <datalist id="journal-markets">
                    {markets.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </Field>
                <Field label={tl("Sens")}>
                  <Choice
                    value={d.side}
                    onChange={(side) => set({ side })}
                    options={[
                      { id: "long", label: tl("Achat"), tone: "border-up bg-up/15 text-up" },
                      { id: "short", label: tl("Vente"), tone: "border-down bg-down/15 text-down" },
                    ]}
                  />
                </Field>
                <Field label={tl("Prix d'entrée")}>
                  <NumberInput nullable value={d.entry} onChange={(entry) => set({ entry })} min={0} />
                </Field>
                <Field label={tl("Stop initial")} term="stop">
                  {d.noStop ? (
                    <span className="rounded-md border border-line bg-panel-2/60 px-3 py-1.5 text-sm text-muted">{tl("Pas de stop")}</span>
                  ) : inTicks ? (
                    <span className="flex items-center gap-2">
                      <NumberInput nullable value={d.stopTicks} onChange={(v) => set({ stopTicks: v })} min={0} className="min-w-0 flex-1" aria-label={tl("Stop en {0}", [tl(tick.unit)])} />
                      <span className="text-sm text-muted">{tl(tick.unit)}</span>
                    </span>
                  ) : (
                    <NumberInput nullable value={d.stop} onChange={(v) => set({ stop: v })} min={0} />
                  )}
                  {!d.noStop && tick && (
                    <span className="flex flex-wrap items-center gap-2 text-[11px]">
                      <Modes
                        value={d.stopMode}
                        options={[
                          { id: "price", label: tl("en prix") },
                          { id: "ticks", label: tl("en {0}", [tl(tick.unit)]) },
                        ]}
                        onChange={(stopMode) => {
                          // Keep the same stop when switching: its price becomes ticks and back.
                          const patch: Partial<Draft> = { stopMode };
                          if (stopMode === "ticks" && d.entry !== null && d.stop !== null) patch.stopTicks = ticksBetween(d.entry, d.stop, tick.size);
                          if (stopMode === "price" && givenStop !== null) patch.stop = givenStop;
                          set(patch);
                          saveModes({ stop: stopMode, size: d.sizeMode });
                        }}
                      />
                      {inTicks && givenStop !== null && <span className="text-muted">{tl("stop à {0}", [price(givenStop)])}</span>}
                      {!inTicks && d.entry !== null && d.stop !== null && d.stop !== d.entry && (
                        <span className="text-muted">{tl("soit {0} {1}", [num(ticksBetween(d.entry, d.stop, tick.size), 0), tl(tick.unit)])}</span>
                      )}
                    </span>
                  )}
                  <label className="flex items-center gap-1.5 text-[11px]">
                    <input type="checkbox" checked={d.noStop} onChange={(e) => set({ noStop: e.target.checked })} />
                    {tl("Pas de stop sur ce trade : 1R = le risque prévu par le plan")}
                  </label>
                </Field>
                <Field
                  label={
                    byRisk
                      ? tl("Risque en {0}", [currency])
                      : unit === "contracts"
                        ? tl("Taille (contrats)")
                        : unit === "lots"
                          ? tl("Taille (lots)")
                          : tl("Taille (quantité)")
                  }
                  term={byRisk ? "risque-par-trade" : "taille"}
                >
                  {byRisk ? (
                    <NumberInput
                      nullable
                      value={d.riskAmount}
                      onChange={(riskAmount) => set({ riskAmount })}
                      min={0}
                      placeholder={plannedRisk ? tl("{0} : le risque du plan", [num(plannedRisk, 0)]) : undefined}
                    />
                  ) : (
                    <NumberInput nullable value={d.size} onChange={(v) => set({ size: v })} min={0} step={sizeStep(d.market)} />
                  )}
                  {!d.noStop && (
                    <span className="flex flex-wrap items-center gap-2 text-[11px]">
                      <Modes
                        value={d.sizeMode}
                        options={[
                          { id: "size", label: tl("taille") },
                          { id: "risk", label: tl("risque en {0}", [currency]) },
                        ]}
                        onChange={(sizeMode) => {
                          const patch: Partial<Draft> = { sizeMode };
                          // The size found stays when going back; the risk starts empty, which means the plan's.
                          if (sizeMode === "size" && riskedSize) patch.size = riskedSize;
                          set(patch);
                          saveModes({ stop: d.stopMode, size: sizeMode });
                        }}
                      />
                      {byRisk && riskedSize !== null && riskedSize > 0 && (
                        <span className="text-fg">
                          → {num(riskedSize, sizeStep(d.market) >= 1 ? 0 : String(sizeStep(d.market)).split(".")[1]?.length ?? 2)}{" "}
                          {unit === "contracts" ? tl("contrats") : unit === "lots" ? tl("lots") : tl("unités")}
                        </span>
                      )}
                      {byRisk && riskedSize === 0 && <span className="text-warn">{tl("risque trop petit pour ce stop")}</span>}
                      {byRisk && pointValue === null && <span className="text-muted">{tl("indique la valeur du point")}</span>}
                    </span>
                  )}
                </Field>
                {showPointValue && (
                  <Field label={tl("Valeur du point")} term="valeur-du-point" hint={tl("Gain pour 1 de taille quand le prix bouge de 1, en {0}.", [currency])}>
                    <NumberInput nullable value={pointValue} onChange={(v) => set({ pointValue: v })} min={0} />
                  </Field>
                )}
              </section>

              {risk !== null && account && (
                <div className="rounded-md border border-line bg-panel-2/60 px-3 py-2 text-sm">
                  <span className="font-medium">
                    1R = {amount(risk, currency)}
                    {riskPct !== null && <span className="text-muted"> · {tl("{0} du capital", [pct(riskPct, 2, false)])}</span>}
                  </span>
                  <Help id="r" />
                  {d.noStop && <span className="text-muted"> · {tl("risque prévu, faute de stop")}</span>}
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

              <section className="grid gap-3 sm:grid-cols-2">
                <Field label={closed ? tl("Prix de sortie") : tl("Prix de sortie (vide : trade en cours)")}>
                  <NumberInput nullable value={d.exit} onChange={(exit) => set({ exit })} min={0} autoFocus={mode === "close"} />
                </Field>
                <Field label={tl("Frais (commission, swap), en {0}", [currency])} term="frais">
                  <NumberInput nullable value={d.fees} onChange={(fees) => set({ fees })} min={0} placeholder="0" />
                </Field>
              </section>
              {result && (
                <div className="rounded-md border border-line bg-panel-2/60 px-3 py-2 text-sm">
                  {rich(tl("Résultat : {0}"), [
                    <span key="r" className={`num font-semibold ${tone(result.r)}`}>
                      {r(result.r)}
                    </span>,
                  ])}
                  <span className={`num ${tone(result.amount)}`}> · {amount(result.amount, currency, true)}</span>
                  {d.fees ? <span className="text-muted"> · {tl("frais déduits : {0}", [num(d.fees)])}</span> : null}
                  <span className="text-muted"> · {tl(EXIT_REASON_LABELS[exitReason])}</span>
                </div>
              )}

              <Field label={tl("Configuration")} term="configuration">
                <select value={d.setup} onChange={(e) => set({ setup: e.target.value })}>
                  {d.setup === "" && <option value="">{tl("Choisir…")}</option>}
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

              {d.exit !== null && (
                <section className="flex flex-col gap-2 rounded-md border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {tl("Plan suivi ?")}
                      <Help id="respect-du-plan" />
                    </span>
                    <div className="w-40">
                      <Choice
                        value={plan.followed === null ? null : plan.followed ? "yes" : "no"}
                        onChange={(v) => setPlan({ followed: v === "yes", broke: v === "yes" ? [] : plan.broke })}
                        options={[
                          { id: "yes", label: tl("Oui"), tone: "border-up bg-up/15 text-up" },
                          { id: "no", label: tl("Non"), tone: "border-down bg-down/15 text-down" },
                        ]}
                      />
                    </div>
                  </div>
                  {plan.followed === false && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs text-muted">{tl("Qu'est-ce qui n'a pas suivi le plan ?")}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {BREAKS.map(([key, label]) => {
                          const on = plan.broke.includes(key);
                          return (
                            <button
                              key={key}
                              type="button"
                              aria-pressed={on}
                              onClick={() => setPlan({ followed: false, broke: on ? plan.broke.filter((k) => k !== key) : [...plan.broke, key] })}
                              className={`rounded-full border px-3 py-1 text-xs ${on ? "border-down bg-down/15 text-down" : "border-line text-muted hover:text-fg"}`}
                            >
                              {tl(label)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {checks.length > 0 && plan.followed === true && (
                    <p className="text-xs text-down">{tl("Règles du plan non respectées : {0}.", [checks.map((x) => tl(PLAN_CHECK_LABELS[x])).join(", ")])}</p>
                  )}
                  <p className={`text-sm font-medium ${status === true ? "text-up" : status === false ? "text-down" : "text-muted"}`}>
                    {status === true ? tl("Dans le plan.") : status === false ? tl("Hors plan.") : tl("Un tap pour classer le trade.")}
                  </p>
                  {status === false && (
                    <details className="border-t border-line pt-2" open={errors.length > 0}>
                      <summary className="cursor-pointer text-sm font-semibold">
                        {tl("Registre des erreurs")}
                        <Help id="registre-des-erreurs" />
                        {errors.length > 0 && <span className="ml-2 font-mono text-xs text-muted">{errors.map((e) => e.code).join(" ")}</span>}
                      </summary>
                      <p className="mt-1 text-xs text-muted">
                        {tl("Coche ce qui s'est passé. Le coût est en R : le résultat réel moins ce qu'aurait donné le plan. Une erreur qui gagne coûte un R positif.")}
                      </p>
                      <div className="mt-1.5 flex flex-col gap-1.5">
                        {[...ERROR_CODES].sort((a, b) => Number(suggested.includes(b)) - Number(suggested.includes(a))).map((code) => {
                          const picked = errors.find((e) => e.code === code);
                          return (
                            <div key={code} className="flex flex-wrap items-center gap-2 text-sm">
                              <label className="flex min-w-0 flex-1 items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={Boolean(picked)}
                                  onChange={(e) =>
                                    setErrors(e.target.checked ? [...errors, { code, costR: proposedCost(code, result?.r ?? null, riskRatio) }] : errors.filter((x) => x.code !== code))
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
                    </details>
                  )}
                </section>
              )}

              <Field label={tl("Notes")}>
                <textarea
                  rows={3}
                  maxLength={5000}
                  value={d.notes}
                  placeholder={tl("Ce que tu as vu, ce que tu as ressenti, ce que tu ferais autrement…")}
                  onChange={(e) => set({ notes: e.target.value })}
                />
              </Field>

              <section className="flex flex-col gap-2">
                <span className="text-xs text-muted">{tl("Graphiques du trade (facultatif)")}</span>
                <ImageStrip
                  kept={keptImages}
                  pending={pending}
                  quota={images}
                  busy={busy}
                  onPick={(list) => setPending((p) => [...p, ...list.map((data) => ({ key: crypto.randomUUID(), data }))])}
                  onRemoveKept={removeImage}
                  onRemovePending={(key) => setPending((p) => p.filter((x) => x.key !== key))}
                  actions={(image) => (
                    <button
                      type="button"
                      onClick={() => analyse(image)}
                      disabled={analysing || busy || (quota.limit !== null && quota.used >= quota.limit)}
                      className="text-left text-[11px] text-accent hover:underline disabled:text-muted disabled:no-underline"
                    >
                      {analysing ? tl("Analyse…") : tl("Analyser avec l'IA")}
                    </button>
                  )}
                />
                {analysis && (
                  <div className={`flex flex-col gap-1.5 rounded-md border px-3 py-2 text-sm ${VERDICT_TONES[analysis.verdict]}`}>
                    <span className="font-semibold">{tl(VERDICT_LABELS[analysis.verdict])}</span>
                    <span className="text-fg">{analysis.summary}</span>
                    <ul className="list-disc pl-5 text-fg/90">
                      {analysis.remarks.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                    <span className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
                      {tl("Analyse de l'IA, le {0} : un avis, pas une vérité.", [date(analysis.at)])}
                      <button type="button" onClick={() => setAnalysis(null)} className="hover:text-fg">
                        {tl("Retirer l'analyse")}
                      </button>
                    </span>
                  </div>
                )}
              </section>

              <section className="flex flex-col gap-3">
                <button type="button" onClick={() => setDetails(!details)} aria-expanded={details} className="flex items-center gap-1 self-start text-sm text-accent hover:underline">
                  {details ? "▾" : "▸"} {tl("Plus de détails")}
                  <span className="text-xs text-muted">
                    · {tl("entrée {0}", [date(openedAt)])}
                    {d.exit !== null && <> · {tl("sortie {0}", [date(fromLocalInput(d.closedAt) ?? now)])}</>}
                  </span>
                </button>
                {details && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={tl("Date et heure d'entrée")}>
                      <input type="datetime-local" value={d.openedAt} onChange={(e) => set({ openedAt: e.target.value })} />
                    </Field>
                    {d.exit !== null && (
                      <>
                        <Field label={tl("Date et heure de sortie")}>
                          <input type="datetime-local" value={d.closedAt} onChange={(e) => set({ closedAt: e.target.value })} />
                        </Field>
                        <Field label={tl("Raison de la sortie")}>
                          <select value={d.exitReason} onChange={(e) => set({ exitReason: e.target.value as ExitReason | "" })}>
                            <option value="">{tl("Proposée : {0}", [tl(EXIT_REASON_LABELS[exitReason])])}</option>
                            {EXIT_REASONS.map((x) => (
                              <option key={x} value={x}>
                                {tl(EXIT_REASON_LABELS[x])}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </>
                    )}
                    <Field label={tl("Qualité")} term="qualite">
                      <Choice
                        value={d.quality}
                        onChange={(q) => set({ quality: d.quality === q ? null : q })}
                        options={[
                          { id: "A", label: "A" },
                          { id: "B", label: "B" },
                          { id: "C", label: "C" },
                        ]}
                      />
                    </Field>
                    <Field label={tl("Objectif")} term="objectif">
                      <NumberInput nullable value={d.target} onChange={(target) => set({ target })} min={0} />
                    </Field>
                    <Field label={tl("Entrée prévue")} hint={tl("Le prix du déclencheur, pour mesurer ton écart à l'entrée.")}>
                      <NumberInput nullable value={d.plannedEntry} onChange={(plannedEntry) => set({ plannedEntry })} min={0} />
                    </Field>
                    <Field label={tl("Unité de temps")} term="unite-de-temps">
                      <input list="journal-timeframes" value={d.timeframe} maxLength={20} placeholder="1h" onChange={(e) => set({ timeframe: e.target.value })} />
                      <datalist id="journal-timeframes">
                        {INTERVALS.map((i) => (
                          <option key={i} value={i} />
                        ))}
                      </datalist>
                    </Field>
                    <Field label={tl("Annonce économique proche")} term="annonces-economiques">
                      <input value={d.announcement} maxLength={200} placeholder={tl("NFP à 14h30")} onChange={(e) => set({ announcement: e.target.value })} />
                    </Field>
                    {d.exit !== null && (
                      <>
                        <Field label={tl("Pire moment (MAE), en R")} term="mae-mfe" hint={tl("−0,6 si le prix est allé à 0,6R contre toi.")}>
                          <NumberInput nullable value={d.maeR} onChange={(maeR) => set({ maeR })} step={0.1} />
                        </Field>
                        <Field label={tl("Meilleur moment (MFE), en R")} hint={tl("2,4 si le prix est allé jusqu'à 2,4R en ta faveur.")}>
                          <NumberInput nullable value={d.mfeR} onChange={(mfeR) => set({ mfeR })} step={0.1} />
                        </Field>
                      </>
                    )}
                    <div className="sm:col-span-2">
                      <Field label={tl("Contexte")}>
                        <textarea rows={2} maxLength={500} value={d.context} placeholder={tl("Tendance de fond, niveau clé, ce qui t'a fait entrer.")} onChange={(e) => set({ context: e.target.value })} />
                      </Field>
                    </div>
                    {d.exit !== null && (
                      <div className="sm:col-span-2">
                        <Field label={tl("Ce que tu retiens, en une phrase")}>
                          <input value={d.comment} maxLength={280} placeholder={tl("Bonne entrée, sortie trop tôt par peur de rendre le gain.")} onChange={(e) => set({ comment: e.target.value })} />
                        </Field>
                      </div>
                    )}
                    <Field label={tl("Lien vers une capture de l'entrée")} hint={tl("TradingView, une image en ligne… Le journal garde le lien, pas l'image.")}>
                      <input type="url" value={d.captureUrl} maxLength={500} placeholder="https://www.tradingview.com/x/…" onChange={(e) => set({ captureUrl: e.target.value })} />
                    </Field>
                    {d.exit !== null && (
                      <Field label={tl("Lien vers une capture de la sortie")}>
                        <input type="url" value={d.exitCaptureUrl} maxLength={500} placeholder="https://…" onChange={(e) => set({ exitCaptureUrl: e.target.value })} />
                      </Field>
                    )}
                  </div>
                )}
              </section>

              {error && <Alert tone="error">{error}</Alert>}
            </>
          )}
        </div>

        {!several && (
          <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button onClick={save} disabled={busy}>
              {tooMuch ? tl("Enregistrer quand même") : mode === "close" ? tl("Clôturer") : tl("Enregistrer")}
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
        )}
      </div>
    </div>
  );
}
