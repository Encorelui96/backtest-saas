/**
 * Reads a journal file in the browser into rows of cells, for lib/journal-import: CSV and text,
 * Excel (.xlsx), and HTML reports (MetaTrader 4 and 5). Nothing is sent: only the trades the
 * trader keeps go to the server, as trades.
 */

import { parseCsv } from "../journal-import";

/** The file kinds the import takes, for the file picker. */
export const IMPORT_ACCEPT = ".csv,.tsv,.txt,.xlsx,.htm,.html";

/** Biggest file read: a few years of trades weigh far less. */
const MAX_BYTES = 15 * 1024 * 1024;

export class ImportFileError extends Error {}

export async function readImportFile(file: File): Promise<{ rows: string[][]; kind: "csv" | "xlsx" | "html" }> {
  if (file.size > MAX_BYTES) throw new ImportFileError("Ce fichier est trop gros (15 Mo au plus) : exporte une période plus courte.");
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith(".xls")) throw new ImportFileError("L'ancien format Excel (.xls) ne se lit pas : enregistre le fichier en .xlsx ou en CSV.");
  if (name.endsWith(".xlsx") || isZip(bytes)) return { rows: await readXlsx(bytes), kind: "xlsx" };
  const text = decodeText(bytes);
  if (name.endsWith(".htm") || name.endsWith(".html") || /^\s*(<!doctype html|<html|<\?xml|<table)/i.test(text.slice(0, 500))) return { rows: htmlRows(text), kind: "html" };
  return { rows: parseCsv(text), kind: "csv" };
}

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

/** UTF-8, UTF-16 (MetaTrader's HTML reports) or the Windows code page of old Excel exports. */
function decodeText(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b);
  // UTF-16 without its mark: every other byte is zero in a Latin text.
  if (b.length > 4 && b[1] === 0 && b[3] === 0) return new TextDecoder("utf-16le").decode(b);
  const utf8 = new TextDecoder("utf-8").decode(b);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(b) : utf8;
}

/** Every row of every table of the page, in order, a cell spanning several columns repeated empty. */
function htmlRows(html: string): string[][] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows: string[][] = [];
  doc.querySelectorAll("tr").forEach((tr) => {
    const row: string[] = [];
    tr.querySelectorAll("th, td").forEach((c) => {
      const cell = c as HTMLTableCellElement;
      // MetaTrader hides some cells (class "hidden", display: none): they hold nothing useful.
      if (cell.classList.contains("hidden")) return;
      row.push((cell.textContent ?? "").replace(/\s+/g, " ").trim());
      for (let i = 1; i < Math.min(cell.colSpan || 1, 50); i++) row.push("");
    });
    rows.push(row);
  });
  return rows;
}

// ---------- Excel (.xlsx) ----------

/**
 * The first sheet of an .xlsx file. An .xlsx is a zip of XML files: the browser inflates them
 * (DecompressionStream) and reads the XML (DOMParser), no library needed.
 */
async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  const files = zipEntries(bytes);
  const read = async (path: string) => {
    const e = files.get(path);
    return e ? new TextDecoder("utf-8").decode(await inflate(bytes, e)) : null;
  };
  const shared: string[] = [];
  const sst = await read("xl/sharedStrings.xml");
  if (sst) {
    xml(sst)
      .querySelectorAll("si")
      .forEach((si) => shared.push(Array.from(si.getElementsByTagName("t"), (t) => t.textContent ?? "").join("")));
  }
  const sheetPath = (await firstSheetPath(read)) ?? [...files.keys()].filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p)).sort()[0];
  const sheet = sheetPath ? await read(sheetPath) : null;
  if (!sheet) throw new ImportFileError("Aucune feuille lisible dans ce fichier Excel.");
  const rows: string[][] = [];
  xml(sheet)
    .querySelectorAll("sheetData > row")
    .forEach((rowEl) => {
      const r = Number(rowEl.getAttribute("r") ?? rows.length + 1) - 1;
      const row: string[] = [];
      rowEl.querySelectorAll("c").forEach((c) => {
        const col = columnIndex(c.getAttribute("r")) ?? row.length;
        const type = c.getAttribute("t");
        const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
        let value: string;
        if (type === "s") value = shared[Number(v)] ?? "";
        else if (type === "inlineStr") value = Array.from(c.getElementsByTagName("t"), (t) => t.textContent ?? "").join("");
        else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
        else value = v;
        while (row.length < col) row.push("");
        row[col] = value.trim();
      });
      while (rows.length < r) rows.push([]);
      rows[r] = row;
    });
  return rows;
}

/** The sheet the workbook lists first (its tabs can be in any file order). */
async function firstSheetPath(read: (p: string) => Promise<string | null>): Promise<string | null> {
  const wb = await read("xl/workbook.xml");
  const rels = await read("xl/_rels/workbook.xml.rels");
  if (!wb || !rels) return null;
  const sheet = xml(wb).getElementsByTagName("sheet")[0];
  const id = sheet?.getAttribute("r:id") ?? sheet?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  if (!id) return null;
  const rel = Array.from(xml(rels).getElementsByTagName("Relationship")).find((r) => r.getAttribute("Id") === id);
  const target = rel?.getAttribute("Target");
  if (!target) return null;
  return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
}

const xml = (text: string) => new DOMParser().parseFromString(text, "application/xml");

/** "C12" → 2 (the column, from 0). */
function columnIndex(ref: string | null): number | null {
  const m = ref ? /^([A-Z]+)\d+$/.exec(ref) : null;
  if (!m) return null;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

interface ZipEntry {
  method: number;
  compressed: number;
  offset: number;
}

/** The files of a zip, from its central directory at the end. */
function zipEntries(b: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ImportFileError("Ce fichier Excel est abîmé ou n'en est pas un.");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, ZipEntry>();
  for (let n = 0; n < count && at + 46 <= b.length; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = new TextDecoder("utf-8").decode(b.subarray(at + 46, at + 46 + nameLength));
    files.set(name, { method, compressed, offset });
    at += 46 + nameLength + extra + comment;
  }
  return files;
}

async function inflate(b: Uint8Array, e: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const start = e.offset + 30 + view.getUint16(e.offset + 26, true) + view.getUint16(e.offset + 28, true);
  const data = b.slice(start, start + e.compressed);
  if (e.method === 0) return data;
  if (e.method !== 8) throw new ImportFileError("Ce fichier Excel utilise une compression que le navigateur ne lit pas : enregistre-le en CSV.");
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
