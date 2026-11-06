import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ newId: vi.fn(), query: vi.fn(), queryOne: vi.fn() }));
vi.mock("../candles", () => ({ getCandles: vi.fn() }));

import { TEMPLATES } from "@/lib/strategy/templates";
import { defaultConfig } from "@/lib/strategy/schema";
import { MAX_HISTORY_DAYS } from "@/lib/types";
import { validateBacktest } from "../backtests";

const strategy = { ...TEMPLATES[0].strategy, interval: "1m" as const };
const days = (startDate: string, endDate: string) => validateBacktest(strategy, { ...defaultConfig(), startDate, endDate });

describe("validateBacktest period", () => {
  it("accepts exactly the longest period, as the Max button sets it", () => {
    expect(MAX_HISTORY_DAYS["1m"]).toBe(400);
    expect(() => days("2025-10-02", "2026-11-06")).not.toThrow();
  });

  it("refuses one day more", () => {
    expect(() => days("2025-10-01", "2026-11-06")).toThrow("limitée");
  });

  it("still needs the end after the start", () => {
    expect(() => days("2026-11-06", "2026-11-06")).not.toThrow();
    expect(() => days("2026-11-07", "2026-11-06")).toThrow("après");
  });
});
