"use client";

import { useState } from "react";
import { COMPARATORS, SOURCES, num, operand, type Comparator, type Condition, type Group, type IndicatorName, type Operand } from "@/lib/strategy/schema";
import { COMPARATOR_LABELS, DEFAULT_PERIODS, INDICATOR_FIELDS, INDICATOR_LABELS } from "@/lib/strategy/describe";
import { INTERVALS } from "@/lib/types";

const GROUPS: { label: string; items: IndicatorName[] }[] = [
  { label: "Prix", items: ["close", "open", "high", "low", "volume", "number"] },
  { label: "Tendance", items: ["sma", "ema", "vwap", "adx", "macd", "macd_signal", "macd_hist"] },
  { label: "Oscillateurs", items: ["rsi", "stoch_k", "stoch_d", "roc", "ibs"] },
  { label: "Volatilité", items: ["atr", "atr_percent", "bb_upper", "bb_middle", "bb_lower"] },
  { label: "Niveaux", items: ["highest", "lowest", "day_open", "prev_day_high", "prev_day_low", "prev_day_close"] },
  { label: "Temps", items: ["hour", "minute", "weekday"] },
];

const FIELD_LABELS = { period: "Période", period2: "Période 2", period3: "Période 3", multiplier: "Écart-type", source: "Source", value: "Valeur" } as const;

function OperandEditor({ value, onChange }: { value: Operand; onChange: (o: Operand) => void }) {
  const fields = INDICATOR_FIELDS[value.indicator];
  const [advanced, setAdvanced] = useState(value.timeframe !== null || value.offset > 0);
  const setIndicator = (indicator: IndicatorName) => onChange({ ...operand(indicator, DEFAULT_PERIODS[indicator] ?? {}), offset: value.offset, timeframe: value.timeframe });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select value={value.indicator} onChange={(e) => setIndicator(e.target.value as IndicatorName)} className="max-w-48">
        {GROUPS.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.items.map((i) => (
              <option key={i} value={i}>
                {INDICATOR_LABELS[i]}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {fields.map((f) =>
        f === "source" ? (
          <select key={f} title="Source" value={value.source ?? ""} onChange={(e) => onChange({ ...value, source: (e.target.value || null) as Operand["source"] })}>
            <option value="">{value.indicator === "highest" ? "haut" : value.indicator === "lowest" ? "bas" : "clôture"}</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <input
            key={f}
            type="number"
            step="any"
            title={FIELD_LABELS[f]}
            placeholder={FIELD_LABELS[f]}
            className="w-20"
            value={value[f] ?? ""}
            onChange={(e) => onChange({ ...value, [f]: e.target.value === "" ? null : Number(e.target.value) })}
          />
        ),
      )}
      {value.indicator !== "number" && !advanced && (
        <button onClick={() => setAdvanced(true)} className="px-1 text-xs text-muted hover:text-fg" title="Autre unité de temps, bougie précédente">
          ⋯
        </button>
      )}
      {value.indicator !== "number" && advanced && (
        <>
          <select title="Unité de temps" value={value.timeframe ?? ""} onChange={(e) => onChange({ ...value, timeframe: (e.target.value || null) as Operand["timeframe"] })}>
            <option value="">UT stratégie</option>
            {INTERVALS.map((i) => (
              <option key={i} value={i}>
                UT {i}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-muted" title="Lire la valeur N bougies en arrière">
            décalage
            <input type="number" min={0} className="w-14" value={value.offset} onChange={(e) => onChange({ ...value, offset: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
        </>
      )}
    </div>
  );
}

function ConditionEditor({ value, onChange, onRemove }: { value: Condition; onChange: (c: Condition) => void; onRemove: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-panel-2/60 p-2">
      <OperandEditor value={value.left} onChange={(left) => onChange({ ...value, left })} />
      <select value={value.op} onChange={(e) => onChange({ ...value, op: e.target.value as Comparator })} className="font-medium">
        {COMPARATORS.map((c) => (
          <option key={c} value={c}>
            {COMPARATOR_LABELS[c]}
          </option>
        ))}
      </select>
      <OperandEditor value={value.right} onChange={(right) => onChange({ ...value, right })} />
      <button onClick={onRemove} className="ml-auto text-xs text-muted hover:text-down" title="Supprimer la condition">
        ✕
      </button>
    </div>
  );
}

export function GroupsEditor({ value, onChange, emptyHint }: { value: Group[]; onChange: (g: Group[]) => void; emptyHint: string }) {
  const newCondition = (): Condition => ({ left: operand("rsi", { period: 14 }), op: "<", right: num(30) });
  const update = (gi: number, g: Group) => onChange(value.map((x, i) => (i === gi ? g : x)));
  return (
    <div className="flex flex-col gap-2">
      {value.length === 0 && <p className="text-xs text-muted">{emptyHint}</p>}
      {value.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-2">
          {gi > 0 && <div className="text-center text-xs font-semibold text-accent">OU</div>}
          <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-line p-2">
            {g.conditions.map((c, ci) => (
              <div key={ci} className="flex flex-col gap-1.5">
                {ci > 0 && <div className="pl-2 text-[11px] font-semibold text-muted">ET</div>}
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
              + condition (ET)
            </button>
          </div>
        </div>
      ))}
      <button onClick={() => onChange([...value, { conditions: [newCondition()] }])} className="self-start text-xs text-accent hover:underline">
        + groupe de conditions (OU)
      </button>
    </div>
  );
}
