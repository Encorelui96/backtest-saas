"use client";

import { useState } from "react";
import { Link } from "@/lib/client/i18n";
import { setPreferredMarket, setWelcomeDone } from "@/lib/client/preferences";
import { setLevel, type Level } from "./learn";
import { Card } from "./ui";

const LEVELS: { id: Level; label: string; hint: string }[] = [
  { id: "beginner", label: "Je débute", hint: "Les étapes guidées et un « ? » à côté de chaque mot." },
  { id: "expert", label: "J'ai l'habitude", hint: "Tous les réglages et toutes les statistiques." },
];

const MARKETS = [
  { symbol: "BTCUSDT", label: "Crypto", hint: "Bitcoin, Ether…" },
  { symbol: "EURUSD", label: "Forex", hint: "EUR/USD et 8 autres paires" },
  { symbol: "XAUUSD", label: "Or", hint: "XAU/USD" },
  { symbol: "NAS100", label: "Nasdaq", hint: "Nasdaq 100, presque 24 h/24" },
];

function Choice({ active, label, hint, onClick }: { active: boolean; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start rounded-lg border px-3 py-2.5 text-left ${active ? "border-accent bg-accent/15" : "border-line hover:border-accent/60"}`}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-[11px] text-muted">{hint}</span>
    </button>
  );
}

/** Two questions for a new account: they set the display level and the market the first strategy starts on. */
export function Welcome({ onDone }: { onDone: () => void }) {
  const [level, setChosenLevel] = useState<Level | null>(null);
  const [market, setMarket] = useState<string | null>(null);

  const finish = () => {
    if (level) setLevel(level);
    if (market) setPreferredMarket(market);
    setWelcomeDone();
    onDone();
  };

  return (
    <Card title="Bienvenue ! Deux questions pour adapter Backtest Lab">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm">1. Tu as déjà fait du trading ?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {LEVELS.map((l) => (
              <Choice key={l.id} active={level === l.id} label={l.label} hint={l.hint} onClick={() => setChosenLevel(l.id)} />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm">2. Quel marché t&apos;intéresse le plus ?</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MARKETS.map((m) => (
              <Choice key={m.symbol} active={market === m.symbol} label={m.label} hint={m.hint} onClick={() => setMarket(m.symbol)} />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/strategies/new"
            onClick={finish}
            aria-disabled={!level || !market}
            className={`rounded-md bg-accent px-4 py-2 text-sm font-medium text-white ${level && market ? "hover:brightness-110" : "pointer-events-none opacity-50"}`}
          >
            Lancer mon premier test
          </Link>
          <button type="button" onClick={finish} className="text-xs text-muted hover:text-fg">
            Passer
          </button>
        </div>
        <p className="text-[11px] text-muted">Tu pourras changer d&apos;avis à tout moment : bouton Débutant / Expert en haut, et choix du marché dans chaque stratégie.</p>
      </div>
    </Card>
  );
}
