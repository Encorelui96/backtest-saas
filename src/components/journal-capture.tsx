"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/client/i18n";
import { api } from "@/lib/client/api";
import { date, price, r, tone } from "@/lib/client/format";
import { NO_ANSWERS, balance, closedResult, resultAmount, resultR, type JournalAccount } from "@/lib/journal";
import { CAPTURE_MAX_SIDE, captureDraft, guessExitReason, plannedStop, reachedTarget, type CaptureDraft, type CaptureResult } from "@/lib/journal-capture";
import { NumberInput } from "./number-input";
import { Alert, Button } from "./ui";
import { SideBadge, amount, type CaptureQuota, type JournalData } from "./journal-shared";

/** The platform clock's lead over the account's time zone, remembered in this browser (MT5 servers often run 1 hour ahead of Paris). */
const OFFSET_KEY = "backtest-lab:journal-capture-offset";

export function savedOffset(): number {
  try {
    const n = Number(localStorage.getItem(OFFSET_KEY));
    return Number.isInteger(n) && Math.abs(n) <= 12 ? n : 0;
  } catch {
    return 0;
  }
}

export function saveOffset(n: number) {
  try {
    localStorage.setItem(OFFSET_KEY, String(n));
  } catch {
    // Private browsing: the choice lasts for this page only.
  }
}

/** The screenshot shrunk to what the AI reads, as JPEG: a phone screenshot goes from a few MB to about 200 KB. */
async function shrink(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, CAPTURE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.9));
  if (!blob) throw new Error("image");
  const url = await new Promise<string>((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result));
    reader.onerror = () => fail(reader.error);
    reader.readAsDataURL(blob);
  });
  return url.slice(url.indexOf(",") + 1);
}

/** "3 captures left this month", "unlimited captures". */
export function quotaLine(q: CaptureQuota, tl: ReturnType<typeof useT>) {
  if (q.limit === null) return tl("Captures illimitées avec ton offre.");
  const left = Math.max(0, q.limit - q.used);
  return left ? tl("{0} captures sur {1} restantes ce mois-ci.", [left, q.limit]) : tl("Plus de capture ce mois-ci : elles reviennent le {0:date}.", [q.resetsAt]);
}

/**
 * The "Read a screenshot" button. Also takes a pasted image (Ctrl+V) or one dropped on the form.
 * The image is shrunk in the browser, read by the AI and kept nowhere.
 */
export function CaptureButton({ quota, onRead, disabled }: { quota: CaptureQuota; onRead: (result: CaptureResult, quota: CaptureQuota) => void; disabled?: boolean }) {
  const tl = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spent = quota.limit !== null && quota.used >= quota.limit;

  const read = async (file: Blob) => {
    if (busy || spent) return;
    setError(null);
    setBusy(true);
    try {
      let image: string;
      try {
        image = await shrink(file);
      } catch {
        throw new Error(tl("Cette image ne s'ouvre pas. Essaie une capture d'écran en PNG ou JPEG."));
      }
      const res = await api<CaptureResult & { captures: CaptureQuota }>("/api/journal/capture", { json: { image, type: "image/jpeg" } });
      onRead({ trades: res.trades, notes: res.notes }, res.captures);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // A screenshot pasted anywhere while the form is open.
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        readRef.current(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border border-dashed border-accent/50 bg-accent/5 p-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
        if (file) read(file);
      }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button type="button" onClick={() => input.current?.click()} disabled={disabled || busy || spent}>
          {busy ? tl("Lecture de la capture…") : tl("📷 Remplir avec une capture")}
        </Button>
        <span className="text-xs text-muted">{tl("MetaTrader, cTrader… Le détail d'un trade ou l'historique. Tu peux aussi coller ou déposer l'image.")}</span>
      </div>
      <span className="text-[11px] text-muted">
        {quotaLine(quota, tl)} {tl("L'image est lue par l'IA puis oubliée : elle n'est gardée nulle part.")}
      </span>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) read(file);
        }}
      />
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

