"use client";

import { useT } from "@/lib/client/i18n";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { MARKETS, market } from "@/lib/markets";
import { Alert, Button } from "./ui";

/**
 * Picks a market by family: big tappable cards that scroll sideways on phones
 * and wrap on larger screens, plus a search for any other Binance pair.
 */

type Family = "crypto" | "forex" | "metal" | "index";

const FAMILIES: { id: Family; label: string }[] = [
  { id: "crypto", label: "Crypto" },
  { id: "forex", label: "Forex" },
  { id: "metal", label: "Or" },
  { id: "index", label: "Nasdaq" },
];

const CRYPTO: { symbol: string; label: string }[] = [
  { symbol: "BTCUSDT", label: "Bitcoin" },
  { symbol: "ETHUSDT", label: "Ether" },
  { symbol: "SOLUSDT", label: "Solana" },
  { symbol: "BNBUSDT", label: "BNB" },
  { symbol: "XRPUSDT", label: "XRP" },
  { symbol: "DOGEUSDT", label: "Dogecoin" },
  { symbol: "ADAUSDT", label: "Cardano" },
  { symbol: "AVAXUSDT", label: "Avalanche" },
  { symbol: "LINKUSDT", label: "Chainlink" },
  { symbol: "LTCUSDT", label: "Litecoin" },
];

const OTHERS = MARKETS;

function familyOf(symbol: string): Family {
  return market(symbol)?.kind ?? "crypto";
}

function cardsOf(family: Family) {
  if (family === "crypto") return CRYPTO;
  return OTHERS.filter((m) => m.kind === family).map((m) => ({ symbol: m.symbol, label: m.label }));
}

/** "EURUSD" → "EUR/USD", "BTCUSDT" → "BTC/USDT": easier to read on a card. */
function pretty(symbol: string) {
  const m = symbol.match(/^(.+?)(USDT|USDC|FDUSD|USD|EUR|GBP|JPY|CHF|CAD|BTC)$/);
  return m && market(symbol)?.kind !== "index" ? `${m[1]}/${m[2]}` : symbol;
}

export function MarketPicker({ value, onChange }: { value: string; onChange: (symbol: string) => void }) {
  const tl = useT();
  const [family, setFamily] = useState<Family>(() => familyOf(value));
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<string[]>([]);
  const cards = cardsOf(family);
  const current = market(value)?.label ?? CRYPTO.find((c) => c.symbol === value)?.label;

  // The tab follows the market when it changes from elsewhere (a template, the AI).
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setFamily(familyOf(value));
  }

  useEffect(() => {
    if (query.length < 2) return;
    const timer = setTimeout(() => {
      api<{ symbol: string }[]>(`/api/symbols?q=${encodeURIComponent(query.toUpperCase())}`)
        .then((rows) => setHits(rows.map((r) => r.symbol).filter((s) => !market(s)).slice(0, 8)))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-line p-0.5" role="tablist" aria-label={tl("Famille de marchés")}>
          {FAMILIES.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={family === f.id}
              onClick={() => setFamily(f.id)}
              className={`rounded-md px-3 py-1.5 text-sm ${family === f.id ? "bg-accent text-white" : "text-muted hover:text-fg"}`}
            >
              {tl(f.label)}
            </button>
          ))}
        </div>
        <span className="hidden truncate text-xs text-muted sm:block">
          {tl("Choisi : ")}<strong className="text-fg">{pretty(value)}</strong>
          {current ? ` · ${current}` : ""}
        </span>
      </div>

      {/* Phones: one row that scrolls sideways and snaps to each card. Larger screens: a wrapping grid. */}
      <div className="no-scrollbar -mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-5">
        {cards.map((c) => {
          const selected = c.symbol === value;
          return (
            <button
              key={c.symbol}
              onClick={() => onChange(c.symbol)}
              aria-pressed={selected}
              className={`min-w-[7.5rem] shrink-0 snap-start rounded-lg border px-3 py-2 text-left transition sm:min-w-0 ${
                selected ? "border-accent bg-accent/10" : "border-line bg-panel-2/50 hover:border-accent/60"
              }`}
            >
              <div className="num text-sm font-semibold">{pretty(c.symbol)}</div>
              <div className="truncate text-[11px] text-muted">{tl(c.label)}</div>
            </button>
          );
        })}
      </div>

      {family === "crypto" && (
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tl("Autre crypto : tape son nom (PEPE, SUI…)")}
            className="w-full"
            aria-label={tl("Chercher une autre crypto")}
          />
          {query.length >= 2 && hits.length > 0 && (
            <div className="absolute inset-x-0 top-full z-30 mt-1 flex flex-col overflow-hidden rounded-md border border-line bg-panel-2 shadow-xl">
              {hits.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    onChange(s);
                    setQuery("");
                    setHits([]);
                  }}
                  className="num px-3 py-2 text-left text-sm hover:bg-accent/10"
                >
                  {pretty(s)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {family === "index" && (
        <p className="text-[11px] text-muted">
          {tl("NAS100 : le future Nasdaq (vers 28 000), presque 24h/24 en semaine, avec plusieurs heures de retard dans le Live et les alertes. QQQ : le fonds qui suit le Nasdaq, coté seulement de 15h30 à 22h à Paris.")}</p>
      )}
      {family !== "crypto" && family !== "index" && <p className="text-[11px] text-muted">{tl("Fermé du vendredi soir au dimanche soir.")}</p>}
      <RequestMarket />
    </div>
  );
}

/** "This pair is missing": the requests are counted on the admin page, to choose which ones to add first. */
function RequestMarket() {
  const tl = useT();
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-accent hover:underline">
          {tl("Il te manque une paire ? Demande-la")}
        </button>
      </div>
    );
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/market-requests", { json: { market: wanted } });
      setWanted("");
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <input
          value={wanted}
          onChange={(e) => {
            setWanted(e.target.value);
            setSent(false);
          }}
          maxLength={40}
          placeholder={tl("Ex. : NZD/USD, pétrole, S&P 500")}
          aria-label={tl("Paire ou marché que tu voudrais")}
          className="min-w-0 flex-1"
          autoFocus
        />
        <Button type="submit" disabled={busy || wanted.trim().length < 2}>
          {tl("Envoyer")}
        </Button>
      </div>
      {sent && <p className="text-[11px] text-up">{tl("Merci, c'est noté. Tu peux en demander une autre.")}</p>}
      {error && <Alert tone="error">{error}</Alert>}
    </form>
  );
}
