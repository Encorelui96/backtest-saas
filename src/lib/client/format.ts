/** The page's locale for numbers and dates, set by LangProvider. French unless the page is English. */
let LOCALE = "fr-FR";

/** "fr-FR" or "en-US": the page language, for the formatting done outside these helpers. */
export const formatLocale = () => LOCALE;

export function setFormatLocale(locale: string) {
  LOCALE = locale;
}

export function pct(x: number | null | undefined, digits = 1, sign = true) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const s = x.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${sign && x > 0 ? "+" : ""}${s}${LOCALE === "fr-FR" ? " %" : "%"}`;
}

export function num(x: number | null | undefined, digits = 2) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return x.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function r(x: number | null | undefined, digits = 2) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return `${x > 0 ? "+" : ""}${num(x, digits)} R`;
}

export function money(x: number | null | undefined) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return x.toLocaleString(LOCALE, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function price(x: number) {
  const digits = x >= 1000 ? 2 : x >= 1 ? 4 : 6;
  return x.toLocaleString(LOCALE, { maximumFractionDigits: digits });
}

export function date(t: number, withTime = true) {
  return new Date(t).toLocaleString(LOCALE, withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "medium" });
}

export function tone(x: number | null | undefined) {
  if (x === null || x === undefined || !Number.isFinite(x) || x === 0) return "text-fg";
  return x > 0 ? "text-up" : "text-down";
}
