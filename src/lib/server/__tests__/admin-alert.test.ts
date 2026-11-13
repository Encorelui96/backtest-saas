import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ query: vi.fn(async (..._args: unknown[]) => [{ email: "Admin@Exemple.fr" }] as unknown[]) }));
vi.mock("../db", () => db);
const send = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({ error: null as { message: string } | null })));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

import { ALERT_EVERY_MS, sendAdminAlert } from "../admin-alert";

const NOW = Date.UTC(2026, 10, 13, 16);

describe("admin alerts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("RESEND_API_KEY", "key");
    vi.stubEnv("EMAIL_FROM", "Backtest Lab <a@b.fr>");
    vi.stubEnv("ADMIN_EMAILS", "admin@exemple.fr");
    vi.stubEnv("ADMIN_USER_IDS", "u1");
    send.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("writes once to each administrator, then holds the next errors for 10 minutes", async () => {
    vi.setSystemTime(NOW);
    expect(await sendAdminAlert("site", "abc123", new Error("boom"))).toBe(true);
    expect(send).toHaveBeenCalledOnce();
    const first = send.mock.calls[0][0] as { to: string[]; subject: string; text: string };
    // The same address from ADMIN_EMAILS and from the account listed by id: one recipient.
    expect(first.to).toEqual(["admin@exemple.fr"]);
    expect(first.subject).toContain("abc123");
    expect(first.text).toContain("boom");

    vi.setSystemTime(NOW + ALERT_EVERY_MS - 1);
    expect(await sendAdminAlert("site", "def456", new Error("again"))).toBe(false);
    expect(send).toHaveBeenCalledOnce();

    vi.setSystemTime(NOW + ALERT_EVERY_MS);
    expect(await sendAdminAlert("worker", "ghi789", new Error("later"))).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect((send.mock.calls[1][0] as { text: string }).text).toContain("1 autre(s) erreur(s)");
  });

  it("sends nothing when e-mail isn't configured", async () => {
    vi.setSystemTime(NOW + 10 * ALERT_EVERY_MS);
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await sendAdminAlert("site", "ref", new Error("boom"))).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
