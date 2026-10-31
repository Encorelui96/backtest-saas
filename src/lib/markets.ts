/**
 * Markets beyond Binance crypto: forex majors and gold from Twelve Data, the
 * Nasdaq 100 future (NQ) from Databento, and QQQ, the fund that tracks the
 * Nasdaq 100, from Twelve Data. Any other symbol is a Binance pair.
 */

export interface Market {
  symbol: string;
  label: string;
  kind: "forex" | "metal" | "index";
  source: "twelvedata" | "databento";
  /** Symbol at the source. */
  feed: string;
}

export const MARKETS: Market[] = [
  { symbol: "EURUSD", label: "Euro / Dollar", kind: "forex", source: "twelvedata", feed: "EUR/USD" },
  { symbol: "GBPUSD", label: "Livre / Dollar", kind: "forex", source: "twelvedata", feed: "GBP/USD" },
  { symbol: "USDJPY", label: "Dollar / Yen", kind: "forex", source: "twelvedata", feed: "USD/JPY" },
  { symbol: "USDCHF", label: "Dollar / Franc suisse", kind: "forex", source: "twelvedata", feed: "USD/CHF" },
  { symbol: "AUDUSD", label: "Dollar australien / Dollar", kind: "forex", source: "twelvedata", feed: "AUD/USD" },
  { symbol: "USDCAD", label: "Dollar / Dollar canadien", kind: "forex", source: "twelvedata", feed: "USD/CAD" },
  { symbol: "EURGBP", label: "Euro / Livre", kind: "forex", source: "twelvedata", feed: "EUR/GBP" },
  { symbol: "EURJPY", label: "Euro / Yen", kind: "forex", source: "twelvedata", feed: "EUR/JPY" },
  { symbol: "GBPJPY", label: "Livre / Yen", kind: "forex", source: "twelvedata", feed: "GBP/JPY" },
  { symbol: "XAUUSD", label: "Or (once en dollars)", kind: "metal", source: "twelvedata", feed: "XAU/USD" },
  // The CME future, front month rolled over continuously: the ~28 000 level, trading nearly 24 hours a day.
  { symbol: "NAS100", label: "Nasdaq 100 (future NQ, presque 24h/24)", kind: "index", source: "databento", feed: "NQ.c.0" },
  { symbol: "QQQ", label: "Nasdaq 100 via QQQ (heures de bourse US : 15h30-22h à Paris)", kind: "index", source: "twelvedata", feed: "QQQ" },
];

const BY_SYMBOL = new Map(MARKETS.map((m) => [m.symbol, m]));

export function market(symbol: string): Market | undefined {
  return BY_SYMBOL.get(symbol.toUpperCase());
}

const NEW_YORK = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", hourCycle: "h23" });

/**
 * Forex, gold and the Nasdaq stop from Friday 17:00 to Sunday 17:00 New York
 * time. Twelve Data still sends bars then, with made-up wicks and no volume:
 * a backtest must never see them.
 */
export function isWeekendClose(t: number) {
  const parts = NEW_YORK.formatToParts(new Date(t));
  const day = parts.find((p) => p.type === "weekday")!.value;
  const hour = Number(parts.find((p) => p.type === "hour")!.value);
  return day === "Sat" || (day === "Fri" && hour >= 17) || (day === "Sun" && hour < 17);
}

/** Crypto pairs trade around the clock on Binance, with a free live stream. */
export function isCrypto(symbol: string) {
  return !BY_SYMBOL.has(symbol.toUpperCase());
}
