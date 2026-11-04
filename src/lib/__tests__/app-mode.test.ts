import { describe, expect, it } from "vitest";
import { APP_MODE_SCRIPT, isPhoneApp } from "../app-mode";

const PHONE = "Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36";

/** What the page's script leaves on <html> for a given browser. */
function run(userAgent: string) {
  const document = { documentElement: { dataset: {} as Record<string, string> } };
  new Function("navigator", "document", APP_MODE_SCRIPT)({ userAgent }, document);
  return document.documentElement.dataset;
}

describe("phone app detection", () => {
  it("recognises the app's mark, not a phone browser", () => {
    expect(isPhoneApp(`${PHONE} BacktestLabApp`)).toBe(true);
    expect(isPhoneApp(PHONE)).toBe(false);
    expect(isPhoneApp(null)).toBe(false);
  });

  it("marks the page before it paints, only in the app", () => {
    expect(run(`${PHONE} BacktestLabApp`).app).toBe("1");
    expect(run(PHONE).app).toBeUndefined();
  });
});
