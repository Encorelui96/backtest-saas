import { EN } from "./en";

/**
 * Two languages. French is the source: every text is written in French in the
 * code and looked up in the English dictionary (en.ts), keyed by the French
 * text itself. A text missing from the dictionary shows in French rather than
 * breaking the page.
 */
export const LANGS = ["fr", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "fr";

export const hasLang = (s: string | null | undefined): s is Lang => s === "fr" || s === "en";

/** Fills {0}, {1}… with the values. */
function fill(text: string, values?: readonly unknown[]) {
  if (!values?.length) return text;
  return text.replace(/\{(\d+)\}/g, (m, i) => (values[Number(i)] === undefined ? m : String(values[Number(i)])));
}

/** The text in `lang`. `fr` is the French text, which is also the dictionary key; {0}… are filled from `values`. */
export function translate(lang: Lang, fr: string, values?: readonly unknown[]) {
  return fill(lang === "en" ? (EN[fr] ?? fr) : fr, values);
}

export type T = (fr: string, values?: readonly unknown[]) => string;

/** The language of the page being rendered, set by LangProvider; for helpers outside components. */
let current: Lang = DEFAULT_LANG;
export function setCurrentLang(lang: Lang) {
  current = lang;
}

/** translate() in the language of the page being rendered, for helper functions called while rendering. */
export const tr: T = (fr, values) => translate(current, fr, values);

export const translator = (lang: Lang): T => (fr, values) => translate(lang, fr, values);

/** The French site keeps its addresses; the English one lives under /en. */
export function localePath(lang: Lang, path: string) {
  if (lang === "fr" || !path.startsWith("/") || path.startsWith("/api/") || /^\/en(\/|$|\?|#)/.test(path)) return path;
  return path === "/" ? "/en" : `/en${path}`;
}

/** The same page in the other language. */
export function switchPath(path: string, to: Lang) {
  const bare = path.replace(/^\/en(?=\/|$)/, "") || "/";
  return to === "en" ? localePath("en", bare) : bare;
}

export const localeTag = (lang: Lang) => (lang === "en" ? "en-US" : "fr-FR");
