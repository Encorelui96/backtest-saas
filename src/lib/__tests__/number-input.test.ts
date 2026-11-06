import { describe, expect, it } from "vitest";
import { formatDraft, parseNumber, stepValue } from "../number-input";

describe("parseNumber", () => {
  it("reads a decimal comma as well as a dot", () => {
    expect(parseNumber("0,5")).toBe(0.5);
    expect(parseNumber("0.5")).toBe(0.5);
    expect(parseNumber(",5")).toBe(0.5);
    expect(parseNumber("12")).toBe(12);
    expect(parseNumber("-1,25")).toBe(-1.25);
  });

  it("gives no number for an emptied or unfinished field, instead of 0", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("   ")).toBeNull();
    expect(parseNumber("-")).toBeNull();
    expect(parseNumber(",")).toBeNull();
    expect(parseNumber(".")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("1,2,3")).toBeNull();
  });

  it("keeps the number while the decimal part is still being typed", () => {
    expect(parseNumber("0,")).toBe(0);
    expect(parseNumber("1.")).toBe(1);
  });

  it("ignores spaces between thousands", () => {
    expect(parseNumber("100 000")).toBe(100000);
    expect(parseNumber("100 000")).toBe(100000);
  });

  it("takes only whole numbers in integer fields", () => {
    expect(parseNumber("12", true)).toBe(12);
    expect(parseNumber("1,5", true)).toBeNull();
    expect(parseNumber("", true)).toBeNull();
  });
});

describe("formatDraft", () => {
  it("shows the page's decimal mark and no grouping", () => {
    expect(formatDraft(0.5, "fr-FR")).toBe("0,5");
    expect(formatDraft(0.5, "en-US")).toBe("0.5");
    expect(formatDraft(100000, "fr-FR")).toBe("100000");
    expect(formatDraft(0.0001, "fr-FR")).toBe("0,0001");
  });

  it("leaves a field with no value empty", () => {
    expect(formatDraft(null, "fr-FR")).toBe("");
    expect(formatDraft(undefined, "fr-FR")).toBe("");
  });

  it("reads back as the same number", () => {
    for (const n of [0, 1, 0.5, 12.25, 0.05, 10000]) expect(parseNumber(formatDraft(n, "fr-FR"))).toBe(n);
  });
});

describe("stepValue", () => {
  it("moves by the step without float noise", () => {
    expect(stepValue(0.2, 0.1, 1)).toBe(0.3);
    expect(stepValue(1, 0.5, -1)).toBe(0.5);
    expect(stepValue(1.25, 1, 1)).toBe(2.25);
  });

  it("stops at the minimum and starts there from an empty field", () => {
    expect(stepValue(0.1, 0.1, -1, 0.1)).toBe(0.1);
    expect(stepValue(null, 1, 1, 0)).toBe(1);
  });
});
