/**
 * Phase C tests — pure logic only (no DB).
 *  - canTransitionShipment: workflow guard
 *  - computeShortages: MRP shortage classification + suggested qty
 */
import { describe, it, expect } from "vitest";
import {
  canTransitionShipment,
  computeShortages,
  type ShipmentStatus,
  type ShortageInputItem,
} from "@/lib/procurement";

describe("canTransitionShipment", () => {
  const allowed: Array<[ShipmentStatus, ShipmentStatus]> = [
    ["planned", "in_transit"],
    ["planned", "cancelled"],
    ["in_transit", "customs"],
    ["in_transit", "delivered"],
    ["in_transit", "cancelled"],
    ["customs", "delivered"],
    ["customs", "cancelled"],
  ];
  const forbidden: Array<[ShipmentStatus, ShipmentStatus]> = [
    ["delivered", "in_transit"],
    ["delivered", "cancelled"],
    ["cancelled", "planned"],
    ["planned", "delivered"],
    ["planned", "customs"],
    ["customs", "in_transit"],
  ];

  it.each(allowed)("allows %s → %s", (from, to) => {
    expect(canTransitionShipment(from, to)).toBe(true);
  });
  it.each(forbidden)("forbids %s → %s", (from, to) => {
    expect(canTransitionShipment(from, to)).toBe(false);
  });
});

describe("computeShortages", () => {
  const mat = (over: Partial<ShortageInputItem>): ShortageInputItem => ({
    id: over.id ?? "m1",
    code: "C1",
    name: "Mat 1",
    uom: "kg",
    minLevel: null,
    maxLevel: null,
    reorderLevel: null,
    isActive: true,
    ...over,
  });

  it("skips inactive materials", () => {
    const rows = computeShortages(
      [mat({ id: "m1", isActive: false, minLevel: 100 })],
      new Map([["m1", 0]]),
      new Map(),
    );
    expect(rows).toHaveLength(0);
  });

  it("skips materials without thresholds", () => {
    const rows = computeShortages([mat({ id: "m1" })], new Map([["m1", 0]]), new Map());
    expect(rows).toHaveLength(0);
  });

  it("classifies below_min when available < minLevel", () => {
    const rows = computeShortages(
      [mat({ id: "m1", minLevel: 100, reorderLevel: 150, maxLevel: 300 })],
      new Map([["m1", 30]]),
      new Map([["m1", 20]]), // available = 50
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("below_min");
    expect(rows[0].available).toBe(50);
    expect(rows[0].shortage).toBe(250); // target 300 - available 50
  });

  it("classifies reorder when at or below reorder level but above min", () => {
    const rows = computeShortages(
      [mat({ id: "m1", minLevel: 50, reorderLevel: 150, maxLevel: 300 })],
      new Map([["m1", 100]]),
      new Map(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("reorder");
    expect(rows[0].shortage).toBe(200);
  });

  it("returns nothing when above reorder level (ok)", () => {
    const rows = computeShortages(
      [mat({ id: "m1", minLevel: 50, reorderLevel: 150, maxLevel: 300 })],
      new Map([["m1", 200]]),
      new Map(),
    );
    expect(rows).toHaveLength(0);
  });

  it("counts on-order toward availability", () => {
    const rows = computeShortages(
      [mat({ id: "m1", minLevel: 100, reorderLevel: 150, maxLevel: 300 })],
      new Map([["m1", 40]]),
      new Map([["m1", 200]]), // available = 240, above reorder
    );
    expect(rows).toHaveLength(0);
  });

  it("falls back to reorder/min when maxLevel is null", () => {
    const rows = computeShortages(
      [mat({ id: "m1", minLevel: 100, reorderLevel: 200 })],
      new Map([["m1", 50]]),
      new Map(),
    );
    expect(rows[0].shortage).toBe(150); // target = reorder 200 - available 50
  });

  it("sorts below_min before reorder, then by shortage descending", () => {
    const rows = computeShortages(
      [
        mat({ id: "a", code: "A", minLevel: 100, reorderLevel: 150, maxLevel: 300 }), // avail 120 → reorder, shortage 180
        mat({ id: "b", code: "B", minLevel: 50, reorderLevel: 100, maxLevel: 200 }),  // avail 60 → below_min, shortage 140
        mat({ id: "c", code: "C", minLevel: 200, reorderLevel: 250, maxLevel: 500 }), // avail 10 → below_min, shortage 490
      ],
      new Map([["a", 120], ["b", 60], ["c", 10]]),
      new Map(),
    );
    expect(rows.map((r) => r.materialId)).toEqual(["c", "b", "a"]);
    expect(rows[0].status).toBe("below_min");
    expect(rows[2].status).toBe("reorder");
  });
});
