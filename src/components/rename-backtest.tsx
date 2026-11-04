"use client";

import { useT } from "@/lib/client/i18n";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { BACKTEST_NAME_MAX } from "@/lib/backtest-names";
import { Alert, Button } from "./ui";

/** The pencil beside a backtest's name. Lists open the report on click: this one must not. */
export function RenameButton({ onClick }: { onClick: () => void }) {
  const tl = useT();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={tl("Renommer")}
      title={tl("Renommer")}
      className="shrink-0 rounded-md p-2 text-muted hover:bg-panel-2 hover:text-fg"
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
        <path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5z" />
      </svg>
    </button>
  );
}

/** Replaces the name while it is edited. Saved empty, the backtest takes its strategy's name back. */
export function RenameBacktest({ id, name, onDone, onCancel }: { id: string; name: string; onDone: (name: string) => void; onCancel: () => void }) {
  const tl = useT();
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone((await api<{ name: string }>(`/api/backtests/${id}`, { method: "PATCH", json: { name: value } })).name);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="flex w-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={value}
          maxLength={BACKTEST_NAME_MAX}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
          placeholder={tl("Vide : nom de la stratégie")}
          aria-label={tl("Nom du backtest")}
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={busy}>
          {tl("Enregistrer")}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {tl("Annuler")}</Button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </form>
  );
}
