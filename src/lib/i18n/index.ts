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

/** "12,50 €" in French, "€12.50" in English; no decimals when the price is whole. */
export function formatEuros(n: number, lang: Lang) {
  const s = n.toLocaleString(localeTag(lang), { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
  return lang === "en" ? `€${s}` : `${s} €`;
}

/**
 * Fills {0}, {1}… with the values. A format can follow the index, for texts
 * built away from the page (server messages): {0:t} translates the value,
 * {0:date} is a day and month ("12 novembre"), {0:euros} a price.
 */
function fill(lang: Lang, text: string, values?: readonly unknown[]) {
  if (!values?.length) return text;
  return text.replace(/\{(\d+)(?::(\w+))?\}/g, (m, i, format) => {
    const v = values[Number(i)];
    if (v === undefined) return m;
    if (format === "t") return translate(lang, String(v));
    if (format === "date") return new Date(v as string | number).toLocaleDateString(localeTag(lang), { day: "numeric", month: "long", timeZone: "Europe/Paris" });
    if (format === "euros") return formatEuros(Number(v), lang);
    return String(v);
  });
}

/** The text in `lang`. `fr` is the French text, which is also the dictionary key; {0}… are filled from `values`. */
export function translate(lang: Lang, fr: string, values?: readonly unknown[]): string {
  return fill(lang, lang === "en" ? (EN[fr] ?? fr) : fr, values);
}

export type T = (fr: string, values?: readonly unknown[]) => string;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let patterns: { re: RegExp; slots: number[]; en: string; fixed: number }[] | null = null;

/**
 * A French text already filled in, such as a report warning saved before
 * the page asked for it ("Seulement 12 trades : …"), in `lang`: the
 * dictionary entry it matches exactly, else the template it was built from.
 */
export function translateText(lang: Lang, text: string): string {
  if (lang === "fr" || !text) return text;
  if (EN[text]) return EN[text];
  patterns ??= Object.entries(EN)
    .filter(([fr]) => /\{\d+\}/.test(fr) && !/\{\d+:/.test(fr) && /[a-zà-ÿ]{3}/i.test(fr.replace(/\{\d+\}/g, "")))
    .map(([fr, en]) => ({
      re: new RegExp(`^${fr.split(/\{\d+\}/).map(escape).join("(.*?)")}$`, "s"),
      slots: [...fr.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1])),
      en,
      fixed: fr.replace(/\{\d+\}/g, "").length,
    }))
    // The template with the most fixed text first: "Durée max {0} bougies" before "{0} bougies".
    .sort((a, b) => b.fixed - a.fixed);
  for (const p of patterns) {
    const m = p.re.exec(text);
    if (!m) continue;
    const values: string[] = [];
    p.slots.forEach((slot, i) => (values[slot] = EN[m[i + 1]] ?? m[i + 1]));
    return p.en.replace(/\{(\d+)\}/g, (_, i) => values[Number(i)] ?? "");
  }
  return text;
}

/** The language of the page being rendered, set by LangProvider; for helpers outside components. */
let current: Lang = DEFAULT_LANG;
export function setCurrentLang(lang: Lang) {
  current = lang;
}

/** translate() in the language of the page being rendered, for helper functions called while rendering. */
export const tr: T = (fr, values) => translate(current, fr, values);
export const currentLang = () => current;

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