/** The platform clock's lead over the account's time zone, as the screenshot's times are read. */
export function OffsetSelect({ value, onChange, timeZone }: { value: number; onChange: (n: number) => void; timeZone: string }) {
  const tl = useT();
  return (
    <label className="flex flex-wrap items-center gap-2 text-xs text-muted">
      {tl("Heure de la plateforme :")}
      <select
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          saveOffset(n);
          onChange(n);
        }}
        className="text-xs"
      >
        {[-3, -2, -1, 0, 1, 2, 3].map((n) => (
          <option key={n} value={n}>
            {n === 0 ? tl("la même que {0}", [timeZone]) : n > 0 ? tl("{0} h d'avance sur {1}", [n, timeZone]) : tl("{0} h de retard sur {1}", [-n, timeZone])}
          </option>
        ))}
      </select>
    </label>
  );
}

interface Row {
  draft: CaptureDraft;
  take: boolean;
  /** The stop the trader adds; null: taken without a stop, 1R = the planned risk. */
  stop: number | null;
  /** Already in the journal under the same ticket. */
  known: boolean;
}

/**
 * Several trades read from a history screenshot: tick the ones to add, give a stop when you had one,
 * pick their setup, add them all. The rest (quality, comment…) can be filled in afterwards, trade by trade.
 */
