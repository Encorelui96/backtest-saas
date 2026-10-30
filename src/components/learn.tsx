"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { glossary } from "@/lib/learn/glossary";

/**
 * Beginner mode: explanations under the fields, clickable terms and a guided
 * reading of the results. The choice is a per-browser preference, so it lives
 * in localStorage; new visitors start in beginner mode.
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
          className={`rounded px-2 py-1 ${level === l ? "bg-accent text-white" : "text-muted hover:text-fg"}`}
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

/** A one-line help under a form field, beginner mode only. */
export function FieldHelp({ children, term }: { children: ReactNode; term?: string }) {
  if (!useBeginner()) return null;
  return (
    <span className="text-[11px] leading-snug text-accent/90">
      {children}
      {term && (
        <>
          {" "}
          <TermLink id={term} />
        </>
      )}
    </span>
  );
}

function TermLink({ id }: { id: string }) {
  return (
    <Link href={`/apprendre#${id}`} className="underline decoration-dotted underline-offset-2 hover:text-fg">
      En savoir plus
    </Link>
  );
}

/**
 * A word with its definition one tap away (beginner mode). On phones there is
 * no hover, so the pop-up opens on click and closes on a click elsewhere.
 */
export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const beginner = useBeginner();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const entry = glossary(id);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const label = children ?? entry?.term ?? id;
  if (!beginner || !entry) return <>{label}</>;
  return (
    <span ref={ref} className="relative inline">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        className="cursor-help text-left underline decoration-accent/70 decoration-dotted underline-offset-2"
      >
        {label}
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-40 mt-1 block w-64 max-w-[80vw] rounded-md border border-line bg-panel-2 p-2.5 text-left text-xs font-normal normal-case leading-relaxed text-fg shadow-lg"
        >
          <span className="mb-0.5 block font-semibold text-accent">{entry.term}</span>
          {entry.short}{" "}
          <TermLink id={entry.id} />
        </span>
      )}
    </span>
  );
}
