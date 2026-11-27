/**
 * Plain text search for the Learn page and the indicator picker: no accents,
 * no case, every word of the query must appear somewhere. Pure, so it runs in
 * the browser on what the page already has.
 */

/** Lower case, without accents or ligatures, apostrophes made plain. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[\u2019\u2018`]/g, "'")
    .replace(/[\u2212\u2013\u2014]/g, "-");
}

/** The words of a query, folded; empty when there is nothing to look for. */
export function queryWords(query: string): string[] {
  return fold(query)
    .split(/[\s,;:!?.()«»"]+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

/**
 * How well a set of texts matches the words: 0 when one word is missing, more
 * when the words are in the title, at the start of a word, or the title starts
 * with the query. `title` counts first, the rest only as text.
 */
export function matchScore(words: string[], title: string, ...rest: (string | undefined)[]): number {
  if (!words.length) return 0;
  const t = fold(title);
  const body = fold(rest.filter(Boolean).join(" "));
  let score = 0;
  for (const w of words) {
    const inTitle = t.indexOf(w);
    const inBody = body.indexOf(w);
    if (inTitle < 0 && inBody < 0) return 0;
    if (inTitle >= 0) score += startsWord(t, inTitle) ? 6 : 4;
    else score += startsWord(body, inBody) ? 2 : 1;
  }
  const whole = words.join(" ");
  if (t === whole) score += 10;
  else if (t.startsWith(whole)) score += 5;
  return score;
}

const startsWord = (text: string, at: number) => at === 0 || /[^a-z0-9]/.test(text[at - 1]);

/**
 * Where the words appear in a text, as [start, end) ranges on the original
 * text, merged and sorted: for highlighting. Folding keeps one character for
 * one in this alphabet, so positions line up.
 */
export function highlights(text: string, words: string[]): [number, number][] {
  const folded = fold(text);
  if (folded.length !== text.length) return [];
  const ranges: [number, number][] = [];
  for (const w of words) {
    let at = folded.indexOf(w);
    while (at >= 0 && w) {
      ranges.push([at, at + w.length]);
      at = folded.indexOf(w, at + w.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}
