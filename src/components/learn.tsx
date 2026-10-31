"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { USES, glossary } from "@/lib/learn/glossary";

/**
 * Beginner mode: clickable terms, explanation boxes and a guided reading of
 * the results. Expert mode drops those for a denser screen with every setting.
 * Both keep a "?" next to every field. The choice is a per-browser preference,
 * so it lives in localStorage; new visitors start in beginner mode.
 */

export type Level = "beginner" | "expert";

const KEY = "backtest-lab:level";
const listeners = new Set<() => void>();

function read(): Level {
  try {
    return localStorage.getItem(KEY) === "expert" ? "expert" : "beginner";
  } catch {
    return "beginner";
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => e.key === KEY && fn();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function setLevel(level: Level) {
  try {
    localStorage.setItem(KEY, level);
  } catch {
    // Private browsing: the choice only lasts for this page.
  }
  listeners.forEach((fn) => fn());
}

export function useLevel(): Level {
  return useSyncExternalStore(subscribe, read, () => "beginner");
}

export function useBeginner() {
  return useLevel() === "beginner";
}

export function LevelToggle({ className = "" }: { className?: string }) {
  const level = useLevel();
  return (
    <div className={`inline-flex rounded-md border border-line p-0.5 text-xs ${className}`} role="group" aria-label="Niveau d'affichage">
      {(["beginner", "expert"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLevel(l)}
          aria-pressed={level === l}
          className={`rounded px-2.5 py-1 ${level === l ? "bg-accent text-white" : "text-muted hover:text-fg"}`}
        >
          {l === "beginner" ? "Débutant" : "Expert"}
        </button>
      ))}
    </div>
  );
}

/** Children only in beginner mode. */
export function Beginner({ children }: { children: ReactNode }) {
  return useBeginner() ? <>{children}</> : null;
}

/** Children only in expert mode. */
export function Expert({ children }: { children: ReactNode }) {
  return useBeginner() ? null : <>{children}</>;
}

/** A short explanation box, beginner mode only. */
export function Tip({ children, title }: { children: ReactNode; title?: string }) {
  if (!useBeginner()) return null;
  return (
    <div className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-xs leading-relaxed text-fg/90">
      {title && <div className="mb-0.5 font-semibold text-accent">{title}</div>}
      {children}
    </div>
  );
}

/** A one-line recommendation under a form field, beginner mode only. */
export function FieldHelp({ children }: { children: ReactNode }) {
  if (!useBeginner()) return null;
  return <span className="text-[11px] leading-snug text-accent/90">{children}</span>;
}

/**
 * The definition of a glossary entry, opened by its trigger. On phones there is
 * no hover and little width, so it opens as a sheet above the tab bar; on
 * larger screens, as a bubble under the trigger. A click elsewhere closes it.
 */
function Definition({ id, trigger, triggerClass, label }: { id: string; trigger: ReactNode; triggerClass: string; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const entry = glossary(id);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!entry) return <>{trigger}</>;
  const use = USES[id];
  return (
    <span ref={ref} className="relative inline">
      <button
        type="button"
        onClick={(e) => {
          // Inside a <label>, a click would otherwise focus the input.
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-label={label}
        className={triggerClass}
      >
        {trigger}
      </button>
      {open && (
        <span
          role="dialog"
          aria-label={entry.term}
          className="fixed inset-x-3 bottom-[calc(72px+env(safe-area-inset-bottom))] z-50 block rounded-lg border border-line bg-panel-2 p-3 text-left text-sm font-normal normal-case leading-relaxed text-fg shadow-2xl md:absolute md:inset-x-auto md:bottom-auto md:left-0 md:top-full md:mt-1 md:w-80 md:p-2.5 md:text-xs"
        >
          <span className="mb-1 flex items-start justify-between gap-2">
            <span className="font-semibold text-accent">{entry.term}</span>
            <span className="text-muted md:hidden" aria-hidden>
              ✕
            </span>
          </span>
          <span className="block">{entry.short}</span>
          {use && (
            <span className="mt-1.5 block">
              <span className="font-semibold">À quoi ça sert : </span>
              {use}
            </span>
          )}
          <Link href={`/apprendre#${entry.id}`} className="mt-1.5 inline-block text-accent underline decoration-dotted underline-offset-2">
            En savoir plus
          </Link>
        </span>
      )}
    </span>
  );
}

/** A round "?" that explains a field: blue in beginner mode, grey and quieter in expert mode. */
export function Help({ id }: { id: string }) {
  const beginner = useBeginner();
  const tone = beginner ? "border-accent/60 text-accent hover:bg-accent hover:text-white" : "border-line text-muted hover:border-accent hover:text-accent";
  return (
    <Definition
      id={id}
      label="Explication"
      trigger="?"
      triggerClass={`ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border align-middle text-[11px] font-bold leading-none md:h-4 md:w-4 md:text-[10px] ${tone}`}
    />
  );
}

/** A word with its definition one tap away in beginner mode; plain text in expert mode. */
export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const beginner = useBeginner();
  const entry = glossary(id);
  const label = children ?? entry?.term ?? id;
  if (!beginner || !entry) return <>{label}</>;
  return (
    <Definition id={id} label={`Définition : ${entry.term}`} trigger={label} triggerClass="cursor-help text-left underline decoration-accent/70 decoration-dotted underline-offset-2" />
  );
}
