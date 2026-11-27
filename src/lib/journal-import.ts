/**
 * Importing an outside trading journal: a CSV or Excel table (any journal, the columns matched
 * once), a MetaTrader 4 / 5 history report, or the export of another journal app. Pure: the
 * file is read in the browser (lib/client/import-files.ts) into rows of cells, and everything
 * from there (finding the table, the columns, numbers, dates, sides, point values) is done here,
 * where it can be tested.
 */

import { defaultPointValue, type Side } from "./journal";
import { feesOf, platformTime, pointValueFromProfit } from "./journal-capture";
import { fold } from "./learn/search";

/** What the import can fill, each matched to one column of the file (or none). */
export const IMPORT_FIELDS = [
  "market",
  "side",
  "openedAt",
  "openDate",
  "closedAt",
  "closeDate",
  "entry",
  "exit",
  "size",
  "stop",
  "target",
  "commission",
  "swap",
  "fees",
  "profit",
  "ticket",
  "notes",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ColumnMap = Partial<Record<ImportField, number>>;

export const FIELD_LABELS: Record<ImportField, string> = {
  market: "Marché",
  side: "Sens",
  openedAt: "Date et heure d'entrée",
  openDate: "Heure d'entrée (colonne à part)",
  closedAt: "Date et heure de sortie",
  closeDate: "Heure de sortie (colonne à part)",
  entry: "Prix d'entrée",
  exit: "Prix de sortie",
  size: "Taille",
  stop: "Stop",
  target: "Objectif",
  commission: "Commission",
  swap: "Swap",
  fees: "Frais",
  profit: "Résultat (P&L)",
  ticket: "Numéro (ticket)",
  notes: "Notes",
};

/** Fields the import can't do without. */
export const REQUIRED_FIELDS: ImportField[] = ["market", "side", "openedAt", "entry", "exit", "size"];

/**
 * Column names, folded (no accents, lower case), from MetaTrader 4 and 5 reports in English and
 * French, TradeZella, Tradervue, Edgewonk and the usual spreadsheets. Matched whole first, then
 * as a start ("entry price usd"). Order matters inside a list: the first synonym found wins.
 */
const SYNONYMS: Record<ImportField, string[]> = {
  market: ["symbol", "symbole", "instrument", "ticker", "market", "marche", "item", "pair", "paire", "actif", "asset", "underlying"],
  side: ["side", "type", "direction", "sens", "buy/sell", "long/short", "action", "position type"],
  openedAt: ["open time", "opening time", "entry time", "open date/time", "open datetime", "entry date/time", "entry datetime", "open date", "entry date", "opened", "opened at", "date d'ouverture", "heure d'ouverture", "ouverture", "date d'entree", "heure d'entree", "date", "time", "heure"],
  openDate: [],
  // The plain "time" last: in a MetaTrader report, the second "Time" column is the exit.
  closedAt: ["close time", "closing time", "exit time", "close date/time", "close datetime", "exit date/time", "exit datetime", "close date", "exit date", "closed", "closed at", "date de fermeture", "heure de fermeture", "fermeture", "date de sortie", "heure de sortie", "cloture", "time", "heure"],
  closeDate: [],
  entry: ["open price", "entry price", "avg entry price", "average entry price", "entry", "prix d'ouverture", "prix d'entree", "entree", "price", "prix"],
  exit: ["close price", "exit price", "avg exit price", "average exit price", "exit", "prix de fermeture", "prix de sortie", "sortie", "price", "prix"],
  size: ["volume", "size", "lots", "lot", "quantity", "qty", "contracts", "shares", "taille", "quantite", "position size", "units"],
  stop: ["s / l", "s/l", "sl", "stop loss", "stop-loss", "stop", "initial stop", "stop initial", "initial stop loss"],
  target: ["t / p", "t/p", "tp", "take profit", "take-profit", "target", "objectif", "profit target"],
  commission: ["commission", "commissions", "comm"],
  swap: ["swap", "swaps", "rollover", "financing", "financement"],
  fees: ["fees", "frais", "total fees", "costs", "taxes"],
  profit: ["profit", "net p&l", "net pnl", "p&l", "pnl", "net profit", "gross p&l", "gross pnl", "realized p&l", "resultat", "benefice", "gain", "return $", "profit ($)"],
  ticket: ["ticket", "position", "position id", "order", "order id", "trade id", "trade #", "deal", "id", "numero", "#"],
  notes: ["notes", "note", "comment", "comments", "commentaire", "commentaires", "description", "tags", "setup"],
};

/** The words that start a new section in a MetaTrader report: the positions end there. */
const SECTION_TITLES = ["orders", "ordres", "deals", "transactions", "working orders", "ordres en cours", "results", "resultats", "summary", "resume", "open positions", "positions ouvertes", "balance", "closed transactions:", "open trades:", "working orders:"];

const clean = (s: string) => fold(s).replace(/\s+/g, " ").replace(/[:*]+$/, "").trim();

/** Names too common to be matched by their start ("price" would take "price target"): whole only. */
const WHOLE_ONLY = new Set(["date", "time", "heure", "price", "prix", "type", "id", "#", "entry", "exit", "entree", "sortie", "position", "order", "deal", "item", "action", "gain", "note", "stop", "target"]);

/**
 * Matches the columns of a header row to the fields. A name met twice (MetaTrader's two "Time"
 * and two "Price" columns) gives the entry first, then the exit.
 */
export function detectColumns(header: string[]): ColumnMap {
  const names = header.map(clean);
  const map: ColumnMap = {};
  const taken = new Set<number>();
  const find = (field: ImportField, exact: boolean) => {
    for (const syn of SYNONYMS[field]) {
      if (!exact && WHOLE_ONLY.has(syn)) continue;
      const i = names.findIndex((n, idx) => !taken.has(idx) && n && (exact ? n === syn : n.startsWith(syn + " ")));
      if (i >= 0) return i;
    }
    return -1;
  };
  // Pairs first: the exit takes the second "time" / "price" left by the entry.
  const order: ImportField[] = ["ticket", "market", "side", "openedAt", "entry", "stop", "target", "closedAt", "exit", "size", "commission", "swap", "fees", "profit", "notes"];
  for (const exact of [true, false]) {
    for (const field of order) {
      if (map[field] !== undefined) continue;
      const i = find(field, exact);
      if (i < 0) continue;
      // "position" is a ticket in a MetaTrader report, not a side; "type" stays the side.
      map[field] = i;
      taken.add(i);
    }
  }
  // A plain "Date" and a plain "Time": one moment, the entry's.
  if (map.openedAt !== undefined && map.closedAt !== undefined && names[map.openedAt] === "date" && ["time", "heure"].includes(names[map.closedAt])) {
    map.openDate = map.closedAt;
    delete map.closedAt;
  }
  // A separate time column next to a date one ("Open Date", "Open Time").
  const date = names.findIndex((n) => /^(open|entry|ouverture|entree)\s?date$|^date (d'ouverture|d'entree)$/.test(n));
  const time = names.findIndex((n) => /^(open|entry)\s?time$|^heure (d'ouverture|d'entree)$/.test(n));
  if (date >= 0 && time >= 0) {
    map.openedAt = date;
    map.openDate = time;
  }
  const cdate = names.findIndex((n) => /^(close|exit|fermeture|sortie)\s?date$|^date (de fermeture|de sortie)$/.test(n));
  const ctime = names.findIndex((n) => /^(close|exit)\s?time$|^heure (de fermeture|de sortie)$/.test(n));
  if (cdate >= 0 && ctime >= 0) {
    map.closedAt = cdate;
    map.closeDate = ctime;
  }
  return map;
}

const fieldsFound = (m: ColumnMap) => REQUIRED_FIELDS.filter((f) => m[f] !== undefined).length;

/**
 * Finds the trades' table in rows read from a file: the header is the first row that names most
 * of the required columns (a MetaTrader report starts with the account's details, then a
 * "Positions" title); the trades run until an empty row or the next section.
 */
export function findTable(rows: string[][]): { header: string[]; rows: string[][]; columns: ColumnMap; headerRow: number } | null {
  let best: { at: number; columns: ColumnMap; score: number } | null = null;
  for (let at = 0; at < Math.min(rows.length, 200); at++) {
    const filled = rows[at].filter((c) => c.trim()).length;
    if (filled < 4) continue;
    const columns = detectColumns(rows[at]);
    const score = fieldsFound(columns);
    if (score >= 4 && (!best || score > best.score)) best = { at, columns, score };
    if (score === REQUIRED_FIELDS.length) break;
  }
  if (!best) return null;
  const header = rows[best.at];
  const body: string[][] = [];
  for (const row of rows.slice(best.at + 1)) {
    const filled = row.filter((c) => c.trim()).length;
    const first = clean(row.find((c) => c.trim()) ?? "");
    if (filled === 0 || (filled <= 2 && SECTION_TITLES.includes(first))) break;
    // A header repeated inside the table (some exports print it every page).
    if (row.every((c, i) => clean(c) === clean(header[i] ?? ""))) continue;
    body.push(row);
  }
  return { header, rows: body, columns: best.columns, headerRow: best.at };
}

// ---------- Cells ----------

/**
 * A number as spreadsheets and reports write it: "1 234,56", "1,234.56", "1.234,56", "(12.50)",
 * "-12.5 USD", "€ 3.40", "12,5 %". null when there is none.
 */
export function parseNumber(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s || s === "-" || s === "—") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[\u00a0\u202f\s']/g, "").replace(/[^\d.,+\-\u2212]/g, "").replace(/\u2212/g, "-");
  if (/^[+-]/.test(s)) {
    if (s[0] === "-") negative = !negative;
    s = s.slice(1);
  }
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // The last one is the decimal mark, the other groups thousands.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // "1,234" with exactly three digits after one comma reads as thousands only when there are several commas.
    const commas = s.split(",").length - 1;
    s = commas > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, "");
  }
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  return negative ? -v : v;
}

