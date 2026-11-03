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

describe("proxy (language)", () => {
  it("serves the French share image at its own address", () => {
    expect(passed(call("GET", "/fr/opengraph-image", {}))).toBe(true);
  });

  it("still redirects the other /fr addresses", () => {
    const res = call("GET", "/fr/tarifs", {});
    expect(res.status).toBe(308);
    expect(new URL(res.headers.get("location") as string).pathname).toBe("/tarifs");
  });
});

describe("proxy (public address)", () => {
  const render = "backtest-lab.onrender.com";
  afterEach(() => vi.unstubAllEnvs());

  it("sends a page on Render's address to the public one, with its path and query", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://backtestlab.fr");
    const res = call("GET", "/connexion?mode=signup", { host: render });
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://backtestlab.fr/connexion?mode=signup");
  });

  it("reads the address behind Render's proxy", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://backtestlab.fr");
    expect(call("GET", "/tarifs", { host: "10.0.0.5:10000", "x-forwarded-host": render }).status).toBe(308);
  });

  it("leaves the API alone, for Render's health check", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://backtestlab.fr");
    expect(passed(call("GET", "/api/me", { host: render }))).toBe(true);
  });

  it("only moves page visits", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://backtestlab.fr");
    expect(call("POST", "/tarifs", { host: render }).status).not.toBe(308);
  });

  it("stays put on the public address", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://backtestlab.fr");
    expect(call("GET", "/tarifs", { host: "backtestlab.fr" }).status).not.toBe(308);
  });

  it("stays put while Render's address is the only one", () => {
    vi.stubEnv("BETTER_AUTH_URL", `https://${render}`);
    expect(call("GET", "/tarifs", { host: render }).status).not.toBe(308);
    vi.stubEnv("BETTER_AUTH_URL", "");
    expect(call("GET", "/tarifs", { host: render }).status).not.toBe(308);
  });
});
