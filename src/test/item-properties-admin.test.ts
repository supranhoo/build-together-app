/**
 * Admin write helper tests — verify replaceGroupPropertyMap and
 * upsertPropertyDefinition delegate to the supabase client with the
 * expected shape. We mock the client at the module boundary because the
 * surface we ship to the admin screen is "what gets sent to the DB".
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockState: any = { lastInsert: null, lastUpsert: null, deleteCalls: [] };

vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string): any => {
    const chain: any = {
      _table: table,
      _filters: [] as any[],
      delete() { mockState.deleteCalls.push({ table, filters: chain._filters, op: "delete" }); return chain; },
      insert(rows: any) { mockState.lastInsert = { table, rows }; return Promise.resolve({ error: null }); },
      upsert(row: any, opts: any) { mockState.lastUpsert = { table, row, opts }; return Promise.resolve({ error: null }); },
      eq(c: string, v: any) { chain._filters.push(["eq", c, v]); return chain; },
      is(c: string, v: any) { chain._filters.push(["is", c, v]); return chain; },
      then(resolve: any) { return Promise.resolve({ error: null }).then(resolve); },
    };
    return chain;
  };
  return { supabase: { from: builder } };
});

import { replaceGroupPropertyMap, upsertPropertyDefinition } from "@/lib/item-properties";

beforeEach(() => {
  mockState.lastInsert = null;
  mockState.lastUpsert = null;
  mockState.deleteCalls = [];
});

describe("upsertPropertyDefinition", () => {
  it("sends snake_case row with correct conflict target", async () => {
    await upsertPropertyDefinition({
      profitCenterId: "pc-1",
      propertyKey: "Mn",
      displayName: "Manganese",
      unit: "%",
      dataType: "decimal",
      decimals: 2,
      minValue: 0,
      maxValue: 100,
      sortOrder: 10,
      isActive: true,
    });
    expect(mockState.lastUpsert.table).toBe("item_property_definitions");
    expect(mockState.lastUpsert.opts).toEqual({ onConflict: "profit_center_id,property_key" });
    expect(mockState.lastUpsert.row).toMatchObject({
      profit_center_id: "pc-1",
      property_key: "Mn",
      display_name: "Manganese",
      data_type: "decimal",
      is_active: true,
    });
  });
});

describe("replaceGroupPropertyMap", () => {
  it("deletes existing slot then inserts new entries (group default)", async () => {
    await replaceGroupPropertyMap("pc-1", "RM", "ORE", null, [
      { propertyKey: "Mn", isRequired: true, sortOrder: 10 },
      { propertyKey: "Moisture", isRequired: false, sortOrder: 90 },
    ]);
    expect(mockState.deleteCalls.length).toBe(1);
    const filters = mockState.deleteCalls[0].filters;
    expect(filters).toEqual(expect.arrayContaining([
      ["eq", "profit_center_id", "pc-1"],
      ["eq", "material_type", "RM"],
      ["eq", "group_name", "ORE"],
      ["is", "subgroup", null],
    ]));
    expect(mockState.lastInsert.rows).toEqual([
      { profit_center_id: "pc-1", material_type: "RM", group_name: "ORE", subgroup: null, property_key: "Mn", is_required: true, sort_order: 10 },
      { profit_center_id: "pc-1", material_type: "RM", group_name: "ORE", subgroup: null, property_key: "Moisture", is_required: false, sort_order: 90 },
    ]);
  });

  it("uses eq for subgroup when supplied", async () => {
    await replaceGroupPropertyMap("pc-1", "RM", "ORE", "SINTER", [
      { propertyKey: "Mn", isRequired: true, sortOrder: 10 },
    ]);
    const filters = mockState.deleteCalls[0].filters;
    expect(filters).toEqual(expect.arrayContaining([
      ["eq", "subgroup", "SINTER"],
    ]));
  });

  it("skips insert when entries empty (clears the slot)", async () => {
    await replaceGroupPropertyMap("pc-1", "RM", "ORE", null, []);
    expect(mockState.deleteCalls.length).toBe(1);
    expect(mockState.lastInsert).toBeNull();
  });
});
