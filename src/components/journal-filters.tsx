"use client";

import { useT } from "@/lib/client/i18n";
import { NO_FILTER, PERIODS, PERIOD_LABELS, type Period, type TradeFilter } from "@/lib/journal-stats";
import { deviceTimeZone, type JournalData } from "./journal-shared";

/**
 * The journal's filters, in one row above what they scope: account, period, setup and plan.
 * The same choice follows from the trades to the calendar and the dashboard.
 */
export function FilterBar({
  data,
  filter,
  onChange,
  period = true,
}: {
  data: JournalData;
  filter: TradeFilter;
  onChange: (f: TradeFilter) => void;
  /** The calendar has its own months: no period there. */
  period?: boolean;
}) {
  const tl = useT();
  // Archived setups stay in the list while they have trades: their history is still worth reading.
  const used = new Set(data.trades.map((t) => t.setupId));
  const setups = data.setups.filter((s) => !s.archived || used.has(s.id));
  const active = filter.accountId || filter.setupId || filter.plan || (period && filter.period !== "all");
  const select = "max-w-full min-w-0 text-sm";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {data.accounts.length > 1 && (
        <select value={filter.accountId} onChange={(e) => onChange({ ...filter, accountId: e.target.value })} className={select} aria-label={tl("Compte")}>
          <option value="">{tl("Tous les comptes")}</option>
          {data.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
      {period && (
        <select
          value={filter.period}
          // The period is read from the moment it is picked: "this month" stays this month until the next pick.
          onChange={(e) => onChange({ ...filter, period: e.target.value as Period, now: Date.now(), timeZone: deviceTimeZone() })}
          className={select}
          aria-label={tl("Période")}
        >
          {PERIODS.map((p) => (
            <option key={p} value={p}>
              {tl(PERIOD_LABELS[p])}
            </option>
          ))}
        </select>
      )}
      {setups.length > 0 && (
        <select value={filter.setupId} onChange={(e) => onChange({ ...filter, setupId: e.target.value })} className={select} aria-label={tl("Configuration")}>
          <option value="">{tl("Toutes les configurations")}</option>
          {setups.map((s) => (
            <option key={s.id} value={s.id}>
              {s.archived ? tl("{0} (archivée)", [s.name]) : s.name}
            </option>
          ))}
          <option value="off">{tl("Hors configuration")}</option>
        </select>
      )}
      <select value={filter.plan} onChange={(e) => onChange({ ...filter, plan: e.target.value as TradeFilter["plan"] })} className={select} aria-label={tl("Respect du plan")}>
        <option value="">{tl("Dans et hors plan")}</option>
        <option value="in">{tl("Dans le plan")}</option>
        <option value="out">{tl("Hors plan")}</option>
      </select>
      {active && (
        <button
          onClick={() => onChange({ ...NO_FILTER, period: period ? "all" : filter.period, now: filter.now, timeZone: filter.timeZone })}
          className="text-sm text-accent hover:underline"
        >
          {tl("Effacer les filtres")}
        </button>
      )}
    </div>
  );
}

/** What a setup key of the statistics is called: its name, "Off plan" or "No setup". */
export function setupLabel(data: JournalData, tl: (s: string) => string) {
  const names = new Map(data.setups.map((s) => [s.id, s.name]));
  return (key: string | null, offPlan = key === "off") => (key && key !== "off" && key !== "none" ? (names.get(key) ?? "—") : offPlan ? tl("Hors plan") : tl("Sans configuration"));
}
