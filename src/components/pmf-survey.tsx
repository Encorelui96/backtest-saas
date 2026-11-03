"use client";

import { useT } from "@/lib/client/i18n";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Card } from "./ui";

const OPTIONS = [
  { id: "very", label: "Très déçu" },
  { id: "somewhat", label: "Un peu déçu" },
  { id: "not", label: "Pas déçu" },
] as const;

const SNOOZE_KEY = "backtest-lab:pmf-later";
const SNOOZE_MS = 7 * 86_400_000;

function snoozed() {
  try {
    return Date.now() - Number(localStorage.getItem(SNOOZE_KEY) ?? 0) < SNOOZE_MS;
  } catch {
    return false;
  }
}

/** One question, asked once the user has run a few backtests: the share of "very disappointed" measures product-market fit. */
export function PmfSurvey() {
  const tl = useT();
  const [hidden, setHidden] = useState(snoozed);
  const [answer, setAnswer] = useState<(typeof OPTIONS)[number]["id"] | null>(null);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (hidden) return null;
  if (sent) {
    return (
      <Card>
        <p className="text-sm">{tl("Merci ! Ta réponse aide à décider quoi améliorer en premier.")}</p>
      </Card>
    );
  }

  const send = async () => {
    if (!answer) return;
    setBusy(true);
    try {
      await api("/api/feedback", { json: { answer, comment } });
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  const later = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    } catch {}
    setHidden(true);
  };

  return (
    <Card title={tl("Une question rapide")}>
      <div className="flex flex-col gap-3">
        <p className="text-sm">{tl("Comment te sentirais-tu si tu ne pouvais plus utiliser Backtest Lab ?")}</p>
        <div className="flex flex-wrap gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setAnswer(o.id)}
              className={`rounded-full border px-3 py-1.5 text-sm ${answer === o.id ? "border-accent bg-accent/15 text-fg" : "border-line text-muted hover:text-fg"}`}
            >
              {tl(o.label)}
            </button>
          ))}
        </div>
        {answer && (
          <label className="flex flex-col gap-1 text-xs text-muted">
            {answer === "not" ? tl("Qu'est-ce qui manque pour que ça te serve vraiment ? (facultatif)") : tl("Qu'est-ce qui te manquerait le plus ? (facultatif)")}
            <textarea rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
        )}
        <div className="flex gap-2">
          <Button onClick={send} disabled={!answer || busy}>
            {tl("Envoyer")}</Button>
          <Button variant="ghost" onClick={later}>
            {tl("Plus tard")}</Button>
        </div>
      </div>
    </Card>
  );
}
