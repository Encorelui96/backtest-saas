"use client";

import { useEffect, useState } from "react";
import { Link } from "@/lib/client/i18n";
import { api } from "@/lib/client/api";
import { pct, price, tone } from "@/lib/client/format";
import type { CandleRow } from "@/lib/types";

/**
 * A scrolling strip of prices that mixes markets, to show at a glance that
 * Backtest Lab is not only about crypto. Crypto, gold and the euro stream live
 * from Binance (spot, and its gold perpetual); the Nasdaq future comes from our
 * own candles, a few minutes behind.
 */

interface Item {
  key: string;
  label: string;
  name: string;
  feed: "spot" | "futures" | "candles";
}

const ITEMS: Item[] = [
  { key: "BTCUSDT", label: "BTC/USDT", name: "Bitcoin", feed: "spot" },
  { key: "XAUUSDT", label: "XAU/USD", name: "Or", feed: "futures" },
  { key: "EURUSDT", label: "EUR/USD", name: "Euro", feed: "spot" },
  { key: "NAS100", label: "NAS100", name: "Nasdaq 100", feed: "candles" },
  { key: "ETHUSDT", label: "ETH/USDT", name: "Ether", feed: "spot" },
  { key: "SOLUSDT", label: "SOL/USDT", name: "Solana", feed: "spot" },
];

const SPOT_WS = process.env.NEXT_PUBLIC_BINANCE_WS_URL ?? "wss://data-stream.binance.vision";
const FUTURES_WS = "wss://fstream.binance.com";
const SPOT_REST = "https://data-api.binance.vision";
const FUTURES_REST = "https://fapi.binance.com";

type Quote = { c: number; p: number; delayed?: boolean };

function stream(base: string, symbols: string[], onQuote: (s: string, q: Quote) => void) {
  const ws = new WebSocket(`${base}/stream?streams=${symbols.map((s) => `${s.toLowerCase()}@miniTicker`).join("/")}`);
  ws.onmessage = (ev) => {
    const d = JSON.parse(ev.data).data;
    if (d) onQuote(d.s, { c: +d.c, p: ((+d.c - +d.o) / +d.o) * 100 });
  };
  return ws;
}

export function TickerTape() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  useEffect(() => {
    const put = (s: string, q: Quote) => setQuotes((all) => ({ ...all, [s]: q }));

    // A first snapshot, so a market that is not trading right now (gold at the weekend) still shows its last price.
    const snapshot = (url: string) =>
      fetch(url)
        .then((r) => r.json())
        .then((rows: { symbol: string; lastPrice: string; priceChangePercent: string }[] | { symbol: string; lastPrice: string; priceChangePercent: string }) => {
          for (const t of Array.isArray(rows) ? rows : [rows]) put(t.symbol, { c: +t.lastPrice, p: +t.priceChangePercent });
        })
        .catch(() => {});
    const spot = ITEMS.filter((i) => i.feed === "spot").map((i) => i.key);
    snapshot(`${SPOT_REST}/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(spot))}`);
    for (const item of ITEMS.filter((i) => i.feed === "futures")) snapshot(`${FUTURES_REST}/fapi/v1/ticker/24hr?symbol=${item.key}`);

    const sockets = [
      stream(SPOT_WS, ITEMS.filter((i) => i.feed === "spot").map((i) => i.key), put),
      stream(FUTURES_WS, ITEMS.filter((i) => i.feed === "futures").map((i) => i.key), put),
    ];

    // The Nasdaq future: last hourly close against the close about a day earlier.
    const loadCandles = () => {
      const to = Date.now();
      for (const item of ITEMS.filter((i) => i.feed === "candles")) {
        api<CandleRow[]>(`/api/candles?symbol=${item.key}&interval=1h&from=${to - 5 * 86_400_000}&to=${to}`)
          .then((rows) => {
            const last = rows.at(-1);
            if (!last) return;
            const dayAgo = rows.findLast((r) => r.t <= last.t - 23 * 3_600_000) ?? rows[0];
            put(item.key, { c: last.c, p: ((last.c - dayAgo.c) / dayAgo.c) * 100, delayed: true });
          })
          .catch(() => {});
      }
    };
    loadCandles();
    const timer = setInterval(loadCandles, 5 * 60_000);
    return () => {
      sockets.forEach((ws) => ws.close());
      clearInterval(timer);
    };
  }, []);

  const cell = (item: Item, copy: number) => {
    const q = quotes[item.key];
    return (
      <Link
        key={`${copy}-${item.key}`}
        href="/live"
        aria-hidden={copy > 0}
        tabIndex={copy > 0 ? -1 : undefined}
        className="flex shrink-0 items-center gap-3 border-r border-line px-4 py-2.5 hover:bg-panel-2"
      >
        <div>
          <div className="num text-sm font-semibold">{item.label}</div>
          <div className="text-[11px] text-muted">{item.name}</div>
        </div>
        <div className="text-right">
          <div className="num text-sm">{q ? price(q.c) : "—"}</div>
          <div className={`num text-[11px] ${tone(q?.p)}`}>
            {q ? `${pct(q.p, 2)}${q.delayed ? " · différé" : ""}` : "connexion…"}
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="ticker relative -mx-3 overflow-hidden border-y border-line bg-panel sm:mx-0 sm:rounded-lg sm:border">
      {/* Two copies side by side: when the first has scrolled out, the second is exactly where it started. */}
      <div className="ticker-track flex w-max">
        {[0, 1].map((copy) => ITEMS.map((item) => cell(item, copy)))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-panel to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-panel to-transparent" />
    </div>
  );
}
