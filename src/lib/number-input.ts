/**
 * Number fields keep what is typed as text. A controlled <input type="number"> fed with Number(text)
 * turns an emptied field into 0 and drops "0," on the way to "0,5", so the field can be neither cleared
 * nor given a decimal comma.
 */

/** The number a field's text reads as, or null while it is empty or unfinished ("", "-", ","). Takes a comma or a dot. */
export function parseNumber(text: string, integer = false): number | null {
  const s = text.replace(/[\s  ]/g, "").replace(",", ".");
  const ok = integer ? /^[+-]?\d+$/ : /^[+-]?(\d+\.?\d*|\.\d+)$/;
  if (!ok.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** A stored number as its field shows it: the page's decimal mark, no thousands separator. Empty for no value. */
export function formatDraft(value: number | null | undefined, locale: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return value.toLocaleString(locale, { useGrouping: false, maximumFractionDigits: 20 });
}

const decimals = (n: number) => (String(n).split(".")[1] ?? "").length;

/** The value one arrow key press away, without float noise (0.1 + 0.2 stays 0.3), never under `min`. */
export function stepValue(value: number | null, step: number, direction: 1 | -1, min?: number): number {
  const base = value ?? min ?? 0;
  const n = Number((base + direction * step).toFixed(Math.min(10, Math.max(decimals(step), decimals(base)))));
  return min === undefined ? n : Math.max(min, n);
}
