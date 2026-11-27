"use client";

import { useMemo, useRef, useState } from "react";
import { useT } from "@/lib/client/i18n";
import { api } from "@/lib/client/api";
import { date, price, r, tone } from "@/lib/client/format";
import { IMPORT_ACCEPT, ImportFileError, readImportFile } from "@/lib/client/import-files";
import { NO_ANSWERS, balance, closeProblem, closedResult, openProblem, resultAmount, resultR } from "@/lib/journal";
import { guessExitReason, plannedStop, reachedTarget } from "@/lib/journal-capture";
import {
  FIELD_LABELS,
  IMPORT_BATCH,
  IMPORT_FIELDS,
  IMPORT_MAX_LINES,
  REQUIRED_FIELDS,
  draftsFrom,
  findTable,
  guessDateOrder,
  importKey,
  type ColumnMap,
  type DateOrder,
  type ImportDraft,
  type ImportField,
} from "@/lib/journal-import";
import { OffsetSelect, savedOffset } from "./journal-capture";
import { SideBadge, amount, type JournalData } from "./journal-shared";
import { NumberInput } from "./number-input";
import { Alert, Button, Field } from "./ui";

interface Loaded {
  name: string;
  kind: "csv" | "xlsx" | "html";
  header: string[];
  rows: string[][];
  headerRow: number;
  /** Looks like a MetaTrader report: its times are the server's, often ahead of the account's zone. */
  platform: boolean;
}

/** A line of the file, priced with the stop it will be filed with, or why it can't be. */
interface Checked {
  draft: ImportDraft;
  stop: number | null;
  status: "ok" | "known" | "problem";
  problems: string[];
  r: number | null;
  amount: number | null;
}

const PREVIEW = 30;

/**
 * Imports an outside journal into an account: a CSV or Excel table from any journal (its columns
 * matched once, found on their own for the usual names), a MetaTrader 4 / 5 history report, or the
 * export of another journal app. The file is read in the browser; only the trades kept are sent.
 */
