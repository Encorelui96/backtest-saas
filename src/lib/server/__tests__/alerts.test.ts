import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CandleRow } from "../../types";

vi.mock("server-only", () => ({}));

const store = vi.hoisted(() => ({ due: [] as Record<string, unknown>[], updates: [] as unknown[][], deletes: [] as unknown[][] }));
vi.mock("../db", () => ({
  query: vi.fn(async (text: string, params: unknown[] = []) => {
    if (text.includes("FROM alerts a")) return store.due;
    if (text.startsWith("UPDATE alerts")) store.updates.push(params);
    if (text.startsWith("DELETE FROM telegram_links")) store.deletes.push(params);
    return [];
  }),
  queryOne: vi.fn(async () => null),
  transaction: vi.fn(),
  newId: () => "id",
}));
const market = vi.hoisted(() => ({ rows: [] as CandleRow[] }));
vi.mock("../candles", () => ({ fetchRecent: vi.fn(async () => market.rows) }));
const tg = vi.hoisted(() => ({ sent: [] as { chat: unknown; text: string }[], fail: null as Error | null }));
vi.mock("../telegram", async (orig) => {
  const real = await orig<typeof import("../telegram")>();
  return {
    ...real,
    sendMessage: vi.fn(async (chat: unknown, text: string) => {
      if (tg.fail) throw tg.fail;
      tg.sent.push({ chat, text });
    }),
    botUsername: async () => "BacktestLabBot",
  };
});

import { alertMessage, runAlertChecks } from "../alerts";
import { TelegramError } from "../telegram";
import { defaultStrategy, num, operand, type Strategy } from "../../strategy/schema";

const H = 3_600_000;
const START = Date.UTC(2026, 10, 2, 0);

/** Hourly bars from START, the last one closing at `hoursClosed`. */
function bars(hoursClosed: number, lastClose: number): CandleRow[] {
  return Array.from({ length: hoursClosed }, (_, i) => {
    const c = i === hoursClosed - 1 ? lastClose : 100;
    return { t: START + i * H, o: c, h: c, l: c, c, v: 1 };
  });
}

const strategy: Strategy = {
  ...defaultStrategy(),
  name: "Cassure <test> & co",
  symbol: "BTCUSDT",
  interval: "1h",
  timezone: "UTC",
  entryLong: [{ conditions: [{ left: operand("close"), op: ">", right: num(150) }] }],
};

function alertRow(over: Record<string, unknown> = {}) {
  return { id: "a1", user_id: "u1", email: "x@y.fr", email_verified: false, plan: "trader", strategy_id: "s1", json: strategy, last_bar: null, chat_id: "42", rank: "1", ...over };
}

beforeEach(() => {
  store.due = [];
  store.updates = [];
  store.deletes = [];
  tg.sent = [];
  tg.fail = null;
});

describe("runAlertChecks", () => {
  it("starts silently on a new alert, then sends once per signalling close", async () => {
    // 60 bars closed by 12:00 + 60 h; the last one closes above 150.
    const now = START + 60 * H + 30_000;
    market.rows = bars(60, 200);
    store.due = [alertRow()];
    await runAlertChecks(now);
    expect(tg.sent).toHaveLength(0);
    const firstBar = store.updates[0][1];
    expect(firstBar).toBe(START + 59 * H);

    // Next close: a new bar, still above 150 → one message.
    market.rows = bars(61, 200);
    store.due = [alertRow({ last_bar: String(firstBar) })];
    await runAlertChecks(now + H);
    expect(tg.sent).toHaveLength(1);
    expect(tg.sent[0].chat).toBe("42");
    expect(tg.sent[0].text).toContain("ACHAT");

    // Same bar checked again: nothing more.
    store.due = [alertRow({ last_bar: String(START + 60 * H) })];
    await runAlertChecks(now + H + 10_000);
    expect(tg.sent).toHaveLength(1);
  });

  it("sends nothing when the rule doesn't fire", async () => {
    market.rows = bars(61, 120);
    store.due = [alertRow({ last_bar: String(START + 59 * H) })];
    await runAlertChecks(START + 61 * H + 30_000);
    expect(tg.sent).toHaveLength(0);
  });

  it("skips accounts whose plan has no alerts or a larger minimum timeframe", async () => {
    market.rows = bars(61, 200);
    store.due = [alertRow({ plan: null, last_bar: String(START + 59 * H) })];
    await runAlertChecks(START + 61 * H + 30_000);
    expect(tg.sent).toHaveLength(0);
    expect(store.updates).toHaveLength(0);
  });

  it("unlinks a chat that blocked the bot", async () => {
    market.rows = bars(61, 200);
    tg.fail = new TelegramError("Forbidden: bot was blocked by the user", true);
    store.due = [alertRow({ last_bar: String(START + 59 * H) })];
    await runAlertChecks(START + 61 * H + 30_000);
    expect(store.deletes).toEqual([[42]]);
  });
});

describe("alertMessage", () => {
  it("escapes the strategy name and says it is a simulation", () => {
    const text = alertMessage(strategy, "s1", ["long"], START + 13 * H, 64250.5);
    expect(text).toContain("Cassure &lt;test&gt; &amp; co");
    expect(text).toContain("13h00");
    expect(text).toContain("pas un conseil en investissement");
  });
});
