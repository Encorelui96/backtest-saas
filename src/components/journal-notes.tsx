"use client";

import { useState } from "react";
import { useT } from "@/lib/client/i18n";
import { api } from "@/lib/client/api";
import { formatLocale, r, tone } from "@/lib/client/format";
import { localTime } from "@/lib/journal";
import { statTrades, summaryOf, type StatTrade } from "@/lib/journal-stats";
import { Alert, Button, Card } from "./ui";
import { SideBadge, amount, deviceTimeZone, type JournalData } from "./journal-shared";
import { ImageStrip, Lightbox, imageUrl } from "./journal-images";

/** "jeudi 27 novembre 2026": a calendar day in the page's language. */
export function longDay(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(formatLocale(), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** The day's closed trades and what they add up to, as the top of the day's note. */
function DayReview({ trades }: { trades: StatTrade[] }) {
  const tl = useT();
  if (!trades.length) return <p className="text-xs text-muted">{tl("Aucun trade clôturé ce jour-là.")}</p>;
  const s = summaryOf(trades);
  return (
    <div className="flex flex-col gap-1 text-sm">
      {trades.map((t, i) => (
        <span key={t.id} className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">{tl("Trade {0}", [i + 1])}</span>
          <span className="font-medium">{t.market}</span>
          <SideBadge side={t.side} />
          <span className={`num ${tone(t.r)}`}>{r(t.r)}</span>
          <span className={`num text-xs ${tone(t.amount)}`}>{amount(t.amount, t.currency, true)}</span>
          {t.planFollowed === false && <span className="text-xs text-down">{tl("hors plan")}</span>}
        </span>
      ))}
      <span className="font-medium">
        {tl("Bilan : {0}", [r(s.totalR)])}
        {s.amount && <span className={`num ${tone(s.amount.value)}`}> ({amount(s.amount.value, s.amount.currency, true)})</span>}
      </span>
    </div>
  );
}

/** The day's closed trades, by the day each one closed on. */
function tradesOf(data: JournalData, day: string) {
  return statTrades(data.trades, data.accounts).filter((t) => t.day === day);
}

/** Writes a day's note: its review, its lessons, the rules decided, with its charts. */
export function NoteEditor({ data, day, onChanged, review = true }: { data: JournalData; day: string; onChanged: () => void; review?: boolean }) {
  const tl = useT();
  const note = data.notes.find((n) => n.day === day);
  const [text, setText] = useState(note?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = text.trim() !== (note?.text ?? "");

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      onChanged();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {review && <DayReview trades={tradesOf(data, day)} />}
      <textarea
        rows={6}
        maxLength={10_000}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        placeholder={tl("Le bilan de ta séance : ce qui a marché, ce qui n'a pas marché, la règle que tu te fixes pour demain.")}
        aria-label={tl("Note du {0}", [longDay(day)])}
      />
      <ImageStrip
        kept={note?.images ?? []}
        quota={data.plan.images}
        busy={busy}
        onPick={(list) => run(async () => {
          for (const image of list) await api("/api/journal/images", { json: { image, day } });
        })}
        onRemoveKept={(id) => {
          if (confirm(tl("Supprimer ce graphique du journal ? C'est définitif."))) run(() => api(`/api/journal/images/${id}`, { method: "DELETE" }));
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={async () => {
            if (await run(() => api(`/api/journal/notes/${day}`, { method: "PUT", json: { text } }))) setSaved(true);
          }}
          disabled={busy || !dirty}
        >
          {tl("Enregistrer la note")}
        </Button>
        {saved && !dirty && <span className="text-xs text-up">✓ {tl("Note enregistrée")}</span>}
        {dirty && <span className="text-xs text-muted">{tl("Modifications pas encore enregistrées")}</span>}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

/** One note per day: today's (or the day picked) to write, the earlier ones to read again. */
export function JournalNotes({ data, now, onChanged }: { data: JournalData; now: number; onChanged: () => void }) {
  const tl = useT();
  const today = localTime(now, deviceTimeZone()).day;
  const [day, setDay] = useState(today);
  const [open, setOpen] = useState<string | null>(null);
  const others = data.notes.filter((n) => n.day !== day);

  return (
    <div className="flex flex-col gap-4">
      <Card
        title={<span className="first-letter:uppercase">{day === today ? tl("Note du jour") : longDay(day)}</span>}
        actions={
          <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="text-sm" aria-label={tl("Jour de la note")} />
        }
      >
        <NoteEditor key={day} data={data} day={day} onChanged={onChanged} />
      </Card>

      {others.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{tl("Notes précédentes")}</h2>
          {others.map((n) => (
            <Card
              key={n.day}
              title={<span className="first-letter:uppercase">{longDay(n.day)}</span>}
              actions={
                <button
                  onClick={() => {
                    setDay(n.day);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="text-xs text-accent hover:underline"
                >
                  {tl("Modifier")}
                </button>
              }
            >
              <div className="flex flex-col gap-3">
                <DayReview trades={tradesOf(data, n.day)} />
                {n.text && <p className="text-sm whitespace-pre-wrap">{n.text}</p>}
                {n.images.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {n.images.map((id) => (
                      <button key={id} onClick={() => setOpen(imageUrl(id))} className="h-16 w-24 overflow-hidden rounded border border-line" aria-label={tl("Agrandir le graphique")}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- the journal's own route, behind the sign-in */}
                        <img src={imageUrl(id)} alt="" className="h-full w-full object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </section>
      )}
      {open && <Lightbox src={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
