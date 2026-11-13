import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** A stand-in database: usage counts and the credit ledger, both read through the same SQL the code sends. */
const db = vi.hoisted(() => ({
  plan: "trader" as string | null,
  backtests: 0,
  ai: 0,
  ledger: [] as { kind: string; delta: number; reason: string }[],
}));
function run(text: string, params: unknown[] = []) {
  if (text.includes("AS backtests")) {
    const sum = (k: string) => db.ledger.filter((l) => l.kind === k).reduce((a, l) => a + l.delta, 0);
    return [{ backtests: String(db.backtests), ai: String(db.ai), active: "0", credit_ai: String(sum("ai")), credit_backtest: String(sum("backtest")) }];
  }
  if (text.startsWith("INSERT INTO credit_ledger") && text.includes("-1")) db.ledger.push({ kind: params[1] as string, delta: -1, reason: params[2] as string });
  else if (text.startsWith("INSERT INTO credit_ledger") && text.includes("refund")) {
    const job = params[0] as string;
    const used = db.ledger.some((l) => l.reason === `job:${job}`);
    const done = db.ledger.some((l) => l.reason === `refund:${job}`);
    if (used && !done) db.ledger.push({ kind: "backtest", delta: 1, reason: `refund:${job}` });
  } else if (text.startsWith("INSERT INTO credit_ledger")) db.ledger.push({ kind: params[1] as string, delta: params[2] as number, reason: params[3] as string });
  if (text.includes("count(*) AS n")) return [{ n: "0" }];
  if (text.startsWith("INSERT INTO usage_events")) return [{ id: "ev1" }];
  return [];
}
vi.mock("../db", () => ({
  query: vi.fn(async (text: string, params?: unknown[]) => run(text, params)),
  queryOne: vi.fn(async (text: string) => (text.includes("FROM plans") ? (db.plan ? { plan: db.plan } : null) : null)),
  transaction: vi.fn(async (fn: (c: unknown) => unknown) => fn({ query: async (text: string, params?: unknown[]) => ({ rows: run(text, params) }) })),
  newId: () => "id",
}));

const { QuotaError, checkBacktestAllowed, consumeAi, grantCredits, refundBacktestCredit, usageOf } = await import("../quotas");
const { PLANS } = await import("../../plans");
const { defaultStrategy, num, operand } = await import("../../strategy/schema");

/** The default strategy on another timeframe: the checks only read its interval and its indicators. */
const on = (interval: "1m" | "5m" | "15m" | "1h" | "4h" | "1d") => ({ ...defaultStrategy(), interval });

const user = { id: "u1", email: "client@example.com", name: "", emailVerified: true };
const sql = async <T,>(text: string, params: unknown[]) => run(text, params) as T[];

beforeEach(() => {
  db.plan = "trader";
  db.backtests = 0;
  db.ai = 0;
  db.ledger = [];
});

