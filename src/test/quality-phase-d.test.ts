/**
 * Quality — Phase D unit tests.
 *
 * Pure-function coverage for:
 *   • Complaint lifecycle gate (`canTransitionComplaint`, `checkComplaintGate`)
 *   • Compliance expiry bucketing (`bucketComplianceExpiry`)
 *   • KPI aggregator (`buildQualityKpis`) — single source of truth for
 *     the QC dashboard.
 *
 * No DB calls — all inputs are constructed inline so failures point at
 * the rule, not the network.
 */
import { describe, it, expect } from "vitest";
import {
  bucketComplianceExpiry,
  buildQualityKpis,
  canTransitionComplaint,
  checkComplaintGate,
  COMPLIANCE_DUE_SOON_DAYS,
  nextComplaintStatuses,
  type BunkerFeedTest,
  type ComplianceRecord,
  type DispatchClearance,
  type FgInspection,
  type QualityComplaint,
  type QualitySample,
} from "@/lib/quality";

// ---------- Complaint transitions ----------

describe("complaint lifecycle", () => {
  it("only allows the documented forward transitions", () => {
    expect(canTransitionComplaint("open", "investigating")).toBe(true);
    expect(canTransitionComplaint("investigating", "corrective_action")).toBe(true);
    expect(canTransitionComplaint("corrective_action", "closed")).toBe(true);
  });

  it("forbids skipping or going backward", () => {
    expect(canTransitionComplaint("open", "closed")).toBe(false);
    expect(canTransitionComplaint("open", "corrective_action")).toBe(false);
    expect(canTransitionComplaint("investigating", "open")).toBe(false);
    expect(canTransitionComplaint("closed", "open")).toBe(false);
  });

  it("treats `closed` as terminal", () => {
    expect(nextComplaintStatuses("closed")).toEqual([]);
  });

  it("blocks closing without root cause and corrective action", () => {
    const r1 = checkComplaintGate({ current: "corrective_action", next: "closed" });
    expect(r1.ok).toBe(false);
    const r2 = checkComplaintGate({
      current: "corrective_action", next: "closed",
      rootCause: "ok", correctiveAction: "ok",
    });
    expect(r2.ok).toBe(false); // <3 chars
    const r3 = checkComplaintGate({
      current: "corrective_action", next: "closed",
      rootCause: "Wet ore feed", correctiveAction: "Add cover, retest",
    });
    expect(r3.ok).toBe(true);
  });

  it("does not require root cause for non-close transitions", () => {
    expect(checkComplaintGate({ current: "open", next: "investigating" }).ok).toBe(true);
  });
});

// ---------- Compliance expiry bucket ----------

describe("compliance expiry bucket", () => {
  const NOW = new Date("2026-04-26T00:00:00Z");

  it("marks no-expiry rows as `no_expiry`", () => {
    expect(bucketComplianceExpiry(null, NOW)).toBe("no_expiry");
    expect(bucketComplianceExpiry("not-a-date", NOW)).toBe("no_expiry");
  });

  it("marks past dates as `expired`", () => {
    expect(bucketComplianceExpiry("2026-04-25T00:00:00Z", NOW)).toBe("expired");
  });

  it("marks dates within DUE_SOON window as `due_soon`", () => {
    const inside = new Date(NOW.getTime() + (COMPLIANCE_DUE_SOON_DAYS - 1) * 86400000).toISOString();
    expect(bucketComplianceExpiry(inside, NOW)).toBe("due_soon");
  });

  it("marks dates outside the window as `ok`", () => {
    const outside = new Date(NOW.getTime() + (COMPLIANCE_DUE_SOON_DAYS + 5) * 86400000).toISOString();
    expect(bucketComplianceExpiry(outside, NOW)).toBe("ok");
  });
});

// ---------- KPI aggregator ----------

