/** Names and search for the backtest lists: pure, so the server and the browser follow the same rules. */

export const BACKTEST_NAME_MAX = 80;

/** A list shows this many results at most, newest first. */
export const BACKTEST_LIST_LIMIT = 50;

/** A search is a few words: the rest of a long paste is ignored. */
const MAX_WORDS = 6;

/** A name as it is stored: single spaces, within the limit. Empty means "back to the strategy's name". */
export function cleanBacktestName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, BACKTEST_NAME_MAX).trim() || null;
}

const ACCENTS = "àâäéèêëîïôöùûüç";
const PLAIN = "aaaeeeeiioouuuc";

/** The same folding in SQL, for translate(): the slash has no counterpart, so it disappears. */
export const SEARCH_FROM = `${ACCENTS}${ACCENTS.toUpperCase()}/`;
export const SEARCH_TO = `${PLAIN}${PLAIN}`;

/** Lower case, no accents, no slash: "eur/usd" finds EURUSD and "strategie" finds "stratégie". */
function fold(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replaceAll("/", "");
}

function searchWords(search: string) {
  return fold(search).split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
}

/** LIKE patterns for a search, one per word: every word must appear. */
export function searchPatterns(search: string) {
  return searchWords(search).map((w) => `%${w.replace(/[\\%_]/g, "\\$&")}%`);
}

/** The same rule for a list already in the browser. */
export function matchesSearch(text: string, search: string) {
  const folded = fold(text);
  return searchWords(search).every((w) => folded.includes(w));
}
