import { describe, it, expect } from "vitest";
import { parseCsv, toCsv } from "@/lib/csv";
import {
  buildItemTemplateRows,
  ITEM_CSV_HEADERS,
  itemsToCsvRows,
  parseItemCsv,
} from "@/lib/master-items-csv";
import type { MasterItem } from "@/lib/master-data";

describe("CSV utility", () => {
  it("round-trips simple rows", () => {
    const rows = [["a", "b"], ["1", "2"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("quotes cells containing commas, quotes, and newlines", () => {
    const csv = toCsv([["plain", 'has "quotes"', "has,comma", "line1\nline2"]]);
    expect(csv).toContain('"has ""quotes"""');
    expect(csv).toContain('"has,comma"');
    expect(csv).toContain('"line1\nline2"');
    expect(parseCsv(csv)).toEqual([["plain", 'has "quotes"', "has,comma", "line1\nline2"]]);
  });

  it("treats empty/null/undefined cells as empty strings", () => {
    expect(toCsv([[null, undefined, ""]])).toBe(",,");
  });

  it("tolerates LF, CRLF, and trailing newline", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("throws on unterminated quoted field", () => {
    expect(() => parseCsv('a,"unterminated')).toThrow(/Unterminated/);
  });
});

describe("Item Master CSV template", () => {
  it("uses the canonical 12-column header", () => {
    expect(ITEM_CSV_HEADERS).toHaveLength(12);
    const tpl = buildItemTemplateRows();
    expect(tpl[0]).toEqual([...ITEM_CSV_HEADERS]);
    expect(tpl[1][0]).toBe("RM-MN-01"); // sample row present
    expect(tpl[2].every((c) => c === "")).toBe(true); // blank guidance row
  });
});

describe("itemsToCsvRows export", () => {
  const items: MasterItem[] = [
    { id: "1", profitCenterId: "p", code: "RM-01", name: "Mn Ore", type: "RM", groupName: "Ores", subgroup: null, uom: "MT", stdCost: 100.5, specs: { Mn: 35 }, minLevel: 10, maxLevel: 100, reorderLevel: 25, isActive: true },
    { id: "2", profitCenterId: "p", code: "FG-01", name: "FeMn", type: null, groupName: null, subgroup: null, uom: "MT", stdCost: null, specs: {}, minLevel: null, maxLevel: null, reorderLevel: null, isActive: false },
  ];
  it("emits header + one row per item with blanks for nulls", () => {
    const rows = itemsToCsvRows(items);
    expect(rows[0]).toEqual([...ITEM_CSV_HEADERS]);
    expect(rows[1][0]).toBe("RM-01");
    expect(rows[1][6]).toBe("100.5");
    expect(rows[1][10]).toBe('{"Mn":35}');
    expect(rows[1][11]).toBe("true");
    expect(rows[2][2]).toBe(""); // null type
    expect(rows[2][6]).toBe(""); // null cost
    expect(rows[2][10]).toBe(""); // empty specs
    expect(rows[2][11]).toBe("false");
  });
});

describe("parseItemCsv", () => {
  const header = ITEM_CSV_HEADERS.join(",");

  it("parses a valid row", () => {
    const csv = `${header}\nRM-01,Mn Ore,RM,Ores,Lump,MT,100,10,200,25,"{""Mn"":35}",true`;
    const { rows, errors } = parseItemCsv(parseCsv(csv));
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].input.code).toBe("RM-01");
    expect(rows[0].input.type).toBe("RM");
    expect(rows[0].input.specs).toEqual({ Mn: 35 });
    expect(rows[0].input.isActive).toBe(true);
  });

  it("collects per-row errors without aborting the batch", () => {
    const csv = [
      header,
      "RM-01,Good,RM,,,MT,,,,,,",                       // ok
      ",Missing code,RM,,,MT,,,,,,",                     // error: code
      "RM-02,Bad type,XYZ,,,MT,,,,,,",                   // error: type
      "RM-03,Bad cost,RM,,,MT,abc,,,,,",                // error: numeric
      "RM-04,Bad specs,RM,,,MT,,,,,not-json,true",      // error: specs
    ].join("\n");
    const { rows, errors } = parseItemCsv(parseCsv(csv));
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(4);
    expect(errors[0].rowNumber).toBe(3);
    expect(errors.map((e) => e.message)).toEqual([
      expect.stringMatching(/code is required/),
      expect.stringMatching(/type must be one of/),
      expect.stringMatching(/numeric column/),
      expect.stringMatching(/specs_json invalid/),
    ]);
  });

  it("treats blank is_active as active=true (sensible default)", () => {
    const csv = `${header}\nRM-09,Defaulted,RM,,,MT,,,,,,`;
    const { rows } = parseItemCsv(parseCsv(csv));
    expect(rows[0].input.isActive).toBe(true);
  });

  it("treats false/0/no as inactive", () => {
    const csv = `${header}\nRM-10,Off,RM,,,MT,,,,,,false\nRM-11,Off,RM,,,MT,,,,,,0\nRM-12,Off,RM,,,MT,,,,,,no`;
    const { rows } = parseItemCsv(parseCsv(csv));
    expect(rows.map((r) => r.input.isActive)).toEqual([false, false, false]);
  });

  it("skips fully blank lines silently", () => {
    const csv = `${header}\nRM-01,Mn Ore,RM,,,MT,,,,,,\n,,,,,,,,,,,\n`;
    const { rows, errors } = parseItemCsv(parseCsv(csv));
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it("reports missing required header columns", () => {
    const { errors } = parseItemCsv([["code", "name"]]);
    expect(errors[0].message).toMatch(/Missing required column/);
  });
});