export function CaptureImport({
  data,
  result,
  account,
  offset,
  onOffset,
  onDone,
  onCancel,
}: {
  data: JournalData;
  result: CaptureResult;
  account: JournalAccount;
  offset: number;
  onOffset: (n: number) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const tl = useT();
  const known = new Set(data.trades.filter((t) => t.accountId === account.id && t.ticket).map((t) => t.ticket));
  const build = (n: number): Row[] =>
    result.trades.map((t) => {
      const draft = captureDraft(t, account.timeZone, n);
      const dup = Boolean(draft.ticket && known.has(draft.ticket));
      return { draft, take: !dup && draft.entry !== null && draft.exit !== null && draft.size !== null && draft.closedAt !== null, stop: draft.stop, known: dup };
    });
  const [rows, setRows] = useState<Row[]>(() => build(offset));
  const [setup, setSetup] = useState(() => (data.setups.some((s) => !s.archived) ? "" : "__none"));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const setups = data.setups.filter((s) => !s.archived);
  const others = data.trades.filter((t) => t.accountId === account.id);
  const capital = balance(account.capital, others.map((t) => closedResult(t, account.currency)?.amount ?? 0));
  const plannedRisk = (capital * account.riskPct) / 100;

  const shift = (n: number) => {
    onOffset(n);
    // Re-read the times, keeping what was ticked and the stops typed.
    const fresh = build(n);
    setRows(rows.map((row, i) => ({ ...row, draft: { ...row.draft, openedAt: fresh[i].draft.openedAt, closedAt: fresh[i].draft.closedAt } })));
  };

  const priced = (row: Row) => {
    const d = row.draft;
    const stop = row.stop ?? plannedStop(d.side, d.entry, d.size, d.pointValue, plannedRisk);
    if (d.entry === null || d.exit === null || d.size === null || !d.pointValue || stop === null) return null;
    const t = { side: d.side, entry: d.entry, stop, size: d.size, pointValue: d.pointValue, openedAt: d.openedAt ?? 0 };
    const c = { exit: d.exit, closedAt: d.closedAt ?? 0, fees: d.fees };
    return { stop, r: resultR(t, c), amount: resultAmount(t, c) };
  };

  const picked = rows.filter((x) => x.take);
  const save = async () => {
    setError(null);
    if (!setup) return setError(tl("Choisis la configuration de ces trades, ou « Hors plan »."));
    setBusy(true);
    let n = 0;
    try {
      for (const row of picked) {
        const d = row.draft;
        const p = priced(row);
        if (!p) throw new Error(tl("Il manque un prix ou la taille sur {0} : décoche-le, ou ajoute-le à la main.", [d.market]));
        await api("/api/journal/trades", {
          json: {
            accountId: account.id,
            setupId: setup === "__off" || setup === "__none" ? null : setup,
            offPlan: setup === "__off",
            market: d.market.toUpperCase(),
            side: d.side,
            quality: null,
            openedAt: d.openedAt,
            entry: d.entry,
            stop: p.stop,
            size: d.size,
            pointValue: d.pointValue,
            target: d.target,
            timeframe: null,
            context: null,
            plannedEntry: null,
            announcement: null,
            captureUrl: null,
            noStop: row.stop === null,
            ticket: d.ticket,
            close: {
              closedAt: d.closedAt,
              exit: d.exit,
              exitReason: guessExitReason(p.r, row.stop === null, reachedTarget(d.side, d.exit, d.target)),
              fees: d.fees,
              comment: null,
              captureUrl: null,
              maeR: null,
              mfeR: null,
            },
            planAnswers: NO_ANSWERS,
            errors: [],
          },
        });
        n++;
        setDone(n);
      }
      onDone();
    } catch (e) {
      // The trades already added stay: untick them before trying again.
      setRows(rows.map((x) => (picked.indexOf(x) > -1 && picked.indexOf(x) < n ? { ...x, take: false, known: true } : x)));
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm">
        {tl("{0} trades lus sur la capture. Vérifie les chiffres, décoche ceux à laisser de côté, et ajoute le stop des trades qui en avaient un.", [rows.length])}
      </p>
      {result.notes && <p className="text-xs text-muted">{result.notes}</p>}
      <OffsetSelect value={offset} onChange={shift} timeZone={account.timeZone} />
      <ul className="flex flex-col divide-y divide-line/60 rounded-md border border-line">
        {rows.map((row, i) => {
          const d = row.draft;
          const p = priced(row);
          return (
            <li key={i} className={`flex flex-col gap-1.5 px-3 py-2 ${row.take ? "" : "opacity-60"}`}>
              <label className="flex flex-wrap items-center gap-2 text-sm">
                <input type="checkbox" checked={row.take} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, take: e.target.checked } : x)))} />
                <span className="font-medium">{d.market}</span>
                <SideBadge side={d.side} />
                <span className="num text-xs text-muted">
                  {d.size ?? "?"} · {d.entry !== null ? price(d.entry) : "?"} → {d.exit !== null ? price(d.exit) : "?"}
                </span>
                {row.known && <span className="rounded bg-warn/15 px-1 text-[10px] text-warn">{tl("déjà dans le journal")}</span>}
                {p && (
                  <span className="ml-auto flex items-baseline gap-2">
                    <span className={`num font-semibold ${tone(p.r)}`}>{r(p.r)}</span>
                    <span className={`num text-xs ${tone(p.amount)}`}>{amount(p.amount, account.currency, true)}</span>
                  </span>
                )}
              </label>
              <div className="flex flex-wrap items-center gap-2 pl-6 text-xs text-muted">
                <span>{d.closedAt !== null ? date(d.closedAt) : tl("heure illisible")}</span>
                <span className="flex items-center gap-1">
                  {tl("Stop")}
                  <NumberInput
                    nullable
                    value={row.stop}
                    onChange={(stop) => setRows(rows.map((x, j) => (j === i ? { ...x, stop } : x)))}
                    min={0}
                    className="w-28 text-xs"
                    placeholder={tl("pas de stop")}
                    aria-label={tl("Stop de {0}", [d.market])}
                  />
                </span>
                {row.stop === null && <span>{tl("1R = risque prévu ({0})", [amount(plannedRisk, account.currency)])}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      <label className="flex flex-col gap-1 text-xs text-muted">
        {tl("Configuration de ces trades")}
        <select value={setup} onChange={(e) => setSetup(e.target.value)}>
          {setup === "" && <option value="">{tl("Choisir…")}</option>}
          {setups.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {setups.length === 0 && <option value="__none">{tl("Sans configuration")}</option>}
          <option value="__off">{tl("Hors plan (aucune de mes configurations)")}</option>
        </select>
      </label>
      <p className="text-xs text-muted">{tl("Le respect du plan, la qualité et le commentaire se complètent ensuite, trade par trade, depuis la liste.")}</p>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={busy || picked.length === 0}>
          {busy ? tl("Ajout… {0} sur {1}", [done, picked.length]) : tl("Ajouter {0} trades", [picked.length])}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {tl("Annuler")}
        </Button>
      </div>
    </section>
  );
}
