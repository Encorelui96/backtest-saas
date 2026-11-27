"use client";

import { useT } from "@/lib/client/i18n";
import { formatLocale } from "@/lib/client/format";
import { closedResult, type JournalAccount, type JournalSetup, type JournalTrade, type OtherTrade, type Side } from "@/lib/journal";
import type { PlanId } from "@/lib/plans";

/** What GET /api/journal answers. */
export interface JournalData {
  accounts: JournalAccount[];
  setups: JournalSetup[];
  trades: JournalTrade[];
  plan: { id: PlanId; label: string; accounts: number };
}

/** Sent on the window each time the journal page loads its data, with the open trades as detail: the Journal tab's badge. */
export const JOURNAL_CHANGED = "backtest-lab:journal-changed";

/** An amount in the account's currency, without cents above 1 000. */
export function amount(x: number | null | undefined, currency: string, sign = false) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const whole = Math.abs(x) >= 1000 ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {};
  const s = x.toLocaleString(formatLocale(), { style: "currency", currency, ...whole });
  return sign && x > 0 ? `+${s}` : s;
}

/** "2026-11-27T09:30" for a datetime-local field, in the browser's time zone. */
export function toLocalInput(t: number) {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The datetime-local field's value back to milliseconds; null while incomplete. */
export function fromLocalInput(s: string): number | null {
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

export function SideBadge({ side }: { side: Side }) {
  const tl = useT();
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${side === "long" ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}>
      {side === "long" ? tl("Achat") : tl("Vente")}
    </span>
  );
}

/** A capture link: opened in a new tab, never loaded into the page. */
export function CaptureLink({ url, label }: { url: string | null; label: string }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-accent hover:underline">
      {label} ↗
    </a>
  );
}

/** A two- or three-way choice drawn as buttons, for the fields picked with a thumb. */
export function Choice<T extends string>({ value, options, onChange }: { value: T | null; options: { id: T; label: string; tone?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-medium ${value === o.id ? (o.tone ?? "border-accent bg-accent/15 text-fg") : "border-line text-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** What PUT /api/journal/accounts/[id] expects, from an account as the API sends it. */
export function accountBody(a: JournalAccount, patch: { archived?: boolean } = {}) {
  return {
    name: a.name,
    kind: a.kind,
    currency: a.currency,
    capital: a.capital,
    riskPct: a.riskPct,
    maxDailyLossR: a.maxDailyLossR,
    maxTradesDay: a.maxTradesDay,
    tradingDays: a.tradingDays,
    sessionStart: a.sessionStart,
    sessionEnd: a.sessionEnd,
    timeZone: a.timeZone,
    ...patch,
  };
}

/** This device's time zone, for a new account's plan. */
export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";
  } catch {
    return "Europe/Paris";
  }
}

/** The account's other trades as the plan's daily checks need them. */
export function otherTrades(data: JournalData, accountId: string, except: string | null, currency: string): OtherTrade[] {
  return data.trades
    .filter((t) => t.accountId === accountId && t.id !== except)
    .map((t) => ({ openedAt: t.openedAt, closedAt: t.close?.closedAt ?? null, r: closedResult(t, currency)?.r ?? null }));
}