export function ImportDialog({ data, accountId, onDone, onCancel }: { data: JournalData; accountId: string; onDone: () => void; onCancel: () => void }) {
  const tl = useT();
  const input = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [columns, setColumns] = useState<ColumnMap>({});
  const [accountChoice, setAccountChoice] = useState(accountId);
  const [setup, setSetup] = useState(() => (data.setups.some((s) => !s.archived) ? "" : "__none"));
  const [dateOrder, setDateOrder] = useState<DateOrder>("dmy");
  const [offset, setOffset] = useState(() => savedOffset());
  const [pointValue, setPointValue] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const accounts = data.accounts.filter((a) => !a.archived || a.id === accountId);
  const account = accounts.find((a) => a.id === accountChoice) ?? accounts[0];
  const setups = data.setups.filter((s) => !s.archived);
  const capital = balance(
    account.capital,
    data.trades.filter((t) => t.close && t.accountId === account.id).map((t) => closedResult(t, account.currency)!.amount),
  );
  const plannedRisk = (capital * account.riskPct) / 100;
  // Plain values for the memos below (the React compiler can't follow fields of an object found in a list).
  const timeZone = account.timeZone;
  const accountKey = account.id;

  const read = async (file: File) => {
    setError(null);
    setResult(null);
    setReading(true);
    try {
      const { rows, kind } = await readImportFile(file);
      const table = findTable(rows);
      if (!table) throw new ImportFileError("Aucun tableau de trades reconnu dans ce fichier : il faut au moins le marché, le sens, la date, les prix d'entrée et de sortie et la taille.");
      if (table.rows.length > IMPORT_MAX_LINES) throw new ImportFileError(`${IMPORT_MAX_LINES}+`);
      const names = table.header.map((h) => h.toLowerCase());
      // MetaTrader: "S / L" and "T / P" columns, or the report's title above the table.
      const platform = names.some((n) => n.replace(/\s/g, "") === "s/l") || rows.slice(0, table.headerRow).some((row) => row.some((c) => /trade history report|rapport d'historique|statement/i.test(c)));
      setLoaded({ name: file.name, kind, header: table.header, rows: table.rows, headerRow: table.headerRow, platform });
      setColumns(table.columns);
      const dates = table.columns.openedAt === undefined ? [] : table.rows.slice(0, 200).map((row) => row[table.columns.openedAt!] ?? "");
      setDateOrder(guessDateOrder(dates));
    } catch (e) {
      const msg = e instanceof ImportFileError ? (e.message === `${IMPORT_MAX_LINES}+` ? tl("Plus de {0} trades dans ce fichier : coupe-le en plusieurs fichiers.", [IMPORT_MAX_LINES]) : tl(e.message)) : tl("Ce fichier ne se lit pas. Essaie de l'enregistrer en CSV.");
      setError(msg);
    } finally {
      setReading(false);
    }
  };

  const missing = REQUIRED_FIELDS.filter((f) => columns[f] === undefined);
  const drafts = useMemo(
    () =>
      loaded && REQUIRED_FIELDS.every((f) => columns[f] !== undefined)
        ? draftsFrom(loaded.header, loaded.rows, columns, { timeZone, dateOrder, offsetHours: offset, pointValue }, loaded.headerRow + 2)
        : [],
    [loaded, columns, timeZone, dateOrder, offset, pointValue],
  );

  const known = useMemo(() => {
    const keys = new Set<string>();
    for (const t of data.trades) {
      if (t.accountId !== accountKey) continue;
      keys.add(importKey({ market: t.market, openedAt: t.openedAt, entry: t.entry, ticket: t.ticket }));
      keys.add(importKey({ market: t.market, openedAt: t.openedAt, entry: t.entry, ticket: null }));
    }
    return keys;
  }, [data.trades, accountKey]);

  const checked = useMemo<Checked[]>(() => {
    const inFile = new Set<string>();
    return drafts.map((d): Checked => {
      const problems = [...d.problems];
      const stop = d.stop ?? (d.side ? plannedStop(d.side, d.entry, d.size, d.pointValue, plannedRisk) : null);
      let rr: number | null = null;
      let amt: number | null = null;
      if (!problems.length) {
        if (stop === null) problems.push("risque du plan manquant pour un trade sans stop");
        else {
          const t = { side: d.side!, entry: d.entry!, stop, size: d.size!, pointValue: d.pointValue!, openedAt: d.openedAt!, target: d.target };
          // No exit: a trade still open, filed open.
          const c = d.exit === null ? null : { exit: d.exit, closedAt: d.closedAt ?? d.openedAt!, fees: d.fees };
          const problem = openProblem(t) ?? (c ? closeProblem(t, c) : null);
          if (problem) problems.push(problem);
          else if (c) {
            rr = resultR(t, c);
            amt = resultAmount(t, c);
          }
        }
      }
      const keys = [importKey({ ...d, market: d.market, ticket: d.ticket }), importKey({ ...d, ticket: null })];
      const dup = keys.some((k) => known.has(k) || inFile.has(k));
      keys.forEach((k) => inFile.add(k));
      return { draft: d, stop, problems, r: rr, amount: amt, status: problems.length ? "problem" : dup ? "known" : "ok" };
    });
  }, [drafts, plannedRisk, known]);

  const ready = checked.filter((c) => c.status === "ok");
  const knownCount = checked.filter((c) => c.status === "known").length;
  const broken = checked.filter((c) => c.status === "problem");
  const noPointValue = broken.some((c) => c.problems.includes("valeur du point inconnue"));

  const save = async () => {
    setError(null);
    if (!setup) return setError(tl("Choisis la configuration de ces trades, ou « Hors plan »."));
    setBusy(true);
    let added = 0;
    let skipped = 0;
    try {
      for (let i = 0; i < ready.length; i += IMPORT_BATCH) {
        setProgress({ done: i, total: ready.length });
        const trades = ready.slice(i, i + IMPORT_BATCH).map(({ draft: d, stop, r: rr }) => ({
          accountId: account.id,
          setupId: setup === "__off" || setup === "__none" ? null : setup,
          offPlan: setup === "__off",
          market: d.market.toUpperCase(),
          side: d.side,
          quality: null,
          openedAt: d.openedAt,
          entry: d.entry,
          stop,
          size: d.size,
          pointValue: d.pointValue,
          target: d.target,
          timeframe: null,
          context: null,
          plannedEntry: null,
          announcement: null,
          captureUrl: null,
          noStop: d.stop === null,
          ticket: d.ticket?.slice(0, 40) ?? null,
          notes: d.notes?.slice(0, 5000) ?? null,
          close:
            d.exit === null
              ? null
              : {
                  closedAt: d.closedAt ?? d.openedAt,
                  exit: d.exit,
                  exitReason: guessExitReason(rr, d.stop === null, reachedTarget(d.side!, d.exit, d.target)),
                  fees: d.fees,
                  comment: null,
                  captureUrl: null,
                  maeR: null,
                  mfeR: null,
                },
          planAnswers: NO_ANSWERS,
          errors: [],
        }));
        const res = await api<{ added: number; skipped: number }>("/api/journal/import", { json: { trades } });
        added += res.added;
        skipped += res.skipped;
      }
      setProgress(null);
      setResult({ added, skipped });
    } catch (e) {
      setError((e as Error).message + (added ? " " + tl("{0} trades ont déjà été ajoutés : relance l'import, ils ne seront pas ajoutés deux fois.", [added]) : ""));
      setProgress(null);
    } finally {
      setBusy(false);
    }
  };

  const columnOptions = loaded?.header.map((h, i) => ({ i, label: h || tl("colonne {0}", [i + 1]), sample: loaded.rows.find((row) => row[i]?.trim())?.[i] ?? "" })) ?? [];
  const setColumn = (field: ImportField, value: string) => {
    const next = { ...columns };
    if (value === "") delete next[field];
    else next[field] = Number(value);
    setColumns(next);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-center bg-black/60 sm:items-start sm:p-6" role="dialog" aria-modal="true" aria-label={tl("Importer un journal")}>
      <div className="flex w-full max-w-3xl flex-col overflow-hidden border-line bg-panel pt-[env(safe-area-inset-top)] sm:max-h-[calc(100vh-3rem)] sm:rounded-lg sm:border sm:pt-0">
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="font-semibold">{tl("Importer un journal")}</h2>
          <button onClick={result ? onDone : onCancel} className="px-2 text-lg leading-none text-muted hover:text-fg" aria-label={tl("Fermer")}>
            ✕
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 text-sm">
          {result ? (
            <div className="flex flex-col items-start gap-3">
              <Alert tone="info">
                {result.added === 1 ? tl("1 trade ajouté à {0}.", [account.name]) : tl("{0} trades ajoutés à {1}.", [result.added, account.name])}
                {result.skipped > 0 && " " + tl("{0} étaient déjà dans le journal.", [result.skipped])}
              </Alert>
              <Button onClick={onDone}>{tl("Voir mes trades")}</Button>
            </div>
          ) : !loaded ? (
            <>
              <p className="text-muted">
                {tl("Un fichier CSV ou Excel de n'importe quel journal, l'historique exporté de MetaTrader 4 ou 5 (rapport HTML ou Excel), ou l'export de TradeZella, Tradervue ou Edgewonk.")}
              </p>
              <button
                type="button"
                onClick={() => input.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files[0];
                  if (f) read(f);
                }}
                disabled={reading}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center ${dragging ? "border-accent bg-accent/5" : "border-line hover:border-accent/60"}`}
              >
                <span className="font-medium text-accent">{reading ? tl("Lecture du fichier…") : tl("Choisir un fichier")}</span>
                <span className="text-xs text-muted">{tl("ou dépose-le ici · CSV, Excel (.xlsx), rapport HTML")}</span>
              </button>
              <input
                ref={input}
                type="file"
                accept={IMPORT_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) read(f);
                }}
              />
              <p className="text-xs text-muted">{tl("Le fichier est lu dans ton navigateur et n'est envoyé nulle part : seuls les trades que tu importes sont enregistrés.")}</p>
              <details className="text-xs text-muted">
                <summary className="cursor-pointer text-accent">{tl("Exporter l'historique de MetaTrader")}</summary>
                <p className="mt-1">
                  {tl("MetaTrader 5 : onglet Historique de la Boîte à outils, clic droit, « Rapport », puis HTML ou Open XML (Excel). MetaTrader 4 : onglet Historique du compte, clic droit, « Enregistrer comme rapport détaillé ».")}
                </p>
              </details>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{loaded.name}</span>
                <span className="text-xs text-muted">
                  {loaded.platform ? tl("Rapport MetaTrader") : tl("Tableau")} · {tl("{0} lignes", [loaded.rows.length])}
                </span>
                <button onClick={() => setLoaded(null)} className="text-xs text-accent hover:underline" disabled={busy}>
                  {tl("Changer de fichier")}
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {accounts.length > 1 && (
                  <Field label={tl("Compte")}>
                    <select value={account.id} onChange={(e) => setAccountChoice(e.target.value)} disabled={busy}>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label={tl("Configuration de ces trades")}>
                  <select value={setup} onChange={(e) => setSetup(e.target.value)} disabled={busy}>
                    {setup === "" && <option value="">{tl("Choisir…")}</option>}
                    {setups.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                    {setups.length === 0 && <option value="__none">{tl("Sans configuration")}</option>}
                    <option value="__off">{tl("Hors plan (aucune de mes configurations)")}</option>
                  </select>
                </Field>
                <Field label={tl("Dates du fichier")}>
                  <select value={dateOrder} onChange={(e) => setDateOrder(e.target.value as DateOrder)} disabled={busy}>
                    <option value="dmy">{tl("jour/mois/année (27/11/2026)")}</option>
                    <option value="mdy">{tl("mois/jour/année (11/27/2026)")}</option>
                  </select>
                </Field>
                {noPointValue && (
                  <Field label={tl("Valeur du point des marchés inconnus")} term="valeur-du-point" hint={tl("Gain pour 1 de taille quand le prix bouge de 1, en {0}.", [account.currency])}>
                    <NumberInput nullable value={pointValue} onChange={setPointValue} min={0} disabled={busy} />
                  </Field>
                )}
              </div>
              <OffsetSelect value={offset} onChange={setOffset} timeZone={account.timeZone} />

              <details open={missing.length > 0} className="rounded-md border border-line px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium">
                  {missing.length ? tl("Colonnes : il en manque {0}", [missing.length]) : tl("Colonnes du fichier (trouvées toutes seules)")}
                </summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {IMPORT_FIELDS.filter((f) => f !== "openDate" || columns.openDate !== undefined)
                    .filter((f) => f !== "closeDate" || columns.closeDate !== undefined)
                    .map((f) => (
                      <label key={f} className="flex flex-col gap-0.5 text-xs text-muted">
                        <span>
                          {tl(FIELD_LABELS[f])}
                          {REQUIRED_FIELDS.includes(f) && <span className="text-down"> *</span>}
                        </span>
                        <select value={columns[f] ?? ""} onChange={(e) => setColumn(f, e.target.value)} disabled={busy} className={REQUIRED_FIELDS.includes(f) && columns[f] === undefined ? "border-down" : ""}>
                          <option value="">—</option>
                          {columnOptions.map((c) => (
                            <option key={c.i} value={c.i}>
                              {c.label}
                              {c.sample ? ` (${c.sample.slice(0, 24)})` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                </div>
              </details>

              {!missing.length && (
                <>
                  <p>
                    <span className="font-semibold">{tl("{0} trades prêts à importer", [ready.length])}</span>
                    {knownCount > 0 && <span className="text-muted"> · {tl("{0} déjà dans le journal", [knownCount])}</span>}
                    {broken.length > 0 && <span className="text-warn"> · {tl("{0} à corriger dans le fichier", [broken.length])}</span>}
                  </p>
                  {broken.length > 0 && (
                    <ul className="flex flex-col gap-0.5 text-xs text-warn">
                      {broken.slice(0, 6).map((c) => (
                        <li key={c.draft.line}>
                          {tl("Ligne {0}", [c.draft.line])} ({c.draft.market || "?"}) : {c.problems.map((p) => tl(p)).join(", ")}
                        </li>
                      ))}
                      {broken.length > 6 && <li>{tl("et {0} autres", [broken.length - 6])}</li>}
                    </ul>
                  )}
                  {ready.some((c) => c.draft.stop === null) && (
                    <p className="text-xs text-muted">
                      {tl("Sans stop dans le fichier, 1R = le risque prévu par le plan du compte ({0}).", [amount(plannedRisk, account.currency)])}
                      {loaded.platform && " " + tl("MetaTrader garde le dernier stop, pas celui du départ : corrige ensuite les trades dont le stop a bougé.")}
                    </p>
                  )}
                  {ready.length > 0 && (
                    <ul className="flex flex-col divide-y divide-line/60 rounded-md border border-line">
                      {ready.slice(0, PREVIEW).map((c) => (
                        <li key={c.draft.line} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1.5">
                          <span className="num w-32 shrink-0 text-xs text-muted">{c.draft.openedAt !== null ? date(c.draft.openedAt) : ""}</span>
                          <span className="font-medium">{c.draft.market}</span>
                          {c.draft.side && <SideBadge side={c.draft.side} />}
                          <span className="num text-xs text-muted">
                            {c.draft.size} · {price(c.draft.entry!)} → {c.draft.exit !== null ? price(c.draft.exit) : "…"}
                          </span>
                          {c.draft.exit === null && <span className="rounded bg-accent/15 px-1 text-[10px] text-accent">{tl("en cours")}</span>}
                          {c.draft.stop === null && <span className="rounded bg-panel-2 px-1 text-[10px] text-muted">{tl("sans stop")}</span>}
                          <span className="ml-auto flex items-baseline gap-2">
                            <span className={`num font-semibold ${tone(c.r)}`}>{r(c.r)}</span>
                            <span className={`num text-xs ${tone(c.amount)}`}>{amount(c.amount, account.currency, true)}</span>
                          </span>
                        </li>
                      ))}
                      {ready.length > PREVIEW && <li className="px-3 py-1.5 text-xs text-muted">{tl("et {0} autres", [ready.length - PREVIEW])}</li>}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
          {error && <Alert tone="error">{error}</Alert>}
        </div>

        {loaded && !result && (
          <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <Button onClick={save} disabled={busy || !ready.length || missing.length > 0}>
              {progress ? tl("Import… {0} sur {1}", [progress.done, progress.total]) : ready.length === 1 ? tl("Importer 1 trade") : tl("Importer {0} trades", [ready.length])}
            </Button>
            <Button variant="ghost" onClick={onCancel} disabled={busy}>
              {tl("Annuler")}
            </Button>
          </footer>
        )}
      </div>
    </div>
  );
}
