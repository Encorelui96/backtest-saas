"use client";

import { useState, type CSSProperties } from "react";
import { useT } from "@/lib/client/i18n";
import { formatLocale, num, r, tone } from "@/lib/client/format";
import { WEEK_DAYS, localTime, type JournalTrade } from "@/lib/journal";
import { calendarMonth, filterTrades, shiftMonth, statTrades, type CalendarDay, type TradeFilter } from "@/lib/journal-stats";
import { Button, Card, Stat } from "./ui";
import { SideBadge, amount, deviceTimeZone, type JournalData } from "./journal-shared";
import { FilterBar, setupLabel } from "./journal-filters";

/** "novembre 2026", "jeudi 27 novembre": the page's language, read as a calendar date (no time zone shift). */
function monthName(month: string) {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString(formatLocale(), { month: "long", year: "numeric", timeZone: "UTC" });
}

function dayName(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(formatLocale(), { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/**
 * A day's color carries its sign and, by its strength, its size against the month's biggest day.
 * The signed R written in the cell, in the text color for contrast, says the same thing for those who can't tell green from red.
 */
function dayStyle(d: CalendarDay, biggest: number): CSSProperties | undefined {
  if (!d.trades.length || d.r === 0 || biggest === 0) return undefined;
  const strength = Math.round(14 + 30 * Math.min(1, Math.abs(d.r) / biggest));
  return { backgroundColor: `color-mix(in srgb, var(${d.r > 0 ? "--up" : "--down"}) ${strength}%, transparent)` };
}

/** One month, a cell per day with its R and its trades, the week's total at the end of each row. */
export function JournalCalendar({
  data,
  filter,
  onFilter,
  now,
  onEdit,
}: {
  data: JournalData;
  filter: TradeFilter;
  onFilter: (f: TradeFilter) => void;
  /** When the calendar was opened: its first month and "today". */
  now: number;
  onEdit: (t: JournalTrade) => void;
}) {
  const tl = useT();
  const today = localTime(now, deviceTimeZone()).day;
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const trades = filterTrades(statTrades(data.trades, data.accounts), filter, false);
  const m = calendarMonth(month, trades);
  const days = m.weeks.flatMap((w) => w.days);
  const biggest = Math.max(0, ...days.map((d) => Math.abs(d.r)));
  const chosen = days.find((d) => d.day === selected && d.inMonth) ?? null;
  const byId = new Map(data.trades.map((t) => [t.id, t]));
  const setupName = setupLabel(data, tl);
  const open = data.trades.filter((t) => !t.close).length;

  const go = (by: number) => {
    setMonth(shiftMonth(month, by));
    setSelected(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <FilterBar data={data} filter={filter} onChange={onFilter} period={false} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => go(-1)} aria-label={tl("Mois précédent")}>
          ‹
        </Button>
        <h2 className="min-w-40 text-center text-base font-semibold first-letter:uppercase">{monthName(month)}</h2>
        <Button variant="ghost" onClick={() => go(1)} aria-label={tl("Mois suivant")}>
          ›
        </Button>
        {month !== today.slice(0, 7) && (
          <button
            onClick={() => {
              setMonth(today.slice(0, 7));
              setSelected(null);
            }}
            className="text-sm text-accent hover:underline"
          >
            {tl("Revenir à ce mois-ci")}
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label={tl("Résultat du mois")} value={r(m.r, 1)} className={tone(m.r)} term="r" />
        <Stat label={tl("Trades clôturés")} value={m.trades} hint={open ? tl("{0} en cours", [open]) : undefined} term="trades" />
        <Stat label={tl("Jours gagnants")} value={m.activeDays ? `${m.greenDays} / ${m.activeDays}` : "—"} hint={m.redDays ? tl("{0} jours perdants", [m.redDays]) : undefined} />
      </div>

      <Card>
        <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,1.1fr)] gap-1 text-center">
          {WEEK_DAYS.map((w) => (
            <div key={w} className="pb-1 text-[11px] text-muted">
              {tl(w)}
            </div>
          ))}
          <div className="pb-1 text-[11px] text-muted">{tl("Semaine")}</div>

          {m.weeks.map((week) => (
            <div key={week.days[0].day} className="contents">
              {week.days.map((d) => {
                if (!d.inMonth) return <div key={d.day} className="min-h-14 sm:min-h-20" aria-hidden />;
                const label = d.trades.length ? tl("{0} : {1}", [dayName(d.day), `${r(d.r, 1)} · ${tl(d.trades.length > 1 ? "{0} trades" : "{0} trade", [d.trades.length])}`]) : dayName(d.day);
                return (
                  <button
                    key={d.day}
                    onClick={() => setSelected(d.day === selected ? null : d.day)}
                    aria-pressed={d.day === selected}
                    aria-label={label}
                    title={label}
                    style={dayStyle(d, biggest)}
                    className={`relative flex min-h-14 flex-col items-center justify-center rounded-md border px-0.5 py-1 sm:min-h-20 ${
                      d.trades.length ? "border-line" : "border-line/40 bg-panel-2/30"
                    } ${d.day === selected ? "ring-2 ring-accent" : d.day === today ? "ring-1 ring-accent/60" : ""} hover:border-accent`}
                  >
                    <span className={`absolute top-1 left-1.5 text-[10px] sm:text-[11px] ${d.day === today ? "font-semibold text-accent" : "text-muted"}`}>{d.date}</span>
                    {d.trades.length > 0 && (
                      <>
                        <span className="num mt-2 text-[11px] font-semibold text-fg sm:text-sm">{`${d.r > 0 ? "+" : ""}${num(d.r, 1)}`}</span>
                        <span className="text-[10px] text-muted">
                          {d.trades.length}
                          <span className="hidden sm:inline"> {tl(d.trades.length > 1 ? "trades" : "trade")}</span>
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
              <div
                className="flex min-h-14 flex-col items-center justify-center rounded-md bg-panel-2/60 px-0.5 sm:min-h-20"
                aria-label={week.trades ? tl("Semaine : {0}", [`${r(week.r, 1)} · ${tl(week.trades > 1 ? "{0} trades" : "{0} trade", [week.trades])}`]) : undefined}
              >
                {week.trades > 0 ? (
                  <>
                    <span className={`num text-[11px] font-semibold sm:text-sm ${tone(week.r)}`}>{`${week.r > 0 ? "+" : ""}${num(week.r, 1)}`}</span>
                    <span className="text-[10px] text-muted">
                      {week.trades}
                      <span className="hidden sm:inline"> {tl(week.trades > 1 ? "trades" : "trade")}</span>
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] text-muted">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">{tl("En R, frais déduits : un trade compte le jour où il est clôturé. Touche un jour pour voir ses trades.")}</p>
      </Card>

      {chosen && (
        <Card title={<span className="first-letter:uppercase">{dayName(chosen.day)}</span>}>
          {chosen.trades.length ? (
            <ul className="flex flex-col divide-y divide-line/60">
              {chosen.trades.map((s) => {
                const t = byId.get(s.id);
                return (
                  <li key={s.id}>
                    <button onClick={() => t && onEdit(t)} className="flex w-full items-center justify-between gap-3 py-2 text-left hover:bg-panel-2/50">
                      <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{s.market}</span>
                        <SideBadge side={s.side} />
                        <span className="text-xs text-muted">{setupName(s.setupId, s.offPlan)}</span>
                        {s.planFollowed === false && <span className="text-xs text-down">{tl("hors plan")}</span>}
                      </span>
                      <span className="flex shrink-0 flex-col items-end">
                        <span className={`num font-semibold ${tone(s.r)}`}>{r(s.r)}</span>
                        <span className={`num text-xs ${tone(s.amount)}`}>{amount(s.amount, s.currency, true)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">{tl("Aucun trade clôturé ce jour-là.")}</p>
          )}
        </Card>
      )}
    </div>
  );
}
