import type { ReactNode } from "react";
import { LEGAL_UPDATED } from "@/lib/legal";

/** Long-form text page (legal notice, privacy, terms, changelog). */
export function LegalPage({ title, intro, children, updated = true }: { title: string; intro?: ReactNode; children: ReactNode; updated?: boolean }) {
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 pb-8 text-sm leading-relaxed">
      <header>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {updated && <p className="mt-1 text-xs text-muted">Dernière mise à jour : {LEGAL_UPDATED}</p>}
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
export function Fill({ value }: { value: string }) {
  return value ? <>{value}</> : <mark className="rounded bg-warn/20 px-1 text-warn">à compléter</mark>;
}
