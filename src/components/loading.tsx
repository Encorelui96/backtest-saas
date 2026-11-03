"use client";

import { useT } from "@/lib/client/i18n";

/** The placeholder shown while a page waits for its data, in the page's language. */
export function Loading() {
  const tl = useT();
  return <p className="text-muted">{tl("Chargement…")}</p>;
}
