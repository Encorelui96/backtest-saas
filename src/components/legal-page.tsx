import type { ReactNode } from "react";
import { LEGAL_UPDATED } from "@/lib/legal";
import { translate, type Lang } from "@/lib/i18n";

/**
 * Long-form text page (legal notice, privacy, terms, changelog). `legal`: the
 * English page is a courtesy translation, and says the French text prevails.
 */
export function LegalPage({
  lang = "fr",
  title,
  intro,
  children,
  updated = true,
  legal = false,
}: {
  lang?: Lang;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  updated?: boolean;
  legal?: boolean;
}) {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 pb-8 text-sm leading-relaxed">
      <header>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {updated && <p className="mt-1 text-xs text-muted">{translate(lang, "Dernière mise à jour : {0}", [translate(lang, LEGAL_UPDATED)])}</p>}
        {legal && lang === "en" && (
          <p className="mt-3 rounded-md border border-line bg-panel px-3 py-2 text-xs text-muted">
            This is a translation provided for convenience. The French version of this page is the only legally binding one and prevails in case of difference.{" "}
            <a href={`${FRENCH_PAGE[title] ?? "/"}?lang=fr`} className="underline hover:text-fg" hrefLang="fr">
              Read the French version
            </a>
            .
          </p>
        )}
        {intro && <p className="mt-3 text-fg/85">{intro}</p>}
      </header>
      {children}
    </article>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="flex flex-col gap-2 text-fg/85 [&_li]:ml-4 [&_li]:list-disc [&_a]:underline [&_a:hover]:text-fg">{children}</div>
    </section>
  );
}

/** A value from the legal settings, or a visible reminder that it is still missing. */
export function Fill({ value, lang = "fr" }: { value: string; lang?: Lang }) {
  return value ? <>{value}</> : <mark className="rounded bg-warn/20 px-1 text-warn">{lang === "en" ? "to be completed" : "à compléter"}</mark>;
}

/** The French page of each English legal page, by its English title. */
const FRENCH_PAGE: Record<string, string> = {
  "Legal notice": "/mentions-legales",
  "Privacy policy": "/confidentialite",
  "Terms of use": "/conditions",
};
