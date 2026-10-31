import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fetchOanda } from "../oanda";
import { market } from "../../markets";

const H = 3_600_000;
const T0 = Date.UTC(2026, 7, 3); // Monday 3 August 2026, 00:00 UTC

function candle(t: number, c: number, complete = true) {
  return { time: (t / 1000).toFixed(9), complete, volume: 120, mid: { o: "1.1000", h: "1.1050", l: "1.0950", c: c.toFixed(4) } };
}

describe("fetchOanda", () => {
  const calls: URL[] = [];

  beforeEach(() => {
    calls.length = 0;
    process.env.OANDA_API_KEY = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const u = new URL(url);
        calls.push(u);
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
        const from = Number(u.searchParams.get("from")) * 1000;
        const to = Number(u.searchParams.get("to")) * 1000;
        const candles = [];
        for (let t = from; t <= to && t <= T0 + 2 * H; t += H) candles.push(candle(t, 1.1 + (t - T0) / H / 1000, t < T0 + 2 * H));
        return new Response(JSON.stringify({ candles }), { status: 200 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OANDA_API_KEY;
  });

  it("reads UNIX times and mid prices, and drops the candle still forming", async () => {
    const rows = await fetchOanda(market("EURUSD")!, "1h", T0, T0 + 2 * H);
    expect(rows.map((r) => r.t)).toEqual([T0, T0 + H]);
    expect(rows[1]).toEqual({ t: T0 + H, o: 1.1, h: 1.105, l: 1.095, c: 1.101, v: 120 });
    expect(calls[0].pathname).toBe("/v3/instruments/EUR_USD/candles");
    expect(calls[0].searchParams.get("granularity")).toBe("H1");
    expect(calls[0].searchParams.get("price")).toBe("M");
    expect(calls[0].searchParams.get("alignmentTimezone")).toBe("UTC");
  });

  it("splits long spans into pages OANDA accepts", async () => {
    const minutes = 10_000;
    await fetchOanda(market("NAS100")!, "1m", T0 - minutes * 60_000, T0);
    expect(calls).toHaveLength(3);
    expect(calls.every((u) => u.pathname === "/v3/instruments/NAS100_USD/candles")).toBe(true);
  });

  it("says plainly when the key is missing", async () => {
    delete process.env.OANDA_API_KEY;
    await expect(fetchOanda(market("XAUUSD")!, "1d", T0 - 30 * 24 * H, T0)).rejects.toThrow(/OANDA_API_KEY/);
  });
});
