"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useRouter, useT } from "@/lib/client/i18n";
import { authClient } from "@/lib/client/auth-client";

/** Sends visitors to the sign-in page, then back here. The API refuses them anyway; this only spares a broken page. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const tl = useT();
  const path = usePathname();
  useEffect(() => {
    if (!isPending && !session) router.replace(`/connexion?next=${encodeURIComponent(path)}`);
  }, [isPending, session, router, path]);
  if (!session) return <p className="text-muted">{tl("Chargement…")}</p>;
  return <>{children}</>;
}
