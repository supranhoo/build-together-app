/**
 * Procurement Phase B — pure-logic tests for the service layer.
 *
 * Covers status-transition guards (PR + PO), PO total computation, and FX
 * lookup. We deliberately do NOT mock Supabase here — RLS coverage lives in
 * the integration layer; this file pins down the policy logic that the UI
 * depends on so a regression cannot ship silently.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  calcPoTotal,
  canTransitionPo,
  canTransitionPr,
  findFxRate,
  type FxRate,
} from "@/lib/procurement";

describe("PR transitions (single-step approval)", () => {
  it("allows draft → submitted only", () => {
    expect(canTransitionPr("draft", "submitted")).toBe(true);
    expect(canTransitionPr("draft", "approved")).toBe(false);
    expect(canTransitionPr("draft", "converted")).toBe(false);
  });

  it("allows submitted → approved | rejected | draft", () => {
    expect(canTransitionPr("submitted", "approved")).toBe(true);
    expect(canTransitionPr("submitted", "rejected")).toBe(true);
    expect(canTransitionPr("submitted", "draft")).toBe(true);
    expect(canTransitionPr("submitted", "converted")).toBe(false);
  });

  it("forbids any move out of rejected or closed", () => {
    for (const t of ["draft", "submitted", "approved", "converted", "closed"] as const) {
      expect(canTransitionPr("rejected", t)).toBe(false);
      expect(canTransitionPr("closed", t)).toBe(false);
    }
  });

  it("approved can convert or close, nothing else", () => {
    expect(canTransitionPr("approved", "converted")).toBe(true);
    expect(canTransitionPr("approved", "closed")).toBe(true);
    expect(canTransitionPr("approved", "draft")).toBe(false);
    expect(canTransitionPr("approved", "rejected")).toBe(false);
  });
});

describe("PO transitions", () => {
  it("draft can be sent or cancelled, not received", () => {
    expect(canTransitionPo("draft", "sent")).toBe(true);
    expect(canTransitionPo("draft", "cancelled")).toBe(true);
    expect(canTransitionPo("draft", "received")).toBe(false);
  });

  it("partial-receipt can stay partial, become received, or cancelled", () => {
    expect(canTransitionPo("partially_received", "partially_received")).toBe(true);
    expect(canTransitionPo("partially_received", "received")).toBe(true);
    expect(canTransitionPo("partially_received", "cancelled")).toBe(true);
    expect(canTransitionPo("partially_received", "draft")).toBe(false);
  });

  it("received can only close", () => {
    expect(canTransitionPo("received", "closed")).toBe(true);
    expect(canTransitionPo("received", "cancelled")).toBe(false);
    expect(canTransitionPo("received", "sent")).toBe(false);
  });

  it("closed and cancelled are terminal", () => {
    for (const t of ["draft", "sent", "received", "closed", "cancelled"] as const) {
      expect(canTransitionPo("closed", t)).toBe(false);
      expect(canTransitionPo("cancelled", t)).toBe(false);
    }
  });
});

describe("calcPoTotal", () => {
  it("returns 0 for an empty PO", () => {
    expect(calcPoTotal([])).toBe(0);
  });
  it("multiplies qty × unit cost across lines", () => {
    expect(calcPoTotal([
      { qtyOrdered: 10, unitCost: 25.5 },
      { qtyOrdered: 4, unitCost: 100 },
    ])).toBeCloseTo(655);
  });
});

describe("findFxRate", () => {
  const today = "2026-04-25";
  const rates: FxRate[] = [
    { id: "1", profitCenterId: "pc", fromCurrency: "USD", toCurrency: "INR", rate: 82.1, effectiveDate: "2026-01-01", notes: null },
    { id: "2", profitCenterId: "pc", fromCurrency: "USD", toCurrency: "INR", rate: 83.5, effectiveDate: "2026-04-01", notes: null },
    { id: "3", profitCenterId: "pc", fromCurrency: "EUR", toCurrency: "INR", rate: 90.0, effectiveDate: "2026-02-15", notes: null },
  ];

  it("returns 1 for same-currency conversion", () => {
    expect(findFxRate(rates, "INR", "INR", today)).toBe(1);
  });

  it("picks the most recent rate at-or-before the as-of date", () => {
    expect(findFxRate(rates, "USD", "INR", today)).toBe(83.5);
    expect(findFxRate(rates, "USD", "INR", "2026-03-01")).toBe(82.1);
  });

  it("returns null when no rate exists for the pair", () => {
    expect(findFxRate(rates, "GBP", "INR", today)).toBe(null);
  });

  it("returns null when all rates are after the as-of date", () => {
    expect(findFxRate(rates, "USD", "INR", "2025-12-31")).toBe(null);
  });
});

describe("Phase B wiring", () => {
  const REPO = process.cwd();
  const PAGE = readFileSync(join(REPO, "src/pages/AdminProcurement.tsx"), "utf8");

  it("AdminProcurement imports the three live tab components", () => {
    expect(PAGE).toMatch(/from "@\/components\/procurement\/SuppliersTab"/);
    expect(PAGE).toMatch(/from "@\/components\/procurement\/PRTab"/);
    expect(PAGE).toMatch(/from "@\/components\/procurement\/POTab"/);
  });

  it("Suppliers / PR / PO tabs are marked live (not scaffold) in Phase B", () => {
    // For each id, the same TabSpec entry must declare kind: "live".
    const re = (id: string) =>
      new RegExp(`id:\\s*"${id}"[\\s\\S]{0,200}?kind:\\s*"live"`);
    for (const id of ["suppliers", "pr", "po"]) {
      expect(PAGE, `${id} should be live`).toMatch(re(id));
    }
  });
});
