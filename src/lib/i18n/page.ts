import { DEFAULT_LANG, hasLang, translator, type Lang, type T } from ".";

/** The language of a page under app/[lang], and its translator. */
export async function pageLang(params: Promise<{ lang: string }>): Promise<{ lang: Lang; t: T }> {
  const { lang } = await params;
  const l = hasLang(lang) ? lang : DEFAULT_LANG;
  return { lang: l, t: translator(l) };
}
