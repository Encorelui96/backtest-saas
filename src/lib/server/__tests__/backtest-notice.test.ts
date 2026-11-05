import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ queryOne: vi.fn(async (..._args: unknown[]) => ({ email: "a@b.fr", test_emails: null }) as unknown) }));
vi.mock("../db", () => db);
const send = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({ error: null as { message: string } | null })));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

import { LONG_TEST_MS, notifyFailed, notifyFinished } from "../backtest-notice";
import type { BacktestPayload, Job } from "../jobs";

const NOW = Date.UTC(2026, 10, 5, 20);
const job = (waited: number) => ({ id: "j", userId: "u", createdAt: NOW - waited }) as Job;
const payload = { strategy: { name: "Test", symbol: "BTCUSDT", interval: "1m" }, config: { startDate: "2026-05-05", endDate: "2026-11-05" }, strategyId: null } as unknown as BacktestPayload;
const summary = { trades: 10, totalReturnPercent: 1, maxDrawdownPercent: 2, winRate: 50, profitFactor: 1, avgR: 0 };

describe("backtest notices", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("RESEND_API_KEY", "key");
    vi.stubEnv("EMAIL_FROM", "Backtest Lab <a@b.fr>");
    vi.stubEnv("SITE_HOST", "backtestlab.fr");
    send.mockClear();
    db.queryOne.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("writes after a long wait only", async () => {
    await notifyFinished(job(LONG_TEST_MS - 1), payload, "b", summary);
    expect(send).not.toHaveBeenCalled();
    await notifyFinished(job(LONG_TEST_MS), payload, "b", summary);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toMatchObject({ to: "a@b.fr", subject: "Ton backtest est terminé : Test" });
  });

  it("respects the setting in Compte", async () => {
    db.queryOne.mockResolvedValueOnce({ email: "a@b.fr", test_emails: false });
    await notifyFinished(job(LONG_TEST_MS), payload, "b", summary);
    expect(send).not.toHaveBeenCalled();
  });

  it("stays silent without Resend on this service", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await notifyFinished(job(LONG_TEST_MS), payload, "b", summary);
    expect(db.queryOne).not.toHaveBeenCalled();
  });

  it("never turns a mail problem into a failed test", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    send.mockResolvedValueOnce({ error: { message: "quota" } });
    await expect(notifyFinished(job(LONG_TEST_MS), payload, "b", summary)).resolves.toBeUndefined();
  });

  it("translates the reason of a failure", async () => {
    await notifyFailed(job(LONG_TEST_MS), { ...payload, lang: "en" }, { text: "Le calcul a échoué (réf. {0}).", values: ["x"] });
    expect(String((send.mock.calls[0][0] as { text: string }).text)).toContain("The calculation failed");
  });
});
