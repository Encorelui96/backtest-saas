import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

const call = (method: string, path: string, headers: Record<string, string>) =>
  proxy(new NextRequest(`http://localhost:3000${path}`, { method, headers: { host: "localhost:3000", ...headers } }));

// NextResponse.next() carries this header; a refusal doesn't.
const passed = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("proxy (origin check)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lets reads through, whatever their origin", () => {
    expect(passed(call("GET", "/api/me", { origin: "https://evil.example" }))).toBe(true);
  });

  it("lets a change through from the site's own pages", () => {
    expect(passed(call("POST", "/api/strategies", { origin: "http://localhost:3000" }))).toBe(true);
  });

  it("accepts the public address behind Render's proxy", () => {
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://backtest-lab.onrender.com");
    expect(passed(call("POST", "/api/strategies", { host: "10.0.0.5:10000", origin: "https://backtest-lab.onrender.com" }))).toBe(true);
  });

  it("refuses a change sent from another site", async () => {
    const res = call("DELETE", "/api/strategies/abc", { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Backtest Lab/);
  });

  it("refuses an opaque origin", () => {
    expect(call("POST", "/api/ai/parse", { origin: "null" }).status).toBe(403);
  });

  it("leaves requests without Origin and better-auth's routes alone", () => {
    expect(passed(call("POST", "/api/strategies", {}))).toBe(true);
    expect(passed(call("POST", "/api/auth/sign-in/email", { origin: "https://evil.example" }))).toBe(true);
  });
});
