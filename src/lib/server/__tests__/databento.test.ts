import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fetchDatabento, parseCsv } from "../databento";
import { market } from "../../markets";

const H = 3_600_000;
const T0 = Date.UTC(2026, 7, 3); // Monday 3 August 2026, 00:00 UTC
const ns = (t: number) => `${t}000000`;
const ms = (ns: string) => Number(ns.slice(0, -6));

describe("parseCsv", () => {
  it("reads nanosecond times and pretty prices", () => {
    const csv = `ts_event,rtype,publisher_id,instrument_id,open,high,low,close,volume\n${ns(T0)},33,1,42,28000.25,28010.5,27990.0,28005.75,1234\n`;
    expect(parseCsv(csv)).toEqual([{ t: T0, o: 28000.25, h: 28010.5, l: 27990, c: 28005.75, v: 1234 }]);
  });

  it("reads fixed-point prices and ISO times", () => {
    const csv = `ts_event,open,high,low,close,volume\n2026-08-03T00:00:00.000000000Z,28000250000000,28010500000000,27990000000000,28005750000000,10`;
    expect(parseCsv(csv)[0]).toEqual({ t: T0, o: 28000.25, h: 28010.5, l: 27990, c: 28005.75, v: 10 });
  });
});

describe("fetchDatabento", () => {
  const forms: URLSearchParams[] = [];

  beforeEach(() => {
    forms.length = 0;
    process.env.DATABENTO_API_KEY = "db-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect((init?.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("db-test:").toString("base64")}`);
        if (url.includes("metadata.get_dataset_range")) return new Response(JSON.stringify({ start: "2010-06-06T00:00:00Z", end: "2026-10-30T21:00:00Z" }));
        const form = init!.body as URLSearchParams;
        forms.push(form);
        const from = ms(form.get("start")!);
        const to = ms(form.get("end")!);
        const lines = ["ts_event,open,high,low,close,volume"];
        for (let t = from; t < to && t < T0 + 24 * H; t += H) lines.push(`${ns(t)},28000.0,${28000 + (t - T0) / H},27990.0,28001.0,5`);
        return new Response(lines.join("\n"));
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DATABENTO_API_KEY;
  });

  it("asks for the continuous NQ contract in hourly bars", async () => {
    const rows = await fetchDatabento(market("NAS100")!, "1h", T0, T0 + 2 * H);
    expect(rows.map((r) => r.t)).toEqual([T0, T0 + H, T0 + 2 * H]);
    expect(forms[0].get("dataset")).toBe("GLBX.MDP3");
    expect(forms[0].get("symbols")).toBe("NQ.c.0");
    expect(forms[0].get("stype_in")).toBe("continuous");
    expect(forms[0].get("schema")).toBe("ohlcv-1h");
    expect(forms[0].get("encoding")).toBe("csv");
  });

  it("builds 4h bars from hourly ones", async () => {
    const rows = await fetchDatabento(market("NAS100")!, "4h", T0, T0 + 4 * H);
    expect(rows[0]).toEqual({ t: T0, o: 28000, h: 28003, l: 27990, c: 28001, v: 20 });
  });

  it("says plainly when the key is missing", async () => {
    delete process.env.DATABENTO_API_KEY;
    await expect(fetchDatabento(market("NAS100")!, "1d", T0 - 30 * 24 * H, T0)).rejects.toThrow(/DATABENTO_API_KEY/);
  });
});
