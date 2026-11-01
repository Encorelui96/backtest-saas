import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { limitPerMinute } from "../rate-limit";
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
