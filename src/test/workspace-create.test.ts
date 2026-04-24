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

function buildCreateFlow(result: { data: any; error: any }, reloadError: any = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: result.data, error: reloadError });
  const eqSlug = vi.fn(() => ({ maybeSingle }));
  const eqCode = vi.fn(() => ({ eq: eqSlug }));
  const select = vi.fn(() => ({ eq: eqCode }));
  const insert = vi.fn().mockResolvedValue({ error: result.error });
  return { insert, select, eqCode, eqSlug, maybeSingle };
}

describe("createProfitCenter", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("inserts then reloads the freshly created row", async () => {
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
    const { insert, select, eqCode, eqSlug } = buildCreateFlow({ data: row, error: null });
    fromMock
      .mockReturnValueOnce({ insert })
      .mockReturnValueOnce({ select });

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
    expect(eqCode).toHaveBeenCalledWith("code", "PC-001");
    expect(eqSlug).toHaveBeenCalledWith("slug", "ferro-alloys-division");
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
    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces insert errors immediately", async () => {
    const insertError = new Error("new row violates row-level security policy");
    const { insert } = buildCreateFlow({ data: null, error: insertError });
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
    const { insert, select } = buildCreateFlow({ data: null, error: null });
    fromMock
      .mockReturnValueOnce({ insert })
      .mockReturnValueOnce({ select });

    await expect(
      createProfitCenter({
        code: "PC-001",
        slug: "ferro-alloys-division",
        name: "Ferro Alloys Division",
      }),
    ).rejects.toThrow("Profit Center was created but could not be reloaded. Please refresh.");
  });
});
