import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../db", () => ({ query: vi.fn(), queryOne: vi.fn(), transaction: vi.fn() }));

const { isAdmin } = await import("../quotas");

const user = { id: "a1b2c3", email: "Gab@Example.com", emailVerified: true };

describe("isAdmin", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts a confirmed address listed in ADMIN_EMAILS, whatever the case", () => {
    vi.stubEnv("ADMIN_EMAILS", "other@example.com, gab@example.com");
    expect(isAdmin(user)).toBe(true);
  });

  it("refuses the same address while it is not confirmed", () => {
    vi.stubEnv("ADMIN_EMAILS", "gab@example.com");
    expect(isAdmin({ ...user, emailVerified: false })).toBe(false);
  });

  it("accepts an account listed in ADMIN_USER_IDS, confirmed or not", () => {
    vi.stubEnv("ADMIN_USER_IDS", "zzz, a1b2c3");
    expect(isAdmin({ ...user, emailVerified: false })).toBe(true);
  });

  it("refuses everyone when nothing is configured", () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    vi.stubEnv("ADMIN_USER_IDS", "");
    expect(isAdmin(user)).toBe(false);
  });
});
