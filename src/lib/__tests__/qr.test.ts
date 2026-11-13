import { describe, expect, it } from "vitest";
import { QrTooLongError, qrCode, qrPath } from "../qr";

const draw = (text: string) => qrCode(text).map((row) => row.map((dark) => (dark ? "#" : ".")).join(""));

describe("qrCode", () => {
  // This drawing was read back with a QR decoder (OpenCV) when the encoder was written.
  it("draws the code a reader decodes as the text", () => {
    expect(draw("Backtest Lab")).toEqual([
      "#######.##..#.#######",
      "#.....#..#..#.#.....#",
      "#.###.#.#.#.#.#.###.#",
      "#.###.#.#..#..#.###.#",
      "#.###.#.###...#.###.#",
      "#.....#.......#.....#",
      "#######.#.#.#.#######",
      ".........##..........",
      "####..#.#.#..#..###.#",
      ".##..#.###..##..#.#.#",
      ".##.###.#...#.##...##",
      "..##.#.#..#.##.#.#.##",
      "..#.#.###.##..##.....",
      "........####..####..#",
      "#######...#..#.####..",
      "#.....#...#..#...##..",
      "#.###.#....#..##.###.",
      "#.###.#.##..#.#...##.",
      "#.###.#.##.##....#...",
      "#.....#.#....##.....#",
      "#######.#....######..",
    ]);
  });

  it("grows with the text: 21 modules a side up to 17 bytes, 57 at 271 bytes", () => {
    expect(qrCode("x".repeat(17))).toHaveLength(21);
    expect(qrCode("x".repeat(18))).toHaveLength(25);
    expect(qrCode("x".repeat(271))).toHaveLength(57);
  });

  it("holds the address an authenticator app scans", () => {
    const uri = "otpauth://totp/Backtest%20Lab:prenom.nom%40exemple.fr?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXPJBSW&issuer=Backtest%20Lab&digits=6&period=30";
    expect(qrCode(uri)).toHaveLength(45);
  });

  it("refuses a text too long to draw", () => {
    expect(() => qrCode("x".repeat(272))).toThrow(QrTooLongError);
  });
});

describe("qrPath", () => {
  it("draws one square per dark module, inside a light margin", () => {
    const modules = qrCode("A");
    const dark = modules.flat().filter(Boolean).length;
    const { path, size } = qrPath(modules, 4);
    expect(size).toBe(29);
    expect(path.match(/M/g)).toHaveLength(dark);
    expect(path.startsWith("M4 4h1v1h-1z")).toBe(true);
  });
});
