import { DEFAULT_LANG, hasLang, translator, type Lang, type T } from "@/lib/i18n";

/** The language of the page that sent the request: the x-lang header set by api(), else the referring page. */
export function langOf(req: Request): Lang {
  const header = req.headers.get("x-lang");
  if (hasLang(header)) return header;
  try {
    const ref = req.headers.get("referer");
    if (ref && /^\/en(\/|$)/.test(new URL(ref).pathname)) return "en";
  } catch {}
  return DEFAULT_LANG;
}

export const translatorOf = (req: Request): T => translator(langOf(req));
