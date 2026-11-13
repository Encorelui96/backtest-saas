import { describe, expect, it } from "vitest";
import { pollDelay } from "../poll-delay";

describe("pollDelay", () => {
  it("asks less often far back in the queue", () => {
    expect(pollDelay({ status: "queued", ahead: 40 }, 0, 0, false)).toBe(5000);
    expect(pollDelay({ status: "queued", ahead: 10 }, 0, 0, false)).toBe(5000);
    expect(pollDelay({ status: "queued", ahead: 5 }, 0, 0, false)).toBe(3000);
    expect(pollDelay({ status: "queued", ahead: 0 }, 0, 0, false)).toBe(1500);
  });

  it("follows a running test closely for 30 seconds, then every 2 seconds", () => {
    expect(pollDelay({ status: "running", ahead: 0 }, 1000, 20_000, false)).toBe(700);
    expect(pollDelay({ status: "running", ahead: 0 }, 1000, 40_000, false)).toBe(2000);
  });

  it("slows down in the background", () => {
    expect(pollDelay({ status: "running", ahead: 0 }, 1000, 2000, true)).toBe(10_000);
    expect(pollDelay({ status: "queued", ahead: 0 }, 0, 0, true)).toBe(10_000);
  });
});
