"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/client/i18n";
import { matchScore, queryWords } from "@/lib/learn/search";
import type { IndicatorName } from "@/lib/strategy/schema";

export interface IndicatorGroup {
  label: string;
  items: IndicatorName[];
}

/**
 * Other names traders type for an indicator, French and English: the search
 * finds "moving average", "bollinger" or "imbalance" even when the label says otherwise.
 */
const KEYWORDS: Partial<Record<IndicatorName, string>> = {
  close: "close prix price",
  open: "open prix price",
  high: "high prix price",
  low: "low prix price",
  number: "nombre number seuil threshold constante",
  sma: "sma simple moving average moyenne",
  ema: "ema exponential moving average exponentielle moyenne",
  wma: "wma weighted moving average ponderee moyenne",
  hma: "hma hull moving average moyenne",
  vwap: "vwap volume weighted average price",
  adx: "adx force de la tendance trend strength directional",
  plus_di: "di+ dmi directional",
  minus_di: "di- dmi directional",
  macd: "macd",
  supertrend: "supertrend atr tendance trend",
  psar: "psar sar parabolique parabolic stop and reverse",
  ichimoku_tenkan: "ichimoku tenkan sen conversion",
  ichimoku_kijun: "ichimoku kijun sen base",
  ichimoku_span_a: "ichimoku kumo cloud nuage senkou",
  ichimoku_span_b: "ichimoku kumo cloud nuage senkou",
  rsi: "rsi relative strength index force relative surachat survente overbought oversold",
  stoch_k: "stochastic stochastique",
  stoch_d: "stochastic stochastique",
  cci: "cci commodity channel index",
  williams_r: "williams percent r",
  roc: "roc rate of change momentum variation",
  ibs: "ibs internal bar strength",
  zscore: "z-score zscore ecart type standard deviation",
  atr: "atr average true range volatilite volatility",
  atr_percent: "atr average true range volatilite volatility pourcentage percent",
  bb_upper: "bollinger bands bandes",
  bb_middle: "bollinger bands bandes",
  bb_lower: "bollinger bands bandes",
  bb_percent: "bollinger %b percent b bandes",
  bb_width: "bollinger bandwidth largeur bandes",
  keltner_upper: "keltner channel canal",
  keltner_middle: "keltner channel canal",
  keltner_lower: "keltner channel canal",
  squeeze: "squeeze ttm compression bollinger keltner",
  chop: "choppiness chop range trend",
  volume: "volume",
  obv: "obv on balance volume",
  mfi: "mfi money flow index",
  highest: "highest high donchian breakout cassure plus haut",
  lowest: "lowest low donchian breakout cassure plus bas",
  day_open: "daily open jour",
  prev_day_high: "previous day high pdh yesterday veille",
  prev_day_low: "previous day low pdl yesterday veille",
  prev_day_close: "previous day close yesterday veille",
  prev_week_high: "previous week high pwh",
  prev_week_low: "previous week low pwl",
  range_high: "session range opening range plage horaire asia london",
  range_low: "session range opening range plage horaire asia london",
  pivot: "pivot points",
  pivot_r1: "pivot points resistance",
  pivot_s1: "pivot points support",
  pivot_r2: "pivot points resistance",
  pivot_s2: "pivot points support",
  cam_r3: "camarilla pivot resistance",
  cam_s3: "camarilla pivot support",
  cam_r4: "camarilla pivot resistance",
  cam_s4: "camarilla pivot support",
  inside_bar: "inside bar harami",
  engulfing: "engulfing avalement",
  pin_bar: "pin bar hammer marteau shooting star",
  narrow_range: "narrow range nr4 nr7",
  hour: "hour heure time session",
  minute: "minute time",
  weekday: "weekday day of week jour",
  swing_high: "swing high pivot sommet",
  swing_low: "swing low pivot creux",
  bos: "bos break of structure choch smc ict",
  structure: "market structure smc ict tendance",
  fvg: "fvg fair value gap imbalance smc ict",
  fvg_bull_top: "fvg fair value gap imbalance smc ict",
  fvg_bull_bottom: "fvg fair value gap imbalance smc ict",
  fvg_bear_top: "fvg fair value gap imbalance smc ict",
  fvg_bear_bottom: "fvg fair value gap imbalance smc ict",
  order_block: "ob order block smc ict",
  ob_bull_top: "ob order block smc ict",
  ob_bull_bottom: "ob order block smc ict",
  ob_bear_top: "ob order block smc ict",
  ob_bear_bottom: "ob order block smc ict",
  ha_open: "heikin ashi ha",
  ha_high: "heikin ashi ha",
  ha_low: "heikin ashi ha",
  ha_close: "heikin ashi ha",
  rsi_divergence: "divergence rsi",
  macd_divergence: "divergence macd",
  stoch_rsi_k: "stochastic rsi stochrsi",
  stoch_rsi_d: "stochastic rsi stochrsi",
  aroon_up: "aroon",
  aroon_down: "aroon",
  cmf: "cmf chaikin money flow",
};

/** The panel's size on a computer; on a phone it opens across the top of the screen. */
const PANEL_WIDTH = 300;
const PANEL_HEIGHT = 360;

/**
 * The indicator of an operand: a button showing the current one, which opens a
 * list with a search box. Typing filters the list (French and English names,
 * usual abbreviations); arrows and Enter pick, Escape closes.
 */
