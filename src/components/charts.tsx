"use client";

import { formatLocale } from "@/lib/client/format";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  TickMarkType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { CandleRow } from "@/lib/types";
import { useIsMobile } from "@/lib/client/use-mobile";

const OVERLAY_COLORS = ["#f59e0b", "#a855f7", "#06b6d4", "#ec4899", "#84cc16", "#f97316"];

const sec = (t: number) => Math.floor(t / 1000) as UTCTimestamp;

function baseChart(el: HTMLElement, height: number): IChartApi {
  return createChart(el, {
    height,
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8a97ab", fontSize: 11 },
    grid: { vertLines: { color: "#1b2333" }, horzLines: { color: "#1b2333" } },
    rightPriceScale: { borderColor: "#243044" },
    timeScale: {
      borderColor: "#243044",
      timeVisible: true,
      tickMarkFormatter: (time: Time, type: TickMarkType) => {
        const d = new Date((time as number) * 1000);
        switch (type) {
          case TickMarkType.Year:
            return String(d.getFullYear());
          case TickMarkType.Month:
            return d.toLocaleDateString(formatLocale(), { month: "short", year: "2-digit" });
          case TickMarkType.DayOfMonth:
            return d.toLocaleDateString(formatLocale(), { day: "numeric", month: "short" });
          default:
            return d.toLocaleTimeString(formatLocale(), { hour: "2-digit", minute: "2-digit" });
        }
      },
    },
    crosshair: { mode: CrosshairMode.Normal },
    localization: {
      locale: formatLocale(),
      timeFormatter: (time: Time) => new Date((time as number) * 1000).toLocaleString(formatLocale(), { dateStyle: "short", timeStyle: "short" }),
    },
  });
}

export interface ChartMarker {
  t: number;
  kind: "long" | "short" | "exit-win" | "exit-loss";
  text?: string;
}

export interface PriceChartHandle {
  /** Adds or replaces the last candle (live updates). */
  update: (c: CandleRow) => void;
  focus: (from: number, to: number) => void;
}

function toMarkers(markers: ChartMarker[]): SeriesMarker<Time>[] {
  return [...markers]
    .sort((a, b) => a.t - b.t)
    .map((m) => {
      switch (m.kind) {
        case "long":
          return { time: sec(m.t), position: "belowBar", shape: "arrowUp", color: "#22c55e", text: m.text };
        case "short":
          return { time: sec(m.t), position: "aboveBar", shape: "arrowDown", color: "#ef4444", text: m.text };
        case "exit-win":
          return { time: sec(m.t), position: "aboveBar", shape: "circle", color: "#4f8cff", text: m.text, size: 0.7 };
        default:
          return { time: sec(m.t), position: "aboveBar", shape: "circle", color: "#f59e0b", text: m.text, size: 0.7 };
      }
    });
}

export function PriceChart({
  candles,
  markers = [],
  overlays = [],
  priceLines = [],
  height: desktopHeight = 420,
  ref,
}: {
  candles: CandleRow[];
  markers?: ChartMarker[];
  overlays?: { label: string; points: { t: number; v: number }[] }[];
  priceLines?: { price: number; color: string; title: string }[];
  height?: number;
  ref?: Ref<PriceChartHandle>;
}) {
  const height = useIsMobile() ? Math.min(desktopHeight, 320) : desktopHeight;
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const c = baseChart(el.current, height);
    chart.current = c;
    series.current = c.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
    };
  }, [height]);

  useEffect(() => {
    const c = chart.current;
    const s = series.current;
    if (!c || !s) return;
    s.setData(candles.map((k) => ({ time: sec(k.t), open: k.o, high: k.h, low: k.l, close: k.c })));
    const markerApi = createSeriesMarkers(s, toMarkers(markers));
    const lines = overlays.map((o, i) => {
      const line = c.addSeries(LineSeries, {
        color: OVERLAY_COLORS[i % OVERLAY_COLORS.length],
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        title: o.label,
      });
      line.setData(o.points.map((p) => ({ time: sec(p.t), value: p.v })));
      return line;
    });
    const pls = priceLines.map((p) => s.createPriceLine({ price: p.price, color: p.color, title: p.title, lineWidth: 1, lineStyle: 2 }));
    return () => {
      // On unmount the chart is already removed by the effect above.
      if (chart.current !== c) return;
      markerApi.detach();
      lines.forEach((l) => c.removeSeries(l));
      pls.forEach((p) => s.removePriceLine(p));
    };
    // height: the chart is rebuilt when it changes, so its data must be set again.
  }, [candles, markers, overlays, priceLines, height]);

  useImperativeHandle(ref, () => ({
    update: (k) => series.current?.update({ time: sec(k.t), open: k.o, high: k.h, low: k.l, close: k.c }),
    focus: (from, to) => chart.current?.timeScale().setVisibleRange({ from: sec(from), to: sec(to) }),
  }));

  return <div ref={el} style={{ height }} className="w-full" />;
}

export function EquityChart({ points, height: desktopHeight = 260 }: { points: { t: number; equity: number }[]; height?: number }) {
  const height = useIsMobile() ? Math.min(desktopHeight, 200) : desktopHeight;
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const c = baseChart(el.current, height);
    // The whole history must fit the width, however many points it has.
    c.timeScale().applyOptions({ minBarSpacing: 0.001 });
    const s = c.addSeries(AreaSeries, {
      lineColor: "#4f8cff",
      topColor: "rgba(79,140,255,0.35)",
      bottomColor: "rgba(79,140,255,0.02)",
      lineWidth: 2,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });
    // Keep strictly increasing times, which the chart requires.
    const data: { time: UTCTimestamp; value: number }[] = [];
    for (const p of points) {
      const time = sec(p.t);
      if (data.length && data[data.length - 1].time >= time) continue;
      data.push({ time, value: p.equity });
    }
    s.setData(data);
    c.timeScale().fitContent();
    // autoSize measures the container after creation; fit again once the real width is known.
    const frame = requestAnimationFrame(() => c.timeScale().fitContent());
    return () => {
      cancelAnimationFrame(frame);
      c.remove();
    };
  }, [points, height]);
  return <div ref={el} style={{ height }} className="w-full" />;
}
