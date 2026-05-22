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
  it("uses base + per-spec + is_active columns and excludes code", () => {
    // 6 base + 14 spec + 1 trailing = 21
    expect(ITEM_CSV_HEADERS).toHaveLength(6 + FIXED_SPEC_COLUMNS.length + 1);
    expect(ITEM_CSV_SPEC_HEADERS).toEqual(FIXED_SPEC_COLUMNS.map((c) => c.key));
    expect(ITEM_CSV_HEADERS.includes("code" as never)).toBe(false);
    expect(ITEM_CSV_HEADERS.includes("specs_json" as never)).toBe(false);
    expect(ITEM_CSV_HEADERS.includes("min_level" as never)).toBe(false);
    expect(ITEM_CSV_HEADERS[0]).toBe("name");
    expect(ITEM_CSV_HEADERS[6]).toBe("Mn");
    expect(ITEM_CSV_HEADERS[ITEM_CSV_HEADERS.length - 1]).toBe("is_active");

    const tpl = buildItemTemplateRows();
    expect(tpl[0]).toEqual([...ITEM_CSV_HEADERS]);
    expect(tpl[1][0]).toBe("Manganese Ore (Lump)"); // sample row name
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
  it("emits header + one row per item with code as the first column", () => {
    const rows = itemsToCsvRows(items);
    expect(rows[0]).toEqual(["code", ...ITEM_CSV_HEADERS]);
    const exportHeaders = rows[0];
    const mnIdx = exportHeaders.indexOf("Mn");
    const isActiveIdx = exportHeaders.indexOf("is_active");
    expect(rows[1][0]).toBe("RM-01"); // code first
    expect(rows[1][1]).toBe("Mn Ore"); // then name
    expect(rows[1][2]).toBe("RM");
    expect(rows[1][6]).toBe("100.5"); // std_cost (shifted +1 by code)
    expect(rows[1][mnIdx]).toBe("35");
    expect(rows[1][isActiveIdx]).toBe("true");
    expect(rows[2][0]).toBe("FG-01");
    expect(rows[2][2]).toBe(""); // null type
    expect(rows[2][mnIdx]).toBe(""); // empty specs → blank cell
    expect(rows[2][isActiveIdx]).toBe("false");
  });
});

describe("parseItemCsv", () => {
  const header = ITEM_CSV_HEADERS.join(",");
  const blanks = (n: number) => new Array(n).fill("").join(",");
  const buildRow = (overrides: Partial<Record<string, string>> = {}) => {
    const row: string[] = new Array(ITEM_CSV_HEADERS.length).fill("");
    ITEM_CSV_HEADERS.forEach((h, i) => {
      if (overrides[h] !== undefined) row[i] = overrides[h]!;
    });
    return row.join(",");
  };

  it("parses a valid row with per-spec columns and no code", () => {
    const csv = `${header}\n${buildRow({ name: "Mn Ore", type: "RM", group_name: "Ores", subgroup: "Lump", uom: "MT", std_cost: "100", Mn: "35", Fe: "12", is_active: "true" })}`;
    const { rows, errors } = parseItemCsv(parseCsv(csv));
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].input.name).toBe("Mn Ore");
    expect(rows[0].input.type).toBe("RM");
    expect(rows[0].input.specs).toEqual({ Mn: 35, Fe: 12 });
    expect(rows[0].input.isActive).toBe(true);
    // Code is not in the parsed input — page layer assigns it.
    expect((rows[0].input as Record<string, unknown>).code).toBeUndefined();
  });

  it("rejects uploads that include a legacy code column", () => {
    const csv = `code,${header}\nRM-99,${buildRow({ name: "X", type: "RM", uom: "MT" })}`;
    const { errors } = parseItemCsv(parseCsv(csv));
    expect(errors[0].message).toMatch(/code column is not allowed/);
  });

  it("collects per-row errors without aborting the batch", () => {
    const csv = [
      header,
      buildRow({ name: "Good", type: "RM", uom: "MT" }),                       // ok
      buildRow({ type: "RM", uom: "MT" }),                                     // error: name
      buildRow({ name: "Bad type", type: "XYZ", uom: "MT" }),                  // error: type
      buildRow({ name: "Bad cost", type: "RM", uom: "MT", std_cost: "abc" }),  // numeric
      buildRow({ name: "Bad spec", type: "RM", uom: "MT", Mn: "not-a-number" }), // spec
    ].join("\n");
    const { rows, errors } = parseItemCsv(parseCsv(csv));
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(4);
    expect(errors.map((e) => e.message)).toEqual([
      expect.stringMatching(/name is required/),
      expect.stringMatching(/type must be one of/),
      expect.stringMatching(/std_cost/),
      expect.stringMatching(/Mn must be a number/),
    ]);
  });

  it("treats blank is_active as active=true (sensible default)", () => {
    const csv = `${header}\n${buildRow({ name: "Defaulted", type: "RM", uom: "MT" })}`;
    const { rows } = parseItemCsv(parseCsv(csv));
    expect(rows[0].input.isActive).toBe(true);
  });

  it("treats false/0/no as inactive", () => {
    const csv = [
      header,
      buildRow({ name: "Off", type: "RM", uom: "MT", is_active: "false" }),
      buildRow({ name: "Off", type: "RM", uom: "MT", is_active: "0" }),
      buildRow({ name: "Off", type: "RM", uom: "MT", is_active: "no" }),
    ].join("\n");
    const { rows } = parseItemCsv(parseCsv(csv));
    expect(rows.map((r) => r.input.isActive)).toEqual([false, false, false]);
  });

  it("skips fully blank lines silently", () => {
    const csv = `${header}\n${buildRow({ name: "Mn Ore", type: "RM", uom: "MT" })}\n${blanks(ITEM_CSV_HEADERS.length)}\n`;
    const { rows, errors } = parseItemCsv(parseCsv(csv));
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it("reports missing required header columns", () => {
    const { errors } = parseItemCsv([["name"]]);
    expect(errors[0].message).toMatch(/Missing required column/);
  });

  it("accepts non-numeric Size values (e.g. range strings like '10-30')", () => {
    const csv = `${header}\n${buildRow({ name: "Lump", type: "RM", uom: "MT", Size: "10-30" })}`;
    const { rows, errors } = parseItemCsv(parseCsv(csv));
    expect(errors).toEqual([]);
    expect(rows[0].input.specs).toEqual({ Size: "10-30" });
  });
});
