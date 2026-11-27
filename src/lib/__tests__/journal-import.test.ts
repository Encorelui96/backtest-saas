import { describe, expect, it } from "vitest";
import { detectColumns, draftsFrom, findTable, guessDateOrder, importKey, parseCsv, parseDateTime, parseNumber, parseSide, type ImportOptions } from "../journal-import";

const PARIS: ImportOptions = { timeZone: "Europe/Paris", dateOrder: "dmy", offsetHours: 0, pointValue: null };

describe("journal import: cells", () => {
  it("reads numbers written the French, English or accounting way", () => {
    expect(parseNumber("1 234,56")).toBe(1234.56);
    expect(parseNumber("1,234.56")).toBe(1234.56);
    expect(parseNumber("1.234,56")).toBe(1234.56);
    expect(parseNumber("1,0845")).toBe(1.0845);
    expect(parseNumber("(12.50)")).toBe(-12.5);
    expect(parseNumber("-12.5 EUR")).toBe(-12.5);
    expect(parseNumber("€ 3.40")).toBe(3.4);
    expect(parseNumber("−7,2")).toBe(-7.2);
    expect(parseNumber("1 000 000")).toBe(1000000);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("—")).toBeNull();
  });

  it("reads the side in the platforms' words, and leaves balance lines out", () => {
    expect(parseSide("buy")).toBe("long");
    expect(parseSide("Sell Limit")).toBe("short");
    expect(parseSide("Achat")).toBe("long");
    expect(parseSide("SHORT")).toBe("short");
    expect(parseSide("balance")).toBeNull();
    expect(parseSide("")).toBeNull();
  });

  it("reads dates in the account's time zone, with the platform's lag and in every usual format", () => {
    const at = Date.UTC(2026, 10, 27, 13, 5, 33);
    expect(parseDateTime("2026.11.27 14:05:33", "Europe/Paris", "dmy")).toBe(at);
    expect(parseDateTime("27/11/2026 14:05:33", "Europe/Paris", "dmy")).toBe(at);
    expect(parseDateTime("11/27/2026 2:05:33 PM", "Europe/Paris", "mdy")).toBe(at);
    expect(parseDateTime("2026-11-27T13:05:33Z", "Europe/Paris", "dmy")).toBe(at);
    expect(parseDateTime("2026.11.27 15:05:33", "Europe/Paris", "dmy", 1)).toBe(at);
    expect(parseDateTime("27/11/2026", "Europe/Paris", "dmy", 0, "14:05:33")).toBe(at);
    // Excel's day number for 2026-11-27 14:05:33.
    expect(parseDateTime(String(46353 + (14 * 3600 + 5 * 60 + 33) / 86400), "Europe/Paris", "dmy")).toBe(at);
    expect(parseDateTime("pas une date", "Europe/Paris", "dmy")).toBeNull();
  });

  it("guesses the order of day and month from the values", () => {
    expect(guessDateOrder(["03/04/2026", "13/04/2026"])).toBe("dmy");
    expect(guessDateOrder(["04/13/2026 10:00"])).toBe("mdy");
    expect(guessDateOrder(["2026-04-13"])).toBe("dmy");
  });
});

