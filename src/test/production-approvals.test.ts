import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const state: { rows: any[]; lastFilters: Record<string, unknown> } = { rows: [], lastFilters: {} };
  function builder(table: string) {
    const filters: Record<string, unknown> = { __table: table };
    const b: any = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return b;
      },
      order: () => {
        state.lastFilters = filters;
        return Promise.resolve({ data: state.rows, error: null });
      },
    };
    return b;
  }
  return {
    supabase: { from: (t: string) => builder(t) },
    __state: state,
  };
});

import { fetchProductionApprovals, summariseApprovals } from "@/lib/production-approvals";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __state } = require("@/integrations/supabase/client");

beforeEach(() => {
  __state.rows = [];
  __state.lastFilters = {};
});

describe("fetchProductionApprovals", () => {
  it("queries the unified view filtered by profit center", async () => {
    __state.rows = [
      {
        id: "heat_log:a",
        source: "heat_log",
        source_row_id: "a",
        entity_id: "h-1",
        profit_center_id: "pc-1",
        status: "pending",
        heat_number: "H-100",
        event_time: "2026-05-01T00:00:00Z",
        submitted_by: "u",
        submitted_at: "2026-05-01T00:00:00Z",
        decided_by: null,
        decided_at: null,
        notes: null,
      },
    ];
    const out = await fetchProductionApprovals("pc-1");
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("heat_log");
    expect(out[0].entityId).toBe("h-1");
    expect(__state.lastFilters.__table).toBe("production_approvals_v");
    expect(__state.lastFilters.profit_center_id).toBe("pc-1");
  });

  it("applies optional source + status filters", async () => {
    await fetchProductionApprovals("pc-1", { source: "clu_heat", status: "approved" });
    expect(__state.lastFilters.source).toBe("clu_heat");
    expect(__state.lastFilters.status).toBe("approved");
  });

  it("returns [] when view is empty", async () => {
    const out = await fetchProductionApprovals("pc-1");
    expect(out).toEqual([]);
  });

  it("normalises null actor + decision fields", async () => {
    __state.rows = [
      {
        id: "clu_heat:x",
        source: "clu_heat",
        source_row_id: "x",
        entity_id: "x",
        profit_center_id: "pc-1",
        status: "pending",
        heat_number: "CLU-1",
        event_time: "2026-05-01",
        // submitted_by, submitted_at, decided_by, decided_at, notes all missing
      },
    ];
    const [row] = await fetchProductionApprovals("pc-1");
    expect(row.submittedBy).toBeNull();
    expect(row.decidedBy).toBeNull();
    expect(row.notes).toBeNull();
  });
});

describe("summariseApprovals", () => {
  const make = (status: "pending" | "approved" | "rejected") => ({
    id: status,
    source: "heat_log" as const,
    sourceRowId: status,
    entityId: status,
    profitCenterId: "pc",
    status,
    heatNumber: "H",
    eventTime: "2026-05-01",
    submittedBy: null,
    submittedAt: null,
    decidedBy: null,
    decidedAt: null,
    notes: null,
  });

  it("counts by status", () => {
    const counts = summariseApprovals([make("pending"), make("pending"), make("approved")]);
    expect(counts.pending).toBe(2);
    expect(counts.approved).toBe(1);
    expect(counts.rejected).toBe(0);
  });

  it("returns zeroed buckets for empty input", () => {
    expect(summariseApprovals([])).toEqual({ pending: 0, approved: 0, rejected: 0 });
  });
});
