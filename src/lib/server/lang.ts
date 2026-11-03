import { headers } from "next/headers";
import { DEFAULT_LANG, hasLang, translator, type Lang, type T } from "@/lib/i18n";

/** The language of the page that sent the request: the x-lang header set by api(), else the referring page. */
export function langOf(req: Request | Headers): Lang {
  const h = req instanceof Headers ? req : req.headers;
  const header = h.get("x-lang");
  if (hasLang(header)) return header;
  try {
    const ref = h.get("referer");
    if (ref && /^\/en(\/|$)/.test(new URL(ref).pathname)) return "en";
  } catch {}
  return DEFAULT_LANG;
}

export const translatorOf = (req: Request | Headers): T => translator(langOf(req));

/** langOf() for the request being handled, outside a request: French. */
export async function requestLang(): Promise<Lang> {
  try {
    return langOf(await headers());
  } catch {
    return DEFAULT_LANG;
  }
}

/** A translator in the language of the request being handled. */
export const requestT = async (): Promise<T> => translator(await requestLang());
