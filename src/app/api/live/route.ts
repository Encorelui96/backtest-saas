import { z } from "zod";
import { StrategySchema, normalizeStrategy, type Operand } from "@/lib/strategy/schema";
import { higherTimeframeWarmupMs, higherTimeframes, warmupMs } from "@/lib/strategy/warmup";
import { INTERVAL_MS, rowsToCandles } from "@/lib/types";
import { fetchRecent } from "@/lib/server/candles";
import { SeriesContext } from "@/lib/engine/evaluate";
import { runBacktest } from "@/lib/engine/backtest";
import { defaultConfig } from "@/lib/strategy/schema";
import { COMPARATOR_LABELS, operandLabel } from "@/lib/strategy/describe";
import { handle } from "@/lib/server/http";
import { requestT } from "@/lib/server/lang";
import { translatorOf } from "@/lib/server/lang";
import { requireUser } from "@/lib/server/auth";
import { limitPerMinute } from "@/lib/server/rate-limit";
import { QuotaError, planOf } from "@/lib/server/quotas";

const Body = z.object({ strategy: StrategySchema, display: z.number().min(50).max(1000).optional() });
/** The Live page refreshes at each closed candle (once a minute at most) and every 5 minutes. */
const PER_MINUTE = 20;

const OVERLAY = new Set<Operand["indicator"]>([
  "sma", "ema", "bb_upper", "bb_middle", "bb_lower", "vwap", "highest", "lowest", "day_open", "prev_day_high", "prev_day_low", "prev_day_close",
  "supertrend", "psar", "ichimoku_tenkan", "ichimoku_kijun", "ichimoku_span_a", "ichimoku_span_b", "keltner_upper", "keltner_middle", "keltner_lower",
  "prev_week_high", "prev_week_low", "range_high", "range_low", "pivot", "pivot_r1", "pivot_s1", "pivot_r2", "pivot_s2", "cam_r3", "cam_s3", "cam_r4", "cam_s4",
]);

/**
 * Evaluates a strategy on the latest closed candles: where it would have
 * signalled recently, whether it would hold a position now, and the state of
 * every condition on the last closed bar.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req.headers);
    limitPerMinute(user.id, "live", PER_MINUTE);
    const body = Body.parse(await req.json());
    const { strategy } = normalizeStrategy(body.strategy);
    // Following a strategy live is a backtest on the latest bars: the plan's smallest unit applies. Plain charts stay open to all.
    const plan = await planOf(user);
    if (!plan.live) throw new QuotaError("Le suivi en direct des stratégies est réservé aux offres Trader et Pro.");
    const ms = INTERVAL_MS[strategy.interval];
    if (ms < INTERVAL_MS[plan.minInterval]) {
      throw new QuotaError("L'offre {0:t} suit les stratégies à partir de l'unité {1}. Passe à l'offre Trader pour le scalp en {2}.", [plan.label, plan.minInterval, strategy.interval]);
    }
    const display = body.display ?? 300;
    const warmBars = Math.min(4000, Math.ceil(warmupMs(strategy) / ms) + 10);
    const rows = await fetchRecent(strategy.symbol, strategy.interval, display + warmBars + 1, { metered: true });
    const now = Date.now();
    const closed = rows.filter((r) => r.t + ms <= now);
    const forming = rows.find((r) => r.t + ms > now) ?? null;
    const candles = rowsToCandles(closed);
    const n = candles.t.length;
    if (n < 10) return Response.json({ error: (await requestT())("Pas assez de données pour ce symbole.") }, { status: 400 });
    const startIndex = Math.max(0, n - display);

    const ctx = new SeriesContext(candles, strategy.interval, strategy.timezone);
    // Higher-timeframe filters get their own candles: rebuilding a daily MM50 from 300 bars of 15m would leave it empty.
    for (const tf of higherTimeframes(strategy)) {
      const bars = Math.ceil(higherTimeframeWarmupMs(strategy, tf) / INTERVAL_MS[tf]) + Math.ceil(((display + 1) * ms) / INTERVAL_MS[tf]) + 2;
      const htfRows = (await fetchRecent(strategy.symbol, tf, Math.min(bars, 1500), { metered: true })).filter((r) => r.t + INTERVAL_MS[tf] <= now);
      ctx.attachHigherTimeframe(tf, rowsToCandles(htfRows));
    }
    const run = runBacktest(candles, strategy, { ...defaultConfig(), initialCapital: 10_000 }, ctx, startIndex);
    const last = run.trades.at(-1);
    const openTrade = last && last.exitReason === "end" ? last : null;

    const longSig = strategy.direction !== "short" ? ctx.groupsSignal(strategy.entryLong) : new Uint8Array(n);
    const shortSig = strategy.direction !== "long" ? ctx.groupsSignal(strategy.entryShort) : new Uint8Array(n);
    const markers: { t: number; kind: "long" | "short" }[] = [];
    for (let i = startIndex; i < n; i++) {
      if (longSig[i]) markers.push({ t: candles.t[i], kind: "long" });
      else if (shortSig[i]) markers.push({ t: candles.t[i], kind: "short" });
    }

    const i = n - 1;
    const t = translatorOf(req);
    const describeGroups = (groups: typeof strategy.entryLong) =>
      groups
        .filter((g) => g.conditions.length)
        .map((g) => ({
          conditions: g.conditions.map((c) => ({
            label: `${operandLabel(c.left, t)} ${t(COMPARATOR_LABELS[c.op])} ${operandLabel(c.right, t)}`,
            left: ctx.series(c.left)[i],
            right: ctx.series(c.right)[i],
            pass: ctx.conditionSeries(c)[i] === 1,
          })),
        }));

    const overlays: { label: string; points: { t: number; v: number }[] }[] = [];
    const seen = new Set<string>();
    for (const groups of [strategy.entryLong, strategy.entryShort, strategy.exitLong, strategy.exitShort])
      for (const g of groups)
        for (const c of g.conditions)
          for (const o of [c.left, c.right]) {
            const label = operandLabel(o, t);
            if (!OVERLAY.has(o.indicator) || seen.has(label)) continue;
            seen.add(label);
            const s = ctx.series(o);
            const points: { t: number; v: number }[] = [];
            for (let k = startIndex; k < n; k++) if (!Number.isNaN(s[k])) points.push({ t: candles.t[k], v: s[k] });
            overlays.push({ label, points });
          }

    return Response.json({
      symbol: strategy.symbol,
      interval: strategy.interval,
      candles: Array.from({ length: n - startIndex }, (_, k) => {
        const j = startIndex + k;
        return { t: candles.t[j], o: candles.o[j], h: candles.h[j], l: candles.l[j], c: candles.c[j], v: candles.v[j] };
      }),
      forming,
      lastClosedTime: candles.t[i],
      signalNow: longSig[i] ? "long" : shortSig[i] ? "short" : null,
      openTrade,
      recentTrades: run.trades.filter((t) => t.exitReason !== "end").slice(-10),
      markers,
      entryLong: describeGroups(strategy.entryLong),
      entryShort: describeGroups(strategy.entryShort),
      exitLong: describeGroups(strategy.exitLong),
      exitShort: describeGroups(strategy.exitShort),
      overlays,
    });
  });
}