export function IndicatorPicker({
  value,
  groups,
  labels,
  isLocked,
  lockLabel,
  onChange,
}: {
  value: IndicatorName;
  groups: IndicatorGroup[];
  labels: Record<IndicatorName, string>;
  isLocked: (i: IndicatorName) => boolean;
  /** The offer that opens a locked indicator, shown next to it. */
  lockLabel: (i: IndicatorName) => string;
  onChange: (i: IndicatorName) => void;
}) {
  const tl = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const words = useMemo(() => queryWords(query), [query]);
  // The groups as shown: all of them with nothing typed, else the matches, best first, in one list.
  const shown = useMemo(() => {
    if (!words.length) return groups.map((g) => ({ label: g.label, items: g.items }));
    const found = groups
      .flatMap((g, gi) => g.items.map((i, ii) => ({ i, order: gi * 100 + ii, score: matchScore(words, tl(labels[i]), labels[i], KEYWORDS[i], i.replace(/_/g, " "), tl(g.label)) })))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .map((r) => r.i);
    return found.length ? [{ label: "", items: found }] : [];
  }, [groups, labels, words, tl]);
  const flat = useMemo(() => shown.flatMap((g) => g.items), [shown]);
  // Each line's place in the whole list, for the arrows.
  const numbered = useMemo(() => {
    let at = 0;
    return shown.map((g) => ({ label: g.label, items: g.items.map((i) => ({ i, at: at++ })) }));
  }, [shown]);
  const groupOf = useMemo(() => new Map(groups.flatMap((g) => g.items.map((i) => [i, g.label] as const))), [groups]);

  const close = (focusButton = true) => {
    setOpen(false);
    setQuery("");
    if (focusButton) button.current?.focus();
  };
  const pick = (i: IndicatorName) => {
    if (isLocked(i) && i !== value) return;
    if (i !== value) onChange(i);
    close();
  };
  const openPanel = () => {
    const r = button.current?.getBoundingClientRect();
    if (r && window.innerWidth >= 640) {
      const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_WIDTH - 8));
      // Below the button when it fits, above otherwise.
      setPlace(window.innerHeight - r.bottom >= PANEL_HEIGHT + 8 || r.top < PANEL_HEIGHT + 8 ? { left, top: r.bottom + 4 } : { left, bottom: window.innerHeight - r.top + 4 });
    } else setPlace(null);
    setActive(Math.max(0, flatAll(groups).indexOf(value)));
    setOpen(true);
  };

  // Closes on a click elsewhere, and when the page scrolls or resizes under a desktop panel.
  useEffect(() => {
    if (!open) return;
    const shut = () => {
      setOpen(false);
      setQuery("");
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) shut();
    };
    const onMove = (e: Event) => {
      if (place && !panel.current?.contains(e.target as Node)) shut();
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, place]);

  // Keeps the highlighted line in view.
  useLayoutEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, shown]);

  const move = (step: number) => {
    if (!flat.length) return;
    let at = active;
    for (let n = 0; n < flat.length; n++) {
      at = (at + step + flat.length) % flat.length;
      if (!isLocked(flat[at]) || flat[at] === value) break;
    }
    setActive(at);
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => (open ? close() : openPanel())}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex max-w-48 min-w-0 items-center gap-1.5 rounded-md border border-line bg-panel-2 px-2 py-1 text-left text-sm hover:border-accent/60 focus:outline focus:outline-1 focus:outline-accent max-md:text-base"
        title={tl("Choisir l'indicateur")}
      >
        <span className="truncate">{tl(labels[value])}</span>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <>
          {!place && <div className="fixed inset-0 z-40 bg-black/50" aria-hidden onClick={() => close(false)} />}
          <div
            ref={panel}
            className={
              place
                ? "fixed z-50 flex flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-2xl"
                : // On a phone, at the top: the keyboard takes the bottom of the screen.
                  "fixed inset-x-2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-50 flex max-h-[55vh] flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
            }
            style={place ? { left: place.left, top: place.top, bottom: place.bottom, width: PANEL_WIDTH, maxHeight: PANEL_HEIGHT } : undefined}
          >
            <div className="border-b border-line p-2">
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    move(1);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    move(-1);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (flat[active]) pick(flat[active]);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    if (query) setQuery("");
                    else close();
                  } else if (e.key === "Tab") close(false);
                }}
                placeholder={tl("Rechercher : RSI, moyenne, FVG…")}
                className="w-full"
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={flat[active] ? `${listId}-${active}` : undefined}
                autoComplete="off"
                enterKeyHint="go"
              />
            </div>
            <ul ref={list} id={listId} role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1" aria-label={tl("Indicateurs")}>
              {shown.length === 0 && <li className="px-3 py-3 text-sm text-muted">{tl("Aucun indicateur ne correspond.")}</li>}
              {numbered.map((g) => (
                <li key={g.label || "found"} role="presentation">
                  {g.label && <div className="sticky top-0 bg-panel px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{tl(g.label)}</div>}
                  <ul role="presentation">
                    {g.items.map(({ i, at }) => {
                      const locked = isLocked(i) && i !== value;
                      return (
                        <li
                          key={i}
                          id={`${listId}-${at}`}
                          data-index={at}
                          role="option"
                          aria-selected={i === value}
                          aria-disabled={locked || undefined}
                          onPointerMove={() => !locked && active !== at && setActive(at)}
                          onClick={() => pick(i)}
                          className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm max-md:py-2.5 ${at === active && !locked ? "bg-accent/15" : ""} ${locked ? "cursor-not-allowed text-muted/60" : ""} ${i === value ? "font-semibold text-accent" : ""}`}
                        >
                          <span className="min-w-0 flex-1 truncate">{tl(labels[i])}</span>
                          {!g.label && <span className="shrink-0 text-[11px] text-muted">{tl(groupOf.get(i) ?? "")}</span>}
                          {locked && <span className="shrink-0 rounded border border-line px-1 text-[10px] text-muted">{tl(lockLabel(i))}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}

const flatAll = (groups: IndicatorGroup[]) => groups.flatMap((g) => g.items);
