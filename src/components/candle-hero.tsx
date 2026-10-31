"use client";

import { useEffect, useRef } from "react";

/**
 * A decorative chart for the home page: candles form one after another on a
 * rising trend, a glowing average follows them and the chart scrolls left
 * forever. Drawn on a canvas so it stays smooth on phones; frozen on one frame
 * when the device asks for reduced motion.
 */

interface Bar {
  o: number;
  h: number;
  l: number;
  c: number;
  /** Where the close is heading while the candle forms. */
  target: number;
}

const UP = "#22c55e";
const DOWN = "#ef4444";
const ACCENT = "#4f8cff";
const FORM_MS = 420;

/** A small deterministic generator, so the first frame is the same on every load. */
function random(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function CandleHero({ className = "", density = 1 }: { className?: string; density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rnd = random(7);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let step = 12;
    let visible = 60;

    // A random walk with an upward drift and swings: it goes up over a screen, with real pullbacks.
    let phase = 0;
    const next = (prev: number): Bar => {
      phase += 0.09;
      const swing = Math.sin(phase) * 0.004;
      const move = (rnd() - 0.47) * 0.026 + 0.0011 + swing;
      const target = prev * (1 + move);
      return { o: prev, h: prev, l: prev, c: prev, target };
    };
    const settle = (b: Bar) => {
      b.c = b.target;
      b.h = Math.max(b.o, b.c) * (1 + rnd() * 0.006);
      b.l = Math.min(b.o, b.c) * (1 - rnd() * 0.006);
    };

    const bars: Bar[] = [];
    let price = 100;
    for (let i = 0; i < 160; i++) {
      const b = next(price);
      settle(b);
      bars.push(b);
      price = b.c;
    }
    let forming = next(price);
    let formStart = performance.now();
    let lo = 0;
    let hi = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      step = Math.max(7, Math.min(14, width / (48 * density)));
      visible = Math.ceil(width / step) + 2;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = (now: number) => {
      const t = still ? 1 : Math.min(1, (now - formStart) / FORM_MS);
      // The forming candle wiggles towards its close, its wicks growing as it goes.
      const wiggle = Math.sin(t * Math.PI * 3) * (1 - t) * 0.004 * forming.o;
      forming.c = forming.o + (forming.target - forming.o) * easeOut(t) + wiggle;
      forming.h = Math.max(forming.h, forming.c);
      forming.l = Math.min(forming.l, forming.c);

      const shown = [...bars.slice(-visible), forming];
      // The price scale eases towards the visible range instead of jumping.
      let min = Infinity;
      let max = -Infinity;
      for (const b of shown) {
        min = Math.min(min, b.l);
        max = Math.max(max, b.h);
      }
      const pad = (max - min) * 0.18 || 1;
      const goalLo = min - pad;
      const goalHi = max + pad;
      if (!lo) {
        lo = goalLo;
        hi = goalHi;
      }
      lo += (goalLo - lo) * 0.06;
      hi += (goalHi - hi) * 0.06;
      const y = (p: number) => height - ((p - lo) / (hi - lo)) * height;

      ctx.clearRect(0, 0, width, height);

      // Faint horizontal grid.
      ctx.strokeStyle = "rgba(138,151,171,0.08)";
      ctx.lineWidth = 1;
      for (let g = 1; g < 5; g++) {
        const gy = Math.round((height * g) / 5) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(width, gy);
        ctx.stroke();
      }

      // Everything slides one step left while the new candle forms; when it closes, the next one
      // appears at the right edge, so the motion is continuous.
      const offset = -t * step;
      const xOf = (i: number) => width - (shown.length - 1 - i) * step - step * 1.5 + offset;

      // A smoothed average of the closes, with a glow and a soft area below.
      const avg: number[] = [];
      const all = [...bars, forming];
      let e = all[Math.max(0, all.length - shown.length - 40)].c;
      for (let i = Math.max(0, all.length - shown.length - 40); i < all.length; i++) {
        e += (all[i].c - e) * (2 / (14 + 1));
        if (i >= all.length - shown.length) avg.push(e);
      }
      const area = ctx.createLinearGradient(0, 0, 0, height);
      area.addColorStop(0, "rgba(79,140,255,0.22)");
      area.addColorStop(1, "rgba(79,140,255,0)");
      ctx.beginPath();
      avg.forEach((v, i) => (i ? ctx.lineTo(xOf(i), y(v)) : ctx.moveTo(xOf(i), y(v))));
      ctx.lineTo(xOf(avg.length - 1), height);
      ctx.lineTo(xOf(0), height);
      ctx.closePath();
      ctx.fillStyle = area;
      ctx.fill();

      // Candles.
      const body = Math.max(3, step * 0.62);
      shown.forEach((b, i) => {
        const x = xOf(i);
        const up = b.c >= b.o;
        ctx.strokeStyle = ctx.fillStyle = up ? UP : DOWN;
        ctx.globalAlpha = 0.35 + 0.65 * (i / shown.length);
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, y(b.h));
        ctx.lineTo(Math.round(x) + 0.5, y(b.l));
        ctx.stroke();
        const top = y(Math.max(b.o, b.c));
        ctx.fillRect(Math.round(x - body / 2), top, Math.round(body), Math.max(1.5, y(Math.min(b.o, b.c)) - top));
      });
      ctx.globalAlpha = 1;

      ctx.save();
      ctx.shadowColor = ACCENT;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2;
      ctx.beginPath();
      avg.forEach((v, i) => (i ? ctx.lineTo(xOf(i), y(v)) : ctx.moveTo(xOf(i), y(v))));
      ctx.stroke();
      ctx.restore();

      // Last price: a dotted line and a glowing dot on the forming candle.
      const ly = y(forming.c);
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = "rgba(34,197,94,0.45)";
      ctx.beginPath();
      ctx.moveTo(0, ly);
      ctx.lineTo(width, ly);
      ctx.stroke();
      ctx.setLineDash([]);
      const lx = xOf(shown.length - 1);
      ctx.fillStyle = UP;
      ctx.shadowColor = UP;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (t >= 1 && !still) {
        settle(forming);
        bars.push(forming);
        if (bars.length > 400) bars.splice(0, bars.length - 400);
        forming = next(forming.c);
        formStart = now;
      }
      if (!still) frame = requestAnimationFrame(draw);
    };

    let frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [density]);

  return <canvas ref={ref} className={`block h-full w-full ${className}`} aria-hidden />;
}

function easeOut(t: number) {
  return 1 - (1 - t) ** 3;
}
