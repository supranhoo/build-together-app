/**
 * Phase D tests — pure logic only (no DB).
 *  - computeOverallScore: equally-weighted mean of present sub-scores
 *  - canTransitionRisk: workflow guard
 *  - buildDashboardKpis: aggregation rules
 */
import { describe, it, expect } from "vitest";
import {
  buildDashboardKpis,
  canTransitionRisk,
  computeOverallScore,
  type ImportShipment,
  type PurchaseOrder,
  type PurchaseRequisition,
  type RiskEvent,
  type RiskStatus,
  type ShortageRow,
  type Supplier,
  type SupplierEvaluation,
} from "@/lib/procurement";

describe("computeOverallScore", () => {
  it("returns null when all sub-scores are null", () => {
    expect(computeOverallScore(null, null, null)).toBeNull();
  });
  it("uses single sub-score when others are null", () => {
    expect(computeOverallScore(80, null, null)).toBe(80);
    expect(computeOverallScore(null, 90, null)).toBe(90);
  });
  it("averages two sub-scores", () => {
    expect(computeOverallScore(80, 90, null)).toBe(85);
  });
  it("averages three sub-scores", () => {
    expect(computeOverallScore(60, 70, 80)).toBe(70);
  });
  it("rounds to one decimal", () => {
    // (70 + 75 + 80) / 3 = 75 → rounded to 75
    expect(computeOverallScore(70, 75, 80)).toBe(75);
    // (70 + 71 + 73) / 3 = 71.333... → 71.3
    expect(computeOverallScore(70, 71, 73)).toBe(71.3);
  });
});

describe("canTransitionRisk", () => {
  const allowed: Array<[RiskStatus, RiskStatus]> = [
    ["open", "mitigated"],
    ["open", "closed"],
    ["mitigated", "closed"],
    ["mitigated", "open"],
  ];
  const forbidden: Array<[RiskStatus, RiskStatus]> = [
    ["closed", "open"],
    ["closed", "mitigated"],
    ["open", "open"],
    ["mitigated", "mitigated"],
  ];
  it.each(allowed)("allows %s → %s", (from, to) => {
    expect(canTransitionRisk(from, to)).toBe(true);
  });
  it.each(forbidden)("forbids %s → %s", (from, to) => {
    expect(canTransitionRisk(from, to)).toBe(false);
  });
});

// ---------- buildDashboardKpis ----------

const pc = "00000000-0000-0000-0000-000000000001";

function pr(status: PurchaseRequisition["status"]): PurchaseRequisition {
  return {
    id: crypto.randomUUID(),
    profitCenterId: pc,
    prNumber: "PR-1",
    status,
    priority: null,
    requestedBy: "u",
    requestedForDate: null,
    approvedBy: null,
    approvedAt: null,
    rejectedReason: null,
    notes: null,
    createdAt: "",
    updatedAt: "",
  };
}

function po(status: PurchaseOrder["status"], currency: string, total: number): PurchaseOrder {
  return {
    id: crypto.randomUUID(),
    profitCenterId: pc,
    poNumber: "PO-1",
    status,
    supplierId: "s",
    sourcePrId: null,
    currencyCode: currency,
    totalAmount: total,
    paymentTerms: null,
    expectedDeliveryDate: null,
    approvedBy: null,
    approvedAt: null,
    cancelledAt: null,
    cancelledReason: null,
    notes: null,
    createdBy: "u",
    createdAt: "",
    updatedAt: "",
  };
}

function shipment(status: ImportShipment["status"]): ImportShipment {
  return {
    id: crypto.randomUUID(),
    profitCenterId: pc,
    shipmentNo: "S-1",
    poId: null,
    originCountry: null,
    destinationPort: null,
    vessel: null,
    blNumber: null,
    etd: null,
    eta: null,
    status,
    freightCost: null,
    customsCost: null,
    currencyCode: "USD",
    notes: null,
    createdBy: "u",
    createdAt: "",
    updatedAt: "",
  };
}

function supplier(active: boolean): Supplier {
  return {
    id: crypto.randomUUID(),
    profitCenterId: pc,
    code: "X",
    name: "X",
    contactPerson: null,
    email: null,
    phone: null,
    address: null,
    country: null,
    defaultCurrency: "INR",
    paymentTerms: null,
    leadTimeDays: null,
    isPreferred: false,
    isActive: active,
    notes: null,
    createdAt: "",
    updatedAt: "",
  };
}

function shortage(status: ShortageRow["status"]): ShortageRow {
  return {
    materialId: crypto.randomUUID(),
    materialCode: "M",
    materialName: "Material",
    uom: "kg",
    onHand: 0,
    onOrder: 0,
    available: 0,
    minLevel: 100,
    reorderLevel: 150,
    shortage: 100,
    triggerLevel: 150,
    status,
  };
}

