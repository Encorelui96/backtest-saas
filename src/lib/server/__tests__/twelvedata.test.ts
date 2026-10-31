import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fetchTwelveData } from "../twelvedata";
import { market } from "../../markets";

const H = 3_600_000;
const T0 = Date.UTC(2026, 7, 3); // Monday 3 August 2026, 00:00 UTC

const utc = (t: number) => new Date(t).toISOString().slice(0, 19).replace("T", " ");

describe("fetchTwelveData", () => {
  const calls: URL[] = [];
  let reply: (u: URL) => unknown;

  beforeEach(() => {
    calls.length = 0;
    process.env.TWELVEDATA_API_KEY = "test-key";
    reply = (u) => {
      const from = Date.parse(u.searchParams.get("start_date")!.replace(" ", "T") + "Z");
      const to = Date.parse(u.searchParams.get("end_date")!.replace(" ", "T") + "Z");
      const values = [];
      for (let t = from; t <= to && t <= T0 + H; t += H) values.push({ datetime: utc(t), open: "1.1", high: "1.2", low: "1.0", close: "1.15" });
      return { status: "ok", values };
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const u = new URL(url);
        calls.push(u);
        expect((init.headers as Record<string, string>).Authorization).toBe("apikey test-key");
        return new Response(JSON.stringify(reply(u)), { status: 200 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TWELVEDATA_API_KEY;
  });

  it("reads UTC datetimes and prices, in ascending order", async () => {
    const rows = await fetchTwelveData(market("EURUSD")!, "1h", T0, T0 + H);
    expect(rows).toEqual([
      { t: T0, o: 1.1, h: 1.2, l: 1, c: 1.15, v: 0 },
      { t: T0 + H, o: 1.1, h: 1.2, l: 1, c: 1.15, v: 0 },
    ]);
    expect(calls[0].pathname).toBe("/time_series");
    expect(calls[0].searchParams.get("symbol")).toBe("EUR/USD");
    expect(calls[0].searchParams.get("interval")).toBe("1h");
    expect(calls[0].searchParams.get("timezone")).toBe("UTC");
    expect(calls[0].searchParams.get("order")).toBe("ASC");
  });

  it("splits long spans into requests of at most 4500 bars", async () => {
    await fetchTwelveData(market("XAUUSD")!, "1m", T0 - 10_000 * 60_000, T0);
    expect(calls).toHaveLength(3);
    expect(calls.every((u) => u.searchParams.get("symbol") === "XAU/USD")).toBe(true);
  });

  it("returns nothing for a span without data (weekend)", async () => {
    reply = () => ({ status: "error", code: 400, message: "No data is available on the specified dates. Try setting different start/end dates." });
    expect(await fetchTwelveData(market("EURUSD")!, "1h", T0 - 48 * H, T0 - 24 * H)).toEqual([]);
  });

  it("says which market the plan does not include", async () => {
    reply = () => ({ status: "error", code: 403, message: "This symbol is available starting with the Grow plan." });
    await expect(fetchTwelveData(market("NAS100")!, "1d", T0 - 30 * 24 * H, T0)).rejects.toThrow(/Nasdaq 100 n'est pas inclus/);
  });

  it("says plainly when the key is missing", async () => {
    delete process.env.TWELVEDATA_API_KEY;
    await expect(fetchTwelveData(market("EURUSD")!, "1d", T0 - 30 * 24 * H, T0)).rejects.toThrow(/TWELVEDATA_API_KEY/);
  });
});
