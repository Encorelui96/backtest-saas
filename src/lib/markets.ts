/**
 * Markets beyond Binance crypto: forex majors, gold and the Nasdaq 100, with
 * candles from Twelve Data. Any other symbol is a Binance pair.
 */

export interface Market {
  symbol: string;
  label: string;
  kind: "forex" | "metal" | "index";
  /** Symbol at Twelve Data. */
  feed: string;
}

export const MARKETS: Market[] = [
  { symbol: "EURUSD", label: "Euro / Dollar", kind: "forex", feed: "EUR/USD" },
  { symbol: "GBPUSD", label: "Livre / Dollar", kind: "forex", feed: "GBP/USD" },
  { symbol: "USDJPY", label: "Dollar / Yen", kind: "forex", feed: "USD/JPY" },
  { symbol: "USDCHF", label: "Dollar / Franc suisse", kind: "forex", feed: "USD/CHF" },
  { symbol: "AUDUSD", label: "Dollar australien / Dollar", kind: "forex", feed: "AUD/USD" },
  { symbol: "USDCAD", label: "Dollar / Dollar canadien", kind: "forex", feed: "USD/CAD" },
  { symbol: "EURGBP", label: "Euro / Livre", kind: "forex", feed: "EUR/GBP" },
  { symbol: "EURJPY", label: "Euro / Yen", kind: "forex", feed: "EUR/JPY" },
  { symbol: "GBPJPY", label: "Livre / Yen", kind: "forex", feed: "GBP/JPY" },
  { symbol: "XAUUSD", label: "Or (once en dollars)", kind: "metal", feed: "XAU/USD" },
  { symbol: "NAS100", label: "Nasdaq 100", kind: "index", feed: "NDX" },
];

const BY_SYMBOL = new Map(MARKETS.map((m) => [m.symbol, m]));

export function market(symbol: string): Market | undefined {
  return BY_SYMBOL.get(symbol.toUpperCase());
}

/** Crypto pairs trade around the clock on Binance, with a free live stream. */
export function isCrypto(symbol: string) {
  return !BY_SYMBOL.has(symbol.toUpperCase());
}
