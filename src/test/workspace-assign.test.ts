import { describe, expect, it, vi, beforeEach } from "vitest";
import { assignUserToProfitCenter } from "@/lib/workspace";

/**
 * Regression coverage for:
 *   500: ON CONFLICT DO UPDATE command cannot affect row a second time
 *
 * The `user_profit_centers` table has a BEFORE INSERT/UPDATE trigger that
 * clears `is_default` on the user's other rows when the saved row is marked
 * default. That trigger is incompatible with PostgREST's `.upsert` (which
 * issues `INSERT ... ON CONFLICT DO UPDATE`). `assignUserToProfitCenter`
 * MUST therefore route through a plain INSERT (new row) or a plain UPDATE
 * (existing row), not `.upsert`.
 */
const calls: Array<{ table: string; op: string; payload?: unknown }> = [];

vi.mock("@/integrations/supabase/client", () => {
  const make = (table: string) => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => {
            calls.push({ table, op: "select" });
            return existing
              ? { data: { id: "assignment-existing" }, error: null }
              : { data: null, error: null };
          },
        }),
      }),
    }),
    insert: (payload: unknown) => {
      calls.push({ table, op: "insert", payload });
      return Promise.resolve({ error: null });
    },
    update: (payload: unknown) => {
      calls.push({ table, op: "update", payload });
      return { eq: () => Promise.resolve({ error: null }) };
    },
    upsert: () => {
      // If anyone re-introduces upsert, fail loudly.
      throw new Error("upsert must not be used on user_profit_centers");
    },
  });
  return {
    supabase: {
      from: (table: string) => make(table),
    },
  };
});

let existing = false;
beforeEach(() => {
  calls.length = 0;
  existing = false;
});

describe("assignUserToProfitCenter", () => {
  it("inserts a new row when no assignment exists yet", async () => {
    existing = false;
    await assignUserToProfitCenter({ userId: "u1", profitCenterId: "pc1", isDefault: true });
    const ops = calls.map((c) => c.op);
    expect(ops).toEqual(["select", "insert"]);
    expect(calls[1].payload).toMatchObject({
      user_id: "u1",
      profit_center_id: "pc1",
      is_default: true,
      is_active: true,
    });
  });

  it("updates the existing row instead of upserting", async () => {
    existing = true;
    await assignUserToProfitCenter({ userId: "u1", profitCenterId: "pc1", isDefault: false });
    const ops = calls.map((c) => c.op);
    expect(ops).toEqual(["select", "update"]);
    expect(calls[1].payload).toMatchObject({ is_default: false, is_active: true });
  });
});
