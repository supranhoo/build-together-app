import { describe, it, expect, vi } from "vitest";

// Mock supabase client so we can drive the row count returned by the underlying
// query and assert that fetchHeatLogsWithMeta computes `truncated` correctly.
const mockData = { rows: [] as any[] };
vi.mock("@/integrations/supabase/client", () => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    gte: () => builder,
    lte: () => builder,
    then: (fn: any) => fn({ data: mockData.rows, error: null }),
  };
  return {
    supabase: { from: () => builder },
  };
});

import { fetchHeatLogsWithMeta } from "@/lib/production";

const heat = (id: string) => ({
  id,
  profit_center_id: "pc",
  furnace_id: "f",
  shift_id: "s",
  heat_number: id,
  tap_time: "2026-01-01T00:00:00Z",
  weight_mt: 1,
  power_mwh: 1,
  notes: null,
  created_by: "u",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  is_voided: false,
  void_reason: null,
});

describe("fetchHeatLogsWithMeta — Phase 1.5 truncation flag", () => {
  it("sets truncated=false when rows < limit", async () => {
    mockData.rows = [heat("a"), heat("b")];
    const page = await fetchHeatLogsWithMeta("pc", { limit: 10 });
    expect(page.truncated).toBe(false);
    expect(page.limit).toBe(10);
    expect(page.rows.length).toBe(2);
  });

  it("sets truncated=true when rows === limit (cap likely hit)", async () => {
    mockData.rows = [heat("a"), heat("b"), heat("c")];
    const page = await fetchHeatLogsWithMeta("pc", { limit: 3 });
    expect(page.truncated).toBe(true);
  });

  it("defaults limit to 200 when omitted", async () => {
    mockData.rows = [heat("a")];
    const page = await fetchHeatLogsWithMeta("pc");
    expect(page.limit).toBe(200);
    expect(page.truncated).toBe(false);
  });
});
