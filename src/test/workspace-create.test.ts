import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: fromMock,
  },
}));

import { createProfitCenter } from "@/lib/workspace";

function buildInsertChain(result: { data: any; error: any }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  return { insert, select, single };
}

describe("createProfitCenter", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("returns the freshly inserted row from a single round-trip", async () => {
    const row = {
      id: "pc-3",
      code: "PC-001",
      slug: "ferro-alloys-division",
      name: "Ferro Alloys Division",
      description: "PRODUCTION OF FERRO MANGANESE",
      location_name: "RAMGARH",
      process_profile: "PRODUCTION OF FERRO MANGANESE",
      is_active: true,
    };
    const { insert, select } = buildInsertChain({ data: row, error: null });
    fromMock.mockReturnValueOnce({ insert });

    const created = await createProfitCenter({
      code: "PC-001",
      slug: "ferro-alloys-division",
      name: "Ferro Alloys Division",
      description: "PRODUCTION OF FERRO MANGANESE",
      locationName: "RAMGARH",
      processProfile: "PRODUCTION OF FERRO MANGANESE",
    });

    expect(insert).toHaveBeenCalledWith({
      code: "PC-001",
      slug: "ferro-alloys-division",
      name: "Ferro Alloys Division",
      description: "PRODUCTION OF FERRO MANGANESE",
      location_name: "RAMGARH",
      process_profile: "PRODUCTION OF FERRO MANGANESE",
    });
    expect(select).toHaveBeenCalledWith("id, code, slug, name, description, location_name, process_profile, is_active");
    expect(created).toEqual({
      id: "pc-3",
      code: "PC-001",
      slug: "ferro-alloys-division",
      name: "Ferro Alloys Division",
      description: "PRODUCTION OF FERRO MANGANESE",
      locationName: "RAMGARH",
      processProfile: "PRODUCTION OF FERRO MANGANESE",
      isActive: true,
    });
    // Only one call to from() — no separate reload that could match the wrong row.
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces insert errors immediately", async () => {
    const insertError = new Error("new row violates row-level security policy");
    const { insert } = buildInsertChain({ data: null, error: insertError });
    fromMock.mockReturnValueOnce({ insert });

    await expect(
      createProfitCenter({
        code: "PC-001",
        slug: "ferro-alloys-division",
        name: "Ferro Alloys Division",
      }),
    ).rejects.toThrow("new row violates row-level security policy");
  });

  it("fails clearly when no row is returned after insert", async () => {
    const { insert } = buildInsertChain({ data: null, error: null });
    fromMock.mockReturnValueOnce({ insert });

    await expect(
      createProfitCenter({
        code: "PC-001",
        slug: "ferro-alloys-division",
        name: "Ferro Alloys Division",
      }),
    ).rejects.toThrow("Profit Center was created but could not be reloaded. Please refresh.");
  });
});