function risk(status: RiskEvent["status"], severity: RiskEvent["severity"]): RiskEvent {
  return {
    id: crypto.randomUUID(),
    profitCenterId: pc,
    supplierId: null,
    riskType: "Delay",
    severity,
    status,
    description: "test",
    mitigationPlan: null,
    occurredAt: "",
    resolvedAt: null,
    createdBy: "u",
    createdAt: "",
    updatedAt: "",
  };
}

function evaluation(supplierId: string, periodEnd: string, overall: number | null): SupplierEvaluation {
  return {
    id: crypto.randomUUID(),
    profitCenterId: pc,
    supplierId,
    periodStart: "2026-01-01",
    periodEnd,
    onTimePct: null,
    qualityPct: null,
    priceScore: null,
    overallScore: overall,
    notes: null,
    createdBy: "u",
    createdAt: "",
  };
}

describe("buildDashboardKpis", () => {
  it("returns zeroes when nothing is loaded", () => {
    const k = buildDashboardKpis({
      prs: [], pos: [], shipments: [], suppliers: [], shortages: [], risks: [], evaluations: [],
    });
    expect(k.prsOpen).toBe(0);
    expect(k.posOpen).toBe(0);
    expect(k.posValueOpen).toEqual({});
    expect(k.avgSupplierScore).toBeNull();
  });

  it("counts PRs in draft+submitted as open and submitted as awaiting approval", () => {
    const k = buildDashboardKpis({
      prs: [pr("draft"), pr("submitted"), pr("submitted"), pr("approved"), pr("rejected")],
      pos: [], shipments: [], suppliers: [], shortages: [], risks: [], evaluations: [],
    });
    expect(k.prsOpen).toBe(3);
    expect(k.prsAwaitingApproval).toBe(2);
  });

  it("groups open PO value by currency and excludes closed/cancelled/received", () => {
    const k = buildDashboardKpis({
      prs: [],
      pos: [
        po("draft", "USD", 100),
        po("sent", "USD", 250),
        po("acknowledged", "EUR", 500),
        po("partially_received", "INR", 1000),
        po("received", "INR", 9999),
        po("closed", "INR", 9999),
        po("cancelled", "INR", 9999),
      ],
      shipments: [], suppliers: [], shortages: [], risks: [], evaluations: [],
    });
    expect(k.posOpen).toBe(4);
    expect(k.posValueOpen).toEqual({ USD: 350, EUR: 500, INR: 1000 });
  });

  it("counts shipments by status and active suppliers", () => {
    const k = buildDashboardKpis({
      prs: [], pos: [],
      shipments: [shipment("in_transit"), shipment("in_transit"), shipment("customs"), shipment("delivered")],
      suppliers: [supplier(true), supplier(true), supplier(false)],
      shortages: [], risks: [], evaluations: [],
    });
    expect(k.shipmentsInTransit).toBe(2);
    expect(k.shipmentsCustoms).toBe(1);
    expect(k.suppliersActive).toBe(2);
  });

  it("counts shortages and risks correctly", () => {
    const k = buildDashboardKpis({
      prs: [], pos: [], shipments: [], suppliers: [],
      shortages: [shortage("below_min"), shortage("below_min"), shortage("reorder")],
      risks: [
        risk("open", "critical"),
        risk("open", "high"),
        risk("mitigated", "critical"),
        risk("closed", "critical"), // excluded
      ],
      evaluations: [],
    });
    expect(k.shortagesBelowMin).toBe(2);
    expect(k.shortagesReorder).toBe(1);
    expect(k.risksOpen).toBe(2); // status=open
    expect(k.risksCritical).toBe(2); // open+mitigated critical, not closed
  });

  it("averages only the latest evaluation per supplier", () => {
    const s1 = "supplier-1";
    const s2 = "supplier-2";
    const k = buildDashboardKpis({
      prs: [], pos: [], shipments: [], suppliers: [], shortages: [], risks: [],
      evaluations: [
        evaluation(s1, "2026-01-31", 60), // older — ignored
        evaluation(s1, "2026-02-28", 80), // latest for s1
        evaluation(s2, "2026-02-28", 90), // latest for s2
      ],
    });
    expect(k.avgSupplierScore).toBe(85);
  });

  it("returns null avg score when no evaluations have a numeric overall score", () => {
    const k = buildDashboardKpis({
      prs: [], pos: [], shipments: [], suppliers: [], shortages: [], risks: [],
      evaluations: [evaluation("s", "2026-01-01", null)],
    });
    expect(k.avgSupplierScore).toBeNull();
  });
});