describe("recharges", () => {
  it("the Pro plan has 200 AI translations a month", () => {
    expect(PLANS.pro.aiPerMonth).toBe(200);
  });

  it("uses the monthly quota first, then a credit, then offers a recharge", async () => {
    db.backtests = 99;
    expect(await checkBacktestAllowed(user, on("1h"), sql)).toEqual({ useCredit: false });
    db.backtests = 100;
    await expect(checkBacktestAllowed(user, on("1h"), sql)).rejects.toMatchObject({ recharge: "bt100" });
    await grantCredits("u1", { backtest: 100 }, "pack:bt100");
    expect(await checkBacktestAllowed(user, on("1h"), sql)).toEqual({ useCredit: true });
  });

  it("says what the recharge costs when the quota is spent", async () => {
    db.backtests = 100;
    const err = await checkBacktestAllowed(user, on("1h"), sql).catch((e) => e);
    expect(err).toBeInstanceOf(QuotaError);
    expect(err.message).toContain("+100 backtests pour 5 €");
  });

  it("sells nothing in the phone app's message", async () => {
    db.backtests = 100;
    const err = await checkBacktestAllowed(user, on("1h"), sql).catch((e) => e);
    expect(err.inApp("fr")).toMatch(/^Tu as utilisé tes \d+ backtests du mois \(offre .+\)\. Ils reviennent le .+\.$/);
    expect(err.inApp("fr")).not.toMatch(/recharge|€/);
    expect(err.inApp("en")).not.toMatch(/top up|€/i);
  });

  it("spends one AI credit per translation past the quota, never within it", async () => {
    db.ai = 10;
    await consumeAi(user);
    expect(db.ledger).toHaveLength(0);
    db.ai = 50;
    await expect(consumeAi(user)).rejects.toMatchObject({ recharge: "ai50" });
    await grantCredits("u1", { ai: 50 }, "pack:ai50");
    await consumeAi(user);
    expect(db.ledger.at(-1)).toEqual({ kind: "ai", delta: -1, reason: "ai:ev1" });
    expect((await usageOf(user)).credits.ai).toBe(49);
  });

  it("gives back the credit of a failed backtest, once", async () => {
    await grantCredits("u1", { backtest: 1 }, "pack:bt100");
    db.ledger.push({ kind: "backtest", delta: -1, reason: "job:j1" });
    expect((await usageOf(user)).credits.backtest).toBe(0);
    await refundBacktestCredit("j1");
    await refundBacktestCredit("j1");
    expect((await usageOf(user)).credits.backtest).toBe(1);
  });

  it("does nothing for a failed backtest that used the monthly quota", async () => {
    await refundBacktestCredit("j2");
    expect(db.ledger).toHaveLength(0);
  });
});

describe("free plan limits", () => {
  const DAY = 86_400_000;

  beforeEach(() => {
    db.plan = "free";
  });

  it("allows 15 minutes and refuses 5 minutes", async () => {
    expect(await checkBacktestAllowed(user, on("15m"), sql)).toEqual({ useCredit: false });
    await expect(checkBacktestAllowed(user, on("5m"), sql)).rejects.toBeInstanceOf(QuotaError);
  });

  it("refuses a test that starts before the last 12 months", async () => {
    await expect(checkBacktestAllowed(user, on("1h"), sql, Date.now() - 400 * DAY)).rejects.toBeInstanceOf(QuotaError);
    expect(await checkBacktestAllowed(user, on("1h"), sql, Date.now() - 300 * DAY)).toEqual({ useCredit: false });
  });

  it("leaves the paid plans the whole history", async () => {
    db.plan = "trader";
    expect(await checkBacktestAllowed(user, on("1h"), sql, Date.now() - 2000 * DAY)).toEqual({ useCredit: false });
  });

  it("counts 30 backtests a month", async () => {
    db.backtests = 29;
    expect(await checkBacktestAllowed(user, on("1h"), sql)).toEqual({ useCredit: false });
    db.backtests = 30;
    await expect(checkBacktestAllowed(user, on("1h"), sql)).rejects.toBeInstanceOf(QuotaError);
  });
});

describe("Pro indicators", () => {
  const withBos = { ...on("1h"), entryLong: [{ conditions: [{ left: operand("bos", { period: 5, period2: 5 }), op: "==" as const, right: num(1) }] }] };

  it("are refused below the Pro plan, with the indicator's name", async () => {
    for (const plan of ["free", "trader"]) {
      db.plan = plan;
      const err = await checkBacktestAllowed(user, withBos, sql).catch((e) => e);
      expect(err).toBeInstanceOf(QuotaError);
      expect(err.inApp("fr")).toBe("L'indicateur Cassure de structure (BOS) est réservé à l'offre Pro.");
      expect(err.inApp("en")).toBe("The Break of structure (BOS) indicator is reserved to the Pro plan.");
    }
  });

  it("are allowed on the Pro plan", async () => {
    db.plan = "pro";
    expect(await checkBacktestAllowed(user, withBos, sql)).toEqual({ useCredit: false });
  });

  it("leave the ICT order blocks to every plan", async () => {
    db.plan = "free";
    const withBlock = { ...on("1h"), entryLong: [{ conditions: [{ left: operand("order_block", { period: 5, period2: 5 }), op: "==" as const, right: num(1) }] }] };
    expect(await checkBacktestAllowed(user, withBlock, sql)).toEqual({ useCredit: false });
  });
});