describe("journal import: CSV and columns", () => {
  it("reads CSV with its separator, quotes and line breaks", () => {
    expect(parseCsv('a;b;c\n1;"x;y";3\n')).toEqual([
      ["a", "b", "c"],
      ["1", "x;y", "3"],
    ]);
    expect(parseCsv('﻿name,note\n"A ""quoted"" word","two\nlines"')).toEqual([
      ["name", "note"],
      ['A "quoted" word', "two\nlines"],
    ]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("finds MetaTrader 5's columns, the two Time and two Price in order", () => {
    const m = detectColumns(["Time", "Position", "Symbol", "Type", "Volume", "Price", "S / L", "T / P", "Time", "Price", "Commission", "Swap", "Profit"]);
    expect(m).toEqual({ openedAt: 0, ticket: 1, market: 2, side: 3, size: 4, entry: 5, stop: 6, target: 7, closedAt: 8, exit: 9, commission: 10, swap: 11, profit: 12 });
  });

  it("finds MetaTrader 4's and the French platform's columns", () => {
    const mt4 = detectColumns(["Ticket", "Open Time", "Type", "Size", "Item", "Price", "S / L", "T / P", "Close Time", "Price", "Commission", "Taxes", "Swap", "Profit"]);
    expect(mt4).toMatchObject({ ticket: 0, openedAt: 1, side: 2, size: 3, market: 4, entry: 5, closedAt: 8, exit: 9, fees: 11, profit: 13 });
    const fr = detectColumns(["Heure", "Position", "Symbole", "Type", "Volume", "Prix", "S / L", "T / P", "Heure", "Prix", "Commission", "Swap", "Profit"]);
    expect(fr).toMatchObject({ openedAt: 0, market: 2, side: 3, size: 4, entry: 5, closedAt: 8, exit: 9 });
  });

  it("finds a journal app's export with separate dates and times", () => {
    const m = detectColumns(["Open Date", "Open Time", "Close Date", "Close Time", "Symbol", "Side", "Quantity", "Entry Price", "Exit Price", "Net P&L", "Commission"]);
    expect(m).toMatchObject({ openedAt: 0, openDate: 1, closedAt: 2, closeDate: 3, market: 4, side: 5, size: 6, entry: 7, exit: 8, profit: 9, commission: 10 });
    const plain = detectColumns(["Date", "Time", "Symbol", "Side", "Qty", "Entry", "Exit"]);
    expect(plain).toMatchObject({ openedAt: 0, openDate: 1, market: 2, side: 3, size: 4, entry: 5, exit: 6 });
    expect(plain.closedAt).toBeUndefined();
  });

  it("finds the positions in a whole MetaTrader report, between the account and the orders", () => {
    const rows = [
      ["Trade History Report"],
      ["Name:", "Test", "", ""],
      ["Positions"],
      ["Time", "Position", "Symbol", "Type", "Volume", "Price", "S / L", "T / P", "Time", "Price", "Commission", "Swap", "Profit"],
      ["2026.11.27 14:05:33", "593516600", "EURUSD", "buy", "1", "1.0850", "1.0830", "1.0890", "2026.11.27 16:00:00", "1.0890", "-7.00", "0.00", "400.00"],
      ["2026.11.27 17:00:00", "593516601", "XAUUSD", "sell", "0.5", "2650.00", "", "", "2026.11.27 17:30:00", "2655.00", "-2.50", "0.00", "-250.00"],
      ["Orders"],
      ["Open Time", "Order", "Symbol", "Type", "Volume", "Price", "S / L", "T / P", "Time", "State", "Comment"],
    ];
    const table = findTable(rows)!;
    expect(table.headerRow).toBe(3);
    expect(table.rows).toHaveLength(2);
    const drafts = draftsFrom(table.header, table.rows, table.columns, PARIS);
    expect(drafts[0]).toMatchObject({ market: "EURUSD", side: "long", entry: 1.085, exit: 1.089, size: 1, stop: 1.083, target: 1.089, fees: 7, ticket: "593516600", problems: [] });
    expect(drafts[0].pointValue).toBeCloseTo(100000, 0);
    expect(drafts[0].openedAt).toBe(Date.UTC(2026, 10, 27, 13, 5, 33));
    // No stop: the plan's risk will make 1R.
    expect(drafts[1]).toMatchObject({ market: "XAUUSD", side: "short", stop: null, fees: 2.5 });
    expect(drafts[1].pointValue).toBeCloseTo(100, 6);
  });

  it("adds the fees back to a net result to find the point value, and lists what is missing", () => {
    const header = ["Symbol", "Side", "Open", "Qty", "Entry Price", "Exit Price", "Net P&L", "Fees"];
    const rows = [
      ["MNQ", "Long", "2026-11-20 15:31", "2", "21000", "21010", "15.00", "5.00"],
      ["FOO", "short", "", "1", "10", "", "", ""],
    ];
    const columns = detectColumns(header);
    expect(columns).toMatchObject({ market: 0, side: 1, size: 3, entry: 4, exit: 5, profit: 6, fees: 7 });
    columns.openedAt = 2;
    const [mnq, foo] = draftsFrom(header, rows, columns, PARIS);
    // (15 + 5) / (10 points × 2 contracts) = 1 $ the point: MNQ's table gives 2 $ but the file wins.
    expect(mnq.pointValue).toBe(1);
    expect(mnq.problems).toEqual([]);
    // No exit: filed as a trade still open.
    expect(foo).toMatchObject({ exit: null, closedAt: null });
    expect(foo.problems).toEqual(["date illisible", "valeur du point inconnue"]);
  });

  it("counts a journal's positive commission as paid and its net result as net", () => {
    const header = ["Open Date", "Open Time", "Close Date", "Close Time", "Symbol", "Side", "Quantity", "Entry Price", "Exit Price", "Net P&L", "Commission"];
    const rows = [["11/20/2026", "3:31 PM", "11/20/2026", "3:55 PM", "MNQZ6", "Long", "2", "21000.25", "21012.75", "47.6", "2.4"]];
    const columns = detectColumns(header);
    expect(guessDateOrder(rows.map((r) => r[0]))).toBe("mdy");
    const [t] = draftsFrom(header, rows, columns, { ...PARIS, dateOrder: "mdy" });
    expect(t).toMatchObject({ fees: 2.4, pointValue: 2, problems: [] });
    expect(t.openedAt).toBe(Date.UTC(2026, 10, 20, 14, 31));
    expect(t.closedAt).toBe(Date.UTC(2026, 10, 20, 14, 55));
  });

  it("reads a French journal: semicolons, decimal commas, a date and a time apart, a trade without stop and one still open", () => {
    const text = "Date;Heure;Marché;Sens;Lots;Prix d'entrée;Stop;Prix de sortie;Frais;Résultat;Commentaire\n24/11/2026;09:40;EURUSD;Achat;0,30;1,05300;1,05150;1,05450;2,10;42,90;Cassure propre\n25/11/2026;14:05;XAUUSD;Vente;0,10;2 655,00;;2 650,00;1,00;49,00;\n27/11/2026;10:15;EURUSD;Achat;0,30;1,05800;1,05650;;0;;Encore ouvert\n";
    const table = findTable(parseCsv(text))!;
    expect(table.columns).toMatchObject({ openedAt: 0, openDate: 1, market: 2, side: 3, size: 4, entry: 5, stop: 6, exit: 7, fees: 8, profit: 9, notes: 10 });
    const [eur, gold, open] = draftsFrom(table.header, table.rows, table.columns, PARIS);
    expect(eur).toMatchObject({ side: "long", size: 0.3, entry: 1.053, stop: 1.0515, exit: 1.0545, fees: 2.1, notes: "Cassure propre", problems: [] });
    expect(eur.openedAt).toBe(Date.UTC(2026, 10, 24, 8, 40));
    expect(gold).toMatchObject({ side: "short", entry: 2655, exit: 2650, stop: null, problems: [] });
    expect(gold.pointValue).toBeCloseTo(100, 6);
    expect(open).toMatchObject({ exit: null, closedAt: null, problems: [] });
  });

  it("leaves balance lines out and keys trades so a file imported twice adds nothing", () => {
    const header = ["Ticket", "Open Time", "Type", "Size", "Item", "Price", "Close Time", "Price", "Profit"];
    const rows = [
      ["1", "2026.11.01 10:00", "balance", "", "", "", "", "", "10000"],
      ["2", "2026.11.02 10:00", "buy", "1", "EURUSD", "1.1", "2026.11.02 11:00", "1.101", "100"],
    ];
    const drafts = draftsFrom(header, rows, detectColumns(header), PARIS);
    expect(drafts).toHaveLength(1);
    expect(importKey(drafts[0])).toBe("#2");
    expect(importKey({ ...drafts[0], ticket: null })).toBe(`EURUSD|${Math.round(drafts[0].openedAt! / 60000)}|1.1`);
  });
});
