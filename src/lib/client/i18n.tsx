"use client";

import { Fragment, createContext, useContext, useMemo, type ComponentProps, type ReactNode } from "react";
import NextLink from "next/link";
import { usePathname, useRouter as useNextRouter } from "next/navigation";
import { localePath, localeTag, setCurrentLang, switchPath, translateText, translator, type Lang, type T } from "@/lib/i18n";
import { setFormatLocale } from "./format";

const LangContext = createContext<Lang>("fr");

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  // Number and date formatting follows the page's language (read by lib/client/format).
  setFormatLocale(localeTag(lang));
  // Also read by tr(), for helpers called while rendering. Server code outside pages passes its own translator.
  setCurrentLang(lang);
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

/** t("texte français") → the text in the page's language. */
export function useT(): T {
  const lang = useLang();
  return useMemo(() => translator(lang), [lang]);
}

/** next/link that keeps the visitor in their language: href="/tarifs" goes to /en/tarifs on the English site. */
export function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const lang = useLang();
  return <NextLink href={typeof href === "string" ? localePath(lang, href) : href} {...props} />;
}

/** useRouter whose push and replace keep the language. */
export function useRouter() {
  const router = useNextRouter();
  const lang = useLang();
  return useMemo(
    () => ({
      ...router,
      push: (href: string, opts?: Parameters<typeof router.push>[1]) => router.push(localePath(lang, href), opts),
      replace: (href: string, opts?: Parameters<typeof router.replace>[1]) => router.replace(localePath(lang, href), opts),
    }),
    [router, lang],
  );
}

/** The page's path without the /en prefix, for comparing with the site's routes. */
export function useBarePath() {
  const path = usePathname();
  return path.replace(/^\/en(?=\/|$)/, "") || "/";
}

/** FR / EN switch: the same page in the other language, remembered for the next visit. */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const lang = useLang();
  const path = usePathname();
  return (
    <span className={`inline-flex overflow-hidden rounded-md border border-line text-[11px] font-semibold ${className}`} aria-label="Langue / Language">
      {(["fr", "en"] as const).map((l) => (
        <a
          key={l}
          href={switchPath(path, l) + (typeof window !== "undefined" ? window.location.search : "")}
          hrefLang={l}
          onClick={() => {
            document.cookie = `lang=${l}; path=/; max-age=31536000; samesite=lax`;
          }}
          aria-current={lang === l ? "true" : undefined}
          className={`px-1.5 py-0.5 ${lang === l ? "bg-accent text-white" : "text-muted hover:text-fg"}`}
        >
          {l.toUpperCase()}
        </a>
      ))}
    </span>
  );
}

/** A translated sentence with React nodes (bold, coloured numbers…) in place of its {0}, {1}… */
export function rich(text: string, nodes: readonly ReactNode[]): ReactNode {
  return text.split(/\{(\d+)\}/).map((part, i) => (i % 2 ? <Fragment key={i}>{nodes[Number(part)]}</Fragment> : part));
}

/** For French texts saved already filled in (report warnings, robustness labels): translateText() in the page language. */
export function useText(): (text: string) => string {
  const lang = useLang();
  return useMemo(() => (text: string) => translateText(lang, text), [lang]);
}
