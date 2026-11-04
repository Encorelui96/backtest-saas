"use client";

import type { ReactNode } from "react";
import { Link, useT } from "@/lib/client/i18n";

/** Says what the paid plans add and where to find them, next to what the free plan already shows. */
export function PlanLock({ children }: { children: ReactNode }) {
  const tl = useT();
  return (
    <p className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
      <span aria-hidden>🔒 </span>
      {children}{" "}
      <Link href="/tarifs" className="web-only font-medium text-accent hover:underline">
        {tl("Voir les offres →")}</Link>
    </p>
  );
}
