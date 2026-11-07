import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({ calls: [] as { text: string; params: unknown[] }[], rows: 0 }));
vi.mock("../db", () => ({
  query: vi.fn(async (text: string, params: unknown[] = []) => {
    db.calls.push({ text, params });
    return Array.from({ length: db.rows }, (_, i) => ({ id: String(i) }));
  }),
}));

import { KEEP_BACKTESTS, KEEP_JOBS_DAYS, housekeepingTick, purgeOld } from "../housekeeping";

beforeEach(() => {
  db.calls = [];
  db.rows = 0;
});

describe("purgeOld", () => {
  it("keeps named and shared reports, the newest ones, and this month's jobs", async () => {
    db.rows = 2;
    const p = await purgeOld();
    expect(p).toEqual({ backtests: 2, jobs: 2, codes: 2 });
    const [backtests, jobs] = db.calls;
    expect(backtests.text).toContain("name IS NULL");
    expect(backtests.text).toContain("NOT EXISTS (SELECT 1 FROM shares");
    expect(backtests.text).toContain("st.favorite");
    expect(backtests.text).toContain("ORDER BY created_at DESC");
    expect(backtests.params).toEqual([KEEP_BACKTESTS]);
    expect(jobs.text).toContain("status IN ('done', 'failed')");
    expect(jobs.params).toEqual([KEEP_JOBS_DAYS]);
    expect(KEEP_JOBS_DAYS).toBeGreaterThanOrEqual(31);
  });
});

describe("housekeepingTick", () => {
  it("runs once a day, and never throws", async () => {
    const t0 = Date.UTC(2026, 10, 7, 12);
    await housekeepingTick(t0);
    expect(db.calls).toHaveLength(3);
    await housekeepingTick(t0 + 3_600_000);
    expect(db.calls).toHaveLength(3);
    await housekeepingTick(t0 + 25 * 3_600_000);
    expect(db.calls).toHaveLength(6);
  });
});
