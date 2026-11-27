"use client";

import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { Link, useT } from "@/lib/client/i18n";
import { highlights, matchScore, queryWords } from "@/lib/learn/search";

/** One thing the Learn page can find: a glossary word, a step, a beginner's mistake or a question. */
export interface LearnItem {
  kind: "term" | "step" | "mistake" | "faq";
  id: string;
  title: string;
  text: string;
  more?: string;
  example?: string;
  /** The glossary category, for a word. */
  category?: string;
}

const KIND_LABELS: Record<LearnItem["kind"], string> = {
  term: "Glossaire",
  step: "Premier backtest",
  mistake: "Erreur de débutant",
  faq: "Question fréquente",
};

const MAX_RESULTS = 30;

/** The query's words lit up in a text. */
function Lit({ text, words }: { text: string; words: string[] }) {
  const ranges = highlights(text, words);
  if (!ranges.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([a, b], i) => {
    if (a > at) parts.push(text.slice(at, a));
    parts.push(
      <mark key={i} className="rounded-sm bg-accent/20 px-px text-fg">
        {text.slice(a, b)}
      </mark>,
    );
    at = b;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

/**
 * The Learn page with a search box on top: while something is typed, the
 * matching words, steps, mistakes and questions replace the page; empty, the
 * page comes back as it was.
 */
export function LearnSearch({ items, children }: { items: LearnItem[]; children: ReactNode }) {
  const tl = useT();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const words = useMemo(() => queryWords(deferred), [deferred]);
  // Shown or hidden from what is typed now; the results follow a moment later on slow phones.
  const searching = queryWords(query).length > 0;
  /** Back to the page, at the word. */
  const open = (id: string) => {
    setQuery("");
    setTimeout(() => {
      if (window.location.hash === `#${id}`) document.getElementById(id)?.scrollIntoView({ block: "start" });
      else window.location.hash = id;
    }, 30);
  };
  const results = useMemo(() => {
    if (!words.length) return [];
    return items
      .map((item, order) => ({ item, order, score: matchScore(words, item.title, item.text, item.more, item.example, item.category) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .map((r) => r.item);
  }, [items, words]);

  return (
    <>
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mx-3 bg-bg/95 px-3 py-2 backdrop-blur sm:mx-0 sm:px-0">
        <label className="relative block">
          <span className="sr-only">{tl("Rechercher dans Apprendre")}</span>
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder={tl("Rechercher un mot, une règle, une question…")}
            className="w-full py-2 pr-3 pl-9"
            enterKeyHint="search"
            autoComplete="off"
          />
        </label>
        {searching && (
          <p className="mt-1.5 text-xs text-muted" aria-live="polite">
            {results.length === 0
              ? tl("Rien trouvé pour « {0} ».", [deferred.trim()])
              : results.length === 1
                ? tl("1 résultat")
                : tl("{0} résultats", [Math.min(results.length, MAX_RESULTS)])}
          </p>
        )}
      </div>

      {searching ? (
        <div className="flex flex-col gap-2">
          {results.slice(0, MAX_RESULTS).map((r) => (
            <article key={`${r.kind}-${r.id}`} className="rounded-lg border border-line bg-panel p-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                <span className="rounded-full border border-line px-1.5 py-px">{tl(KIND_LABELS[r.kind])}</span>
                {r.category && <span>{r.category}</span>}
              </div>
              <h3 className="mt-1 text-sm font-semibold">
                {r.kind === "term" ? (
                  <a
                    href={`#${r.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      open(r.id);
                    }}
                    className="hover:text-accent hover:underline"
                  >
                    <Lit text={r.title} words={words} />
                  </a>
                ) : (
                  <Lit text={r.title} words={words} />
                )}
              </h3>
              <p className={`mt-0.5 text-sm ${r.kind === "term" ? "text-fg/85" : "text-muted"}`}>
                <Lit text={r.text} words={words} />
              </p>
              {r.more && (
                <p className="mt-1 text-sm text-muted">
                  <Lit text={r.more} words={words} />
                </p>
              )}
              {r.example && (
                <p className="mt-1 text-xs text-accent/90">
                  <Lit text={tl("Exemple : {0}", [r.example])} words={words} />
                </p>
              )}
              {r.kind === "faq" && (
                <Link href="/questions" className="mt-1 inline-block text-xs text-accent hover:underline">
                  {tl("Toutes les questions fréquentes")}
                </Link>
              )}
            </article>
          ))}
          {results.length === 0 && (
            <p className="rounded-lg border border-line bg-panel p-3 text-sm text-muted">
              {tl("Essaie un autre mot, ou regarde les ")}
              <Link href="/questions" className="text-accent hover:underline">
                {tl("questions fréquentes")}
              </Link>
              .
            </p>
          )}
        </div>
      ) : null}
      <div className={searching ? "hidden" : "contents"}>{children}</div>
    </>
  );
}