/** Buy or sell in the words of the platforms; null for a line that isn't a trade (balance, deposit, credit). */
export function parseSide(raw: string | null | undefined): Side | null {
  const s = clean(raw ?? "");
  if (!s) return null;
  if (/^(buy|long|achat|acheter|b|bought|bto|btc|buy to (open|cover)|buy (limit|stop)|achat (limite|stop))\b/.test(s) || s === "l") return "long";
  if (/^(sell|short|vente|vendre|s|sold|sto|stc|sell (short|to open|to close)|sell (limit|stop)|vente (limite|stop))\b/.test(s) || s === "sh") return "short";
  return null;
}

/** The order of day and month in a file's dates: worked out from the values, else the trader says. */
export type DateOrder = "dmy" | "mdy";

/** Day first unless a value can only be month first (a second number above 12). */
export function guessDateOrder(values: string[]): DateOrder {
  let dmy = 0;
  let mdy = 0;
  for (const v of values) {
    const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(v.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) dmy++;
    else if (Number(m[2]) > 12) mdy++;
  }
  return mdy > dmy ? "mdy" : "dmy";
}

/**
 * A date and time from a file, to milliseconds. Wall times (no zone written) are read in the
 * account's time zone, moved by `offsetHours` when the platform's clock runs ahead; a time with
 * its zone ("Z", "+01:00") is taken as it is. Also Excel's day numbers (45987.5).
 */
