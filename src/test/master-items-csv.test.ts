import { describe, it, expect } from "vitest";
import { parseCsv, toCsv } from "@/lib/csv";
import {
  buildItemTemplateRows,
  ITEM_CSV_HEADERS,
  ITEM_CSV_SPEC_HEADERS,
  itemsToCsvRows,
  parseItemCsv,
} from "@/lib/master-items-csv";
import { FIXED_SPEC_COLUMNS } from "@/lib/spec-columns";
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
  it("uses base + per-spec + is_active columns", () => {
    // 10 base + 14 spec + 1 trailing = 25
    expect(ITEM_CSV_HEADERS).toHaveLength(10 + FIXED_SPEC_COLUMNS.length + 1);
    expect(ITEM_CSV_SPEC_HEADERS).toEqual(FIXED_SPEC_COLUMNS.map((c) => c.key));
    expect(ITEM_CSV_HEADERS.includes("specs_json" as never)).toBe(false);
    expect(ITEM_CSV_HEADERS[10]).toBe("Mn");
    expect(ITEM_CSV_HEADERS[ITEM_CSV_HEADERS.length - 1]).toBe("is_active");

    const tpl = buildItemTemplateRows();
    expect(tpl[0]).toEqual([...ITEM_CSV_HEADERS]);
    expect(tpl[1][0]).toBe("RM-MN-01"); // sample row present
    // Sample fills Mn=35 and Fe=12 in their respective columns
    const mnIdx = ITEM_CSV_HEADERS.indexOf("Mn" as never);
    const feIdx = ITEM_CSV_HEADERS.indexOf("Fe" as never);
    expect(tpl[1][mnIdx]).toBe("35");
    expect(tpl[1][feIdx]).toBe("12");
    expect(tpl[2].every((c) => c === "")).toBe(true); // blank guidance row
  });
});

describe("itemsToCsvRows export", () => {
  const items: MasterItem[] = [
    { id: "1", profitCenterId: "p", code: "RM-01", name: "Mn Ore", type: "RM", groupName: "Ores", subgroup: null, uom: "MT", stdCost: 100.5, specs: { Mn: 35, Fe: 12 }, minLevel: 10, maxLevel: 100, reorderLevel: 25, isActive: true },
    { id: "2", profitCenterId: "p", code: "FG-01", name: "FeMn", type: null, groupName: null, subgroup: null, uom: "MT", stdCost: null, specs: {}, minLevel: null, maxLevel: null, reorderLevel: null, isActive: false },
  ];
  it("emits header + one row per item with per-spec columns and blanks for nulls", () => {
    const rows = itemsToCsvRows(items);
    expect(rows[0]).toEqual([...ITEM_CSV_HEADERS]);
    const mnIdx = ITEM_CSV_HEADERS.indexOf("Mn" as never);
    const feIdx = ITEM_CSV_HEADERS.indexOf("Fe" as never);
    const isActiveIdx = ITEM_CSV_HEADERS.indexOf("is_active" as never);
    expect(rows[1][0]).toBe("RM-01");
    expect(rows[1][6]).toBe("100.5");
    expect(rows[1][mnIdx]).toBe("35");
    expect(rows[1][feIdx]).toBe("12");
    expect(rows[1][isActiveIdx]).toBe("true");
    expect(rows[2][2]).toBe(""); // null type
    expect(rows[2][6]).toBe(""); // null cost
    expect(rows[2][mnIdx]).toBe(""); // empty specs → blank cell
    expect(rows[2][isActiveIdx]).toBe("false");
  });
});

describe("parseItemCsv", () => {
  const header = ITEM_CSV_HEADERS.join(",");
  const blanks = (n: number) => new Array(n).fill("").join(",");
  // Indexes into the canonical row layout.
  const baseLen = 10;
  const specLen = FIXED_SPEC_COLUMNS.length;
  const buildRow = (overrides: Partial<Record<string, string>> = {}) => {
    const row: string[] = new Array(ITEM_CSV_HEADERS.length).fill("");
    ITEM_CSV_HEADERS.forEach((h, i) => {
      if (overrides[h] !== undefined) row[i] = overrides[h]!;
    });
    return row.join(",");
  };

  it("parses a valid row with per-spec columns", () => {
    const csv = `${header}\n${buildRow({ code: "RM-01", name: "Mn Ore", type: "RM", group_name: "Ores", subgroup: "Lump", uom: "MT", std_cost: "100", Mn: "35", Fe: "12", is_active: "true" })}`;
    const { rows, errors } = parseItemCsv(parseCsv(csv));
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].input.code).toBe("RM-01");
    expect(rows[0].input.type).toBe("RM");
    expect(rows[0].input.specs).toEqual({ Mn: 35, Fe: 12 });
    expect(rows[0].input.isActive).toBe(true);
  });

  it("collects per-row errors without aborting the batch", () => {
    const csv = [
      header,
      buildRow({ code: "RM-01", name: "Good", type: "RM", uom: "MT" }),               // ok
      buildRow({ name: "Missing code", type: "RM", uom: "MT" }),                       // error: code
      buildRow({ code: "RM-02", name: "Bad type", type: "XYZ", uom: "MT" }),           // error: type
      buildRow({ code: "RM-03", name: "Bad cost", type: "RM", uom: "MT", std_cost: "abc" }), // numeric
      buildRow({ code: "RM-04", name: "Bad spec", type: "RM", uom: "MT", Mn: "not-a-number" }), // spec
    ].join("\n");
    const { rows, errors } = parseItemCsv(parseCsv(csv));
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(4);
    expect(errors[0].rowNumber).toBe(3);
    expect(errors.map((e) => e.message)).toEqual([
      expect.stringMatching(/code is required/),
      expect.stringMatching(/type must be one of/),
      expect.stringMatching(/numeric column/),
      expect.stringMatching(/Mn must be a number/),
    ]);
  });

  it("treats blank is_active as active=true (sensible default)", () => {
    const csv = `${header}\n${buildRow({ code: "RM-09", name: "Defaulted", type: "RM", uom: "MT" })}`;
    const { rows } = parseItemCsv(parseCsv(csv));
    expect(rows[0].input.isActive).toBe(true);
  });

  it("treats false/0/no as inactive", () => {
    const csv = [
      header,
      buildRow({ code: "RM-10", name: "Off", type: "RM", uom: "MT", is_active: "false" }),
      buildRow({ code: "RM-11", name: "Off", type: "RM", uom: "MT", is_active: "0" }),
      buildRow({ code: "RM-12", name: "Off", type: "RM", uom: "MT", is_active: "no" }),
    ].join("\n");
    const { rows } = parseItemCsv(parseCsv(csv));
    expect(rows.map((r) => r.input.isActive)).toEqual([false, false, false]);
  });

  it("skips fully blank lines silently", () => {
    const csv = `${header}\n${buildRow({ code: "RM-01", name: "Mn Ore", type: "RM", uom: "MT" })}\n${blanks(ITEM_CSV_HEADERS.length)}\n`;
    const { rows, errors } = parseItemCsv(parseCsv(csv));
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it("reports missing required header columns", () => {
    const { errors } = parseItemCsv([["code", "name"]]);
    expect(errors[0].message).toMatch(/Missing required column/);
  });

  it("accepts non-numeric Size values (e.g. range strings like '10-30')", () => {
    const csv = `${header}\n${buildRow({ code: "RM-20", name: "Lump", type: "RM", uom: "MT", Size: "10-30" })}`;
    const { rows, errors } = parseItemCsv(parseCsv(csv));
    expect(errors).toEqual([]);
    expect(rows[0].input.specs).toEqual({ Size: "10-30" });
  });
});
