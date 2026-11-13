"use client";

import { useT } from "@/lib/client/i18n";
import { createContext, useContext, useState } from "react";
import { COMPARATORS, PRO_INDICATORS, SOURCES, num, operand, type Comparator, type Condition, type Group, type IndicatorName, type Operand } from "@/lib/strategy/schema";
import { COMPARATOR_LABELS, DEFAULT_PERIODS, FIELD_HINTS, INDICATOR_FIELDS, INDICATOR_LABELS } from "@/lib/strategy/describe";
import { INTERVALS } from "@/lib/types";
import { INDICATOR_TERMS } from "@/lib/learn/glossary";
import { Help } from "./learn";
import { NumberInput } from "./number-input";

/** A "?" that explains the indicator or comparison in beginner mode, nothing in expert mode. */
function Why({ id }: { id: string | undefined }) {
  return id ? <Help id={id} /> : null;
}

const GROUPS: { label: string; items: IndicatorName[] }[] = [
  { label: "Prix", items: ["close", "open", "high", "low", "number"] },
  {
    label: "Tendance",
    items: [
      "sma",
      "ema",
      "wma",
      "hma",
      "vwap",
      "adx",
      "plus_di",
      "minus_di",
      "macd",
      "macd_signal",
      "macd_hist",
      "supertrend",
      "psar",
      "ichimoku_tenkan",
      "ichimoku_kijun",
      "ichimoku_span_a",
      "ichimoku_span_b",
    ],
  },
  { label: "Oscillateurs", items: ["rsi", "stoch_k", "stoch_d", "cci", "williams_r", "roc", "ibs", "zscore"] },
  {
    label: "Volatilité",
    items: ["atr", "atr_percent", "bb_upper", "bb_middle", "bb_lower", "bb_percent", "bb_width", "keltner_upper", "keltner_middle", "keltner_lower", "squeeze", "chop"],
  },
  { label: "Volume", items: ["volume", "obv", "mfi"] },
  {
    label: "Niveaux",
    items: ["highest", "lowest", "day_open", "prev_day_high", "prev_day_low", "prev_day_close", "prev_week_high", "prev_week_low", "range_high", "range_low"],
  },
  { label: "Pivots", items: ["pivot", "pivot_r1", "pivot_s1", "pivot_r2", "pivot_s2", "cam_r3", "cam_s3", "cam_r4", "cam_s4"] },
  { label: "Figures de bougies", items: ["inside_bar", "engulfing", "pin_bar", "narrow_range"] },
  { label: "Temps", items: ["hour", "minute", "weekday"] },
  {
    label: "Structure de marché (Pro)",
    items: [
      "swing_high",
      "swing_low",
      "bos",
      "structure",
      "fvg",
      "fvg_bull_top",
      "fvg_bull_bottom",
      "fvg_bear_top",
      "fvg_bear_bottom",
      "order_block",
      "ob_bull_top",
      "ob_bull_bottom",
      "ob_bear_top",
      "ob_bear_bottom",
    ],
  },
  { label: "Heikin Ashi (Pro)", items: ["ha_open", "ha_high", "ha_low", "ha_close"] },
  { label: "Divergences et plus (Pro)", items: ["rsi_divergence", "macd_divergence", "stoch_rsi_k", "stoch_rsi_d", "aroon_up", "aroon_down", "cmf"] },
];

/** Labels of the averaged prices; the plain ones show as they are. */
const SOURCE_LABELS: Partial<Record<(typeof SOURCES)[number], string>> = { hl2: "hl2 (h+l)/2", hlc3: "hlc3 (h+l+c)/3", ohlc4: "ohlc4 (o+h+l+c)/4" };

/** True when the signed-in plan doesn't include the Pro indicators: they show greyed out in the lists. */
export const ProIndicatorsLocked = createContext(false);

const FIELD_LABELS = { period: "Période", period2: "Période 2", period3: "Période 3", multiplier: "Écart-type", value: "Valeur" } as const;

