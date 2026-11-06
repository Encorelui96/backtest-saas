"use client";

import { useState, type InputHTMLAttributes } from "react";
import { useLang } from "@/lib/client/i18n";
import { localeTag } from "@/lib/i18n";
import { formatDraft, parseNumber, stepValue } from "@/lib/number-input";

type Common = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange" | "inputMode" | "step" | "min" | "max"> & {
  /** Whole numbers: digit keypad on phones, no decimal mark accepted. */
  integer?: boolean;
  /** How far the up and down arrow keys move the value (1 by default). */
  step?: number;
  /** Lowest value the arrow keys reach. What is typed is clamped by the caller. */
  min?: number;
};

type Props = Common &
  (
    | { nullable: true; value: number | null | undefined; onChange: (value: number | null) => void }
    | { nullable?: false; value: number; onChange: (value: number) => void }
  );

/**
 * A number field that can be emptied while typing and takes "0,5" as well as "0.5".
 * It keeps the typed text and passes the number up only once the text reads as one. On leaving the field,
 * unfinished text gives way to the last number, or to an empty field when the field allows no value.
 */
export function NumberInput({ value, onChange, nullable, integer = false, step = 1, min, onBlur, onKeyDown, ...rest }: Props) {
  const locale = localeTag(useLang());
  const current = value ?? null;
  const [draft, setDraft] = useState(() => formatDraft(current, locale));
  const [shown, setShown] = useState<number | null>(current);
  // Changed from outside (a preset, a template): show the new value, unless the text already reads as it.
  if (!Object.is(current, shown)) {
    setShown(current);
    if (parseNumber(draft, integer) !== current) setDraft(formatDraft(current, locale));
  }

  const commit = (n: number | null) => {
    if (n === current || (n === null && !nullable)) return;
    (onChange as (v: number | null) => void)(n);
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      autoComplete="off"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        commit(parseNumber(e.target.value, integer));
      }}
      onBlur={(e) => {
        setDraft(formatDraft(current, locale));
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
        e.preventDefault();
        const n = stepValue(parseNumber(draft, integer) ?? current, step, e.key === "ArrowUp" ? 1 : -1, min);
        setDraft(formatDraft(n, locale));
        commit(n);
      }}
    />
  );
}
