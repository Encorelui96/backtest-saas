import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { clientIp, limitPerMinute, limitVisitor } from "../rate-limit";
import { QuotaError } from "../quotas";

describe("limitPerMinute", () => {
  afterEach(() => vi.useRealTimers());

  it("refuses the request over the limit, then lets it through the next minute", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) limitPerMinute("u1", "test", 3);
    expect(() => limitPerMinute("u1", "test", 3)).toThrow(QuotaError);
    vi.advanceTimersByTime(60_000);
    expect(() => limitPerMinute("u1", "test", 3)).not.toThrow();
  });

  it("counts each account and each route apart", () => {
    for (let i = 0; i < 2; i++) limitPerMinute("u2", "a", 2);
    expect(() => limitPerMinute("u3", "a", 2)).not.toThrow();
    expect(() => limitPerMinute("u2", "b", 2)).not.toThrow();
    expect(() => limitPerMinute("u2", "a", 2)).toThrow(QuotaError);
  });
});

describe("limitVisitor", () => {
  const from = (ip: string) => new Headers({ "cf-connecting-ip": ip });

  it("counts each visitor address apart", () => {
    for (let i = 0; i < 2; i++) limitVisitor(from("203.0.113.1"), "public", 2);
    expect(() => limitVisitor(from("203.0.113.2"), "public", 2)).not.toThrow();
    expect(() => limitVisitor(from("203.0.113.1"), "public", 2)).toThrow(QuotaError);
  });

  it("reads the visitor's address from the proxy headers, the first address of a list", () => {
    expect(clientIp(from("203.0.113.3"))).toBe("203.0.113.3");
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.4, 10.0.0.1" }))).toBe("203.0.113.4");
    expect(clientIp(new Headers())).toBe("inconnue");
  });
});