export function parseDateTime(raw: string | null | undefined, timeZone: string, order: DateOrder, offsetHours = 0, timeRaw?: string | null): number | null {
  let s = (raw ?? "").trim();
  if (timeRaw && timeRaw.trim()) s = `${s} ${timeRaw.trim()}`;
  if (!s) return null;
  // Excel: days since 1899-12-30, the fraction is the time of day.
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const days = Number(s);
    if (days > 20000 && days < 80000) {
      const ms = Math.round((days - 25569) * 86_400_000);
      const d = new Date(ms);
      const wall = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
      return platformTime(wall, timeZone, offsetHours);
    }
  }
  // With its zone: the moment is known.
  if (/\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})$/i.test(s) && /^\d{4}-\d{2}-\d{2}/.test(s)) {
    const t = Date.parse(s.replace(" ", "T"));
    return Number.isFinite(t) ? t : null;
  }
  let y: number, mo: number, d: number;
  let rest: string;
  let m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(.*)$/.exec(s);
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    rest = m[4];
  } else {
    m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})(.*)$/.exec(s);
    if (!m) return null;
    const a = Number(m[1]);
    const b = Number(m[2]);
    [d, mo] = order === "mdy" ? [b, a] : [a, b];
    y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    rest = m[4];
  }
  const tm = /(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?\s*(am|pm)?/i.exec(rest);
  let h = tm ? Number(tm[1]) : 0;
  const mi = tm ? Number(tm[2]) : 0;
  const se = tm?.[3] ? Number(tm[3]) : 0;
  if (tm?.[4]) {
    const pm = tm[4].toLowerCase() === "pm";
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
  return platformTime(`${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(se)}`, timeZone, offsetHours);
}

const pad = (n: number) => String(n).padStart(2, "0");

// ---------- Trades ----------

export interface ImportOptions {
  timeZone: string;
  dateOrder: DateOrder;
  offsetHours: number;
  /** For markets the app doesn't know and a file without profits: one value for all the trades. */
  pointValue: number | null;
}

/** One line of the file as a trade to file, with what is missing. */
export interface ImportDraft {
  line: number;
  market: string;
  side: Side | null;
  openedAt: number | null;
  closedAt: number | null;
  entry: number | null;
  exit: number | null;
  size: number | null;
  /** null: the file gives none, the plan's risk then makes 1R (as for a screenshot). exit null: still open. */
  stop: number | null;
  target: number | null;
  fees: number;
  profit: number | null;
  pointValue: number | null;
  ticket: string | null;
  notes: string | null;
  /** Why the line can't be filed as it is; empty when it can. */
  problems: string[];
}

const cell = (row: string[], i: number | undefined) => (i === undefined ? "" : (row[i] ?? "").trim());
const priceOrNull = (v: number | null) => (v !== null && v > 0 ? v : null);

/** The trades of the table, in the file's order. Lines that aren't trades (deposits, balance) are left out. */
export function draftsFrom(header: string[], rows: string[][], columns: ColumnMap, options: ImportOptions, firstLine = 2): ImportDraft[] {
  const drafts: ImportDraft[] = [];
  // A "net" result has the fees taken off; MetaTrader's "Profit", next to its commission and swap columns, doesn't.
  const profitName = columns.profit === undefined ? "" : clean(header[columns.profit] ?? "");
  const profitIsGross = /\bnet\b|\bnette?\b/.test(profitName) ? false : /gross|brut/.test(profitName) || columns.commission !== undefined || columns.swap !== undefined;
  rows.forEach((row, i) => {
    const sideText = cell(row, columns.side);
    const side = parseSide(sideText);
    const market = cell(row, columns.market).replace(/\s+/g, "");
    // A balance or deposit line: no side, no market.
    if (!side && !market) return;
    if (!side && /^(balance|deposit|withdrawal|credit|depot|retrait|solde)/.test(clean(sideText))) return;
    const entry = priceOrNull(parseNumber(cell(row, columns.entry)));
    const exit = priceOrNull(parseNumber(cell(row, columns.exit)));
    const rawSize = parseNumber(cell(row, columns.size));
    const size = rawSize === null ? null : Math.abs(rawSize) || null;
    const commission = parseNumber(cell(row, columns.commission));
    const swap = parseNumber(cell(row, columns.swap));
    const otherFees = parseNumber(cell(row, columns.fees));
    // A commission is always paid, whatever its sign in the file (MetaTrader prints it negative, journals positive);
    // a swap keeps MetaTrader's sign (negative when paid); a "fees" column counts as paid.
    const fees = Math.round((feesOf({ commission: commission === null ? null : -Math.abs(commission), swap }) + Math.abs(otherFees ?? 0)) * 100) / 100;
    const profit = parseNumber(cell(row, columns.profit));
    const closedAt = parseDateTime(cell(row, columns.closedAt), options.timeZone, options.dateOrder, options.offsetHours, columns.closeDate !== undefined ? cell(row, columns.closeDate) : null);
    const openedAt = parseDateTime(cell(row, columns.openedAt), options.timeZone, options.dateOrder, options.offsetHours, columns.openDate !== undefined ? cell(row, columns.openDate) : null) ?? closedAt;
    const draft: ImportDraft = {
      line: firstLine + i,
      market,
      side,
      openedAt,
      // No exit: a trade still open in the outside journal, filed open.
      closedAt: exit === null ? null : (closedAt ?? openedAt),
      entry,
      exit,
      size,
      stop: priceOrNull(parseNumber(cell(row, columns.stop))),
      target: priceOrNull(parseNumber(cell(row, columns.target))),
      fees,
      profit,
      pointValue: null,
      ticket: cell(row, columns.ticket).replace(/^#/, "") || null,
      notes: cell(row, columns.notes) || null,
      problems: [],
    };
    // The profit before fees holds the contract size; a "net" profit adds the fees back.
    const gross = profit === null ? null : profitIsGross ? profit : profit + fees;
    draft.pointValue = (side && pointValueFromProfit({ side, size, entry, exit, profit: gross })) ?? defaultPointValue(market) ?? options.pointValue;
    if (draft.stop !== null && side && entry !== null && (side === "long" ? draft.stop >= entry : draft.stop <= entry)) draft.stop = null;
    if (!market) draft.problems.push("marché manquant");
    if (!side) draft.problems.push("sens illisible");
    if (openedAt === null) draft.problems.push("date illisible");
    if (entry === null) draft.problems.push("prix d'entrée manquant");
    if (size === null) draft.problems.push("taille manquante");
    if (draft.pointValue === null) draft.problems.push("valeur du point inconnue");
    if (openedAt !== null && draft.closedAt !== null && draft.closedAt < openedAt) draft.problems.push("sortie avant l'entrée");
    drafts.push(draft);
  });
  return drafts;
}

/** The trades already in the journal, so a file imported twice adds nothing the second time. */
export function importKey(t: { market: string; openedAt: number | null; entry: number | null; ticket: string | null }): string {
  return t.ticket ? `#${t.ticket}` : `${t.market.toUpperCase()}|${t.openedAt === null ? "" : Math.round(t.openedAt / 60_000)}|${t.entry ?? ""}`;
}

/** The most trades one import sends to the server at a time. */
export const IMPORT_BATCH = 200;
/** The most lines a file may have: beyond, split it. */
export const IMPORT_MAX_LINES = 5000;

// ---------- CSV ----------

/** The separator of a CSV file: the one that splits the first lines most evenly. */
function delimiterOf(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best = ",";
  let bestScore = 0;
  for (const d of [",", ";", "\t", "|"]) {
    const counts = lines.map((l) => splitLine(l, d).length);
    const most = Math.max(...counts);
    if (most < 2) continue;
    const same = counts.filter((c) => c === most).length;
    const score = same * most;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

function splitLine(line: string, d: string): string[] {
  return parseCsv(line, d)[0] ?? [];
}

/** Reads a CSV text into rows of cells: quotes, doubled quotes and line breaks inside quotes. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const d = delimiter ?? delimiterOf(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field.trim() === "") {
      quoted = true;
      field = "";
    } else if (ch === d) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim()));
}