function OperandEditor({ value, onChange }: { value: Operand; onChange: (o: Operand) => void }) {
  const tl = useT();
  const fields = INDICATOR_FIELDS[value.indicator];
  const [advanced, setAdvanced] = useState(value.timeframe !== null || value.offset > 0);
  const locked = useContext(ProIndicatorsLocked);
  const setIndicator = (indicator: IndicatorName) => onChange({ ...operand(indicator, DEFAULT_PERIODS[indicator] ?? {}), offset: value.offset, timeframe: value.timeframe });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select value={value.indicator} onChange={(e) => setIndicator(e.target.value as IndicatorName)} className="max-w-48">
        {GROUPS.map((g) => (
          <optgroup key={g.label} label={tl(g.label)}>
            {g.items.map((i) => (
              <option key={i} value={i} disabled={locked && PRO_INDICATORS.has(i) && i !== value.indicator}>
                {tl(INDICATOR_LABELS[i])}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <Why id={INDICATOR_TERMS[value.indicator]} />
      {fields.map((f) => {
        if (f === "source")
          return (
            <span key={f} className="flex items-center">
            <select title={tl("Source")} value={value.source ?? ""} onChange={(e) => onChange({ ...value, source: (e.target.value || null) as Operand["source"] })}>
              <option value="">{value.indicator === "highest" ? tl("haut") : value.indicator === "lowest" ? tl("bas") : value.indicator === "cci" ? "hlc3" : tl("clôture")}</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABELS[s] ?? s}
                </option>
              ))}
            </select>
            <Why id="source" />
            </span>
          );
        if (f === "window") {
          const w = value.window ?? { start: "00:00", end: "08:00" };
          return (
            <span key={f} className="flex items-center gap-1 text-xs text-muted" title={tl("Plage horaire (heure du fuseau de la stratégie)")}>
              {tl("de")}
              <input type="time" className="w-24" value={w.start} onChange={(e) => onChange({ ...value, window: { ...w, start: e.target.value } })} />{tl("à")}<input type="time" className="w-24" value={w.end} onChange={(e) => onChange({ ...value, window: { ...w, end: e.target.value } })} />
            </span>
          );
        }
        const label = tl(FIELD_HINTS[value.indicator]?.[f] ?? FIELD_LABELS[f]);
        return (
          <NumberInput key={f} nullable title={label} placeholder={label} className="w-20" value={value[f]} onChange={(v) => onChange({ ...value, [f]: v })} />
        );
      })}
      {value.indicator !== "number" && !advanced && (
        <button onClick={() => setAdvanced(true)} className="px-1 text-xs text-muted hover:text-fg" title={tl("Autre unité de temps (filtre de tendance), bougie précédente (décalage)")}>
          ⋯
        </button>
      )}
      {value.indicator !== "number" && advanced && (
        <>
          <select title={tl("Unité de temps")} value={value.timeframe ?? ""} onChange={(e) => onChange({ ...value, timeframe: (e.target.value || null) as Operand["timeframe"] })}>
            <option value="">{tl("UT stratégie")}</option>
            {INTERVALS.map((i) => (
              <option key={i} value={i}>
                UT {i}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-muted" title={tl("Lire la valeur N bougies en arrière")}>
            {tl("décalage")}<NumberInput integer min={0} className="w-14" value={value.offset} onChange={(v) => onChange({ ...value, offset: Math.max(0, v) })} />
          </label>
        </>
      )}
    </div>
  );
}

function ConditionEditor({ value, onChange, onRemove }: { value: Condition; onChange: (c: Condition) => void; onRemove: () => void }) {
  const tl = useT();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-panel-2/60 p-2">
      <OperandEditor value={value.left} onChange={(left) => onChange({ ...value, left })} />
      <select value={value.op} onChange={(e) => onChange({ ...value, op: e.target.value as Comparator })} className="font-medium">
        {COMPARATORS.map((c) => (
          <option key={c} value={c}>
            {tl(COMPARATOR_LABELS[c])}
          </option>
        ))}
      </select>
      <Why id={value.op.startsWith("crosses") ? "croise" : undefined} />
      <OperandEditor value={value.right} onChange={(right) => onChange({ ...value, right })} />
      <button onClick={onRemove} className="ml-auto text-xs text-muted hover:text-down" title={tl("Supprimer la condition")}>
        ✕
      </button>
    </div>
  );
}

export function GroupsEditor({ value, onChange, emptyHint }: { value: Group[]; onChange: (g: Group[]) => void; emptyHint: string }) {
  const tl = useT();
  const newCondition = (): Condition => ({ left: operand("rsi", { period: 14 }), op: "<", right: num(30) });
  const update = (gi: number, g: Group) => onChange(value.map((x, i) => (i === gi ? g : x)));
  return (
    <div className="flex flex-col gap-2">
      {value.length === 0 && <p className="text-xs text-muted">{emptyHint}</p>}
      {value.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-2">
          {gi > 0 && <div className="text-center text-xs font-semibold text-accent">{tl("OU")}</div>}
          <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-line p-2">
            {g.conditions.map((c, ci) => (
              <div key={ci} className="flex flex-col gap-1.5">
                {ci > 0 && <div className="pl-2 text-[11px] font-semibold text-muted">{tl("ET")}</div>}
                <ConditionEditor
                  value={c}
                  onChange={(nc) => update(gi, { conditions: g.conditions.map((x, i) => (i === ci ? nc : x)) })}
                  onRemove={() => {
                    const conditions = g.conditions.filter((_, i) => i !== ci);
                    onChange(conditions.length ? value.map((x, i) => (i === gi ? { conditions } : x)) : value.filter((_, i) => i !== gi));
                  }}
                />
              </div>
            ))}
            <button onClick={() => update(gi, { conditions: [...g.conditions, newCondition()] })} className="self-start text-xs text-accent hover:underline">
              {tl("+ condition (ET)")}</button>
          </div>
        </div>
      ))}
      <button onClick={() => onChange([...value, { conditions: [newCondition()] }])} className="self-start text-xs text-accent hover:underline">
        {tl("+ groupe de conditions (OU)")}</button>
    </div>
  );
}