function sample(status: QualitySample["status"]): QualitySample {
  return {
    id: status, profitCenterId: "pc", sampleNo: status,
    materialId: null, stockLocationId: null, lotReference: null,
    status, plannedAt: "", collectedAt: null, testedAt: null,
    testResults: {}, notes: null, createdBy: "", createdAt: "", updatedAt: "",
  };
}
function bunker(result: BunkerFeedTest["result"]): BunkerFeedTest {
  return {
    id: result, profitCenterId: "pc", materialId: "m", stockLocationId: "s",
    testedAt: "", mnPct: null, fcPct: null, moisturePct: null,
    sizeRange: null, extraSpecs: {}, result, deviations: [],
    validUntil: null, notes: null, createdBy: "", createdAt: "",
  };
}
function fg(result: FgInspection["result"]): FgInspection {
  return {
    id: result, profitCenterId: "pc", inspectionNo: result,
    batchNo: null, product: null, grade: null, heatLogId: null,
    inspectedAt: "", fgMnPct: null, fgSiPct: null, fgCPct: null,
    fgPPct: null, fgSPct: null, sizeRange: null, extraSpecs: {},
    result, notes: null, createdBy: "", createdAt: "", updatedAt: "",
  };
}
function dispatch(status: DispatchClearance["status"]): DispatchClearance {
  return {
    id: status, profitCenterId: "pc", clearanceNo: status,
    fgInspectionId: null, customer: null, vehicleNo: null,
    status, clearedAt: null, clearedBy: null, holdReason: null,
    notes: null, createdBy: "", createdAt: "", updatedAt: "",
  };
}
function complaint(status: QualityComplaint["status"]): QualityComplaint {
  return {
    id: status, profitCenterId: "pc", complaintNo: status,
    customer: null, product: null, batchNo: null, reportedAt: "",
    description: "x", status, rootCause: null, correctiveAction: null,
    closedAt: null, closedBy: null, createdBy: "", createdAt: "", updatedAt: "",
  };
}
function compliance(expiresAt: string | null): ComplianceRecord {
  return {
    id: expiresAt ?? "none", profitCenterId: "pc", recordType: "Cert",
    referenceNo: "ref", description: null, responsibleUserId: null,
    issuedAt: null, expiresAt, isActive: true, attachments: [],
    notes: null, createdBy: "", createdAt: "", updatedAt: "",
  };
}

describe("buildQualityKpis", () => {
  const NOW = new Date("2026-04-26T00:00:00Z");

  it("returns zeros for empty inputs", () => {
    const k = buildQualityKpis({
      samples: [], bunkerTests: [], fgInspections: [],
      dispatch: [], complaints: [], compliance: [], now: NOW,
    });
    expect(k.samples.total).toBe(0);
    expect(k.bunkerTests.failRatePct).toBe(0);
    expect(k.complaints.activeCount).toBe(0);
    expect(k.compliance.expired).toBe(0);
  });

  it("counts samples and computes openCount = planned + collected + tested", () => {
    const k = buildQualityKpis({
      samples: [sample("planned"), sample("collected"), sample("tested"), sample("released"), sample("rejected")],
      bunkerTests: [], fgInspections: [], dispatch: [], complaints: [], compliance: [], now: NOW,
    });
    expect(k.samples.total).toBe(5);
    expect(k.samples.openCount).toBe(3);
    expect(k.samples.byStatus.released).toBe(1);
  });

  it("computes bunker fail-rate as (fail + conditional) / total * 100", () => {
    const k = buildQualityKpis({
      samples: [], fgInspections: [], dispatch: [], complaints: [], compliance: [],
      bunkerTests: [bunker("pass"), bunker("pass"), bunker("conditional"), bunker("fail")],
      now: NOW,
    });
    expect(k.bunkerTests.total).toBe(4);
    expect(k.bunkerTests.pass).toBe(2);
    expect(k.bunkerTests.failRatePct).toBe(50);
  });

  it("counts FG, dispatch, complaints by status", () => {
    const k = buildQualityKpis({
      samples: [], bunkerTests: [], compliance: [],
      fgInspections: [fg("pending"), fg("pass"), fg("conditional"), fg("fail")],
      dispatch:  [dispatch("pending"), dispatch("cleared"), dispatch("held"), dispatch("rejected")],
      complaints: [complaint("open"), complaint("investigating"), complaint("corrective_action"), complaint("closed")],
      now: NOW,
    });
    expect(k.fgInspections.pending).toBe(1);
    expect(k.dispatch.held).toBe(1);
    expect(k.complaints.activeCount).toBe(3); // open + investigating + corrective_action
    expect(k.complaints.closed).toBe(1);
  });

  it("buckets compliance using the SSOT date math", () => {
    const past   = "2026-04-25T00:00:00Z";
    const due    = new Date(NOW.getTime() + 5 * 86400000).toISOString();
    const future = new Date(NOW.getTime() + 365 * 86400000).toISOString();
    const k = buildQualityKpis({
      samples: [], bunkerTests: [], fgInspections: [], dispatch: [], complaints: [],
      compliance: [compliance(past), compliance(due), compliance(future), compliance(null)],
      now: NOW,
    });
    expect(k.compliance.expired).toBe(1);
    expect(k.compliance.dueSoon).toBe(1);
    expect(k.compliance.ok).toBe(1);
    expect(k.compliance.noExpiry).toBe(1);
  });
});
