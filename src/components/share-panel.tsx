"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Alert, Button } from "./ui";

interface Share {
  id: string;
  featured: boolean;
}

/**
 * The owner's "Partager" button: creates a read-only public link to the report,
 * to copy into Discord, X or a message. Admins can also show it on the home page.
 */
export function SharePanel({ backtestId, initial }: { backtestId: string; initial: Share | null }) {
  const [share, setShare] = useState<Share | null>(initial);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) api<{ isAdmin: boolean }>("/api/me").then((m) => setAdmin(m.isAdmin)).catch(() => {});
  }, [open]);

  const url = share ? `${window.location.origin}/r/${share.id}` : "";

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const start = () =>
    run(async () => {
      setShare(share ?? (await api<Share>(`/api/backtests/${backtestId}/share`, { method: "POST" })));
      setOpen(true);
    });

  const copy = () =>
    run(async () => {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });

  const stop = () =>
    run(async () => {
      await api(`/api/backtests/${backtestId}/share`, { method: "DELETE" });
      setShare(null);
      setOpen(false);
    });

  const feature = (featured: boolean) => run(async () => setShare(await api<Share>(`/api/backtests/${backtestId}/share`, { method: "PATCH", json: { featured } })));

  if (!open) {
    return (
      <Button variant="ghost" onClick={start}>
        {share ? "Partagé ✓" : "Partager"}
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-accent/40 bg-panel p-3 text-sm sm:w-[420px]">
      <div className="flex items-center justify-between">
        <span className="font-medium">Lien public du rapport</span>
        <button onClick={() => setOpen(false)} className="text-xs text-muted hover:text-fg" aria-label="Fermer">
          ✕
        </button>
      </div>
      <p className="text-xs text-muted">Toute personne qui a ce lien voit les règles et les résultats, sans ton nom ni ton e-mail. Tu peux le retirer à tout moment.</p>
      <div className="flex gap-2">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 text-xs" />
        <Button onClick={copy}>{copied ? "Copié ✓" : "Copier"}</Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a href={url} target="_blank" rel="noopener" className="text-xs text-accent hover:underline">
          Voir comme un visiteur →
        </a>
        <button onClick={stop} className="text-xs text-down hover:underline">
          Ne plus partager
        </button>
      </div>
      {admin && share && (
        <label className="flex items-center gap-2 border-t border-line pt-2 text-xs text-muted">
          <input type="checkbox" checked={share.featured} onChange={(e) => feature(e.target.checked)} className="h-auto w-auto" />
          Montrer ce rapport en exemple sur la page d&apos;accueil
        </label>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
