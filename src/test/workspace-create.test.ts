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

describe("createProfitCenter", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("inserts first and then reloads the workspace in a separate query", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
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

    const limit = vi.fn().mockResolvedValue({ data: [row], error: null });
    const order = vi.fn(() => ({ limit }));
    const eqSlug = vi.fn(() => ({ order }));
    const eqCode = vi.fn(() => ({ eq: eqSlug }));
    const select = vi.fn(() => ({ eq: eqCode }));

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
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(1);
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
  });

  it("surfaces insert errors immediately", async () => {
    const insertError = new Error("new row violates row-level security policy");
    const insert = vi.fn().mockResolvedValue({ error: insertError });
    fromMock.mockReturnValueOnce({ insert });

    await expect(
      createProfitCenter({
        code: "PC-001",
        slug: "ferro-alloys-division",
        name: "Ferro Alloys Division",
      }),
    ).rejects.toThrow("new row violates row-level security policy");
  });

  it("fails clearly when the workspace cannot be reloaded after insert", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn(() => ({ limit }));
    const eqSlug = vi.fn(() => ({ order }));
    const eqCode = vi.fn(() => ({ eq: eqSlug }));
    const select = vi.fn(() => ({ eq: eqCode }));

    fromMock
      .mockReturnValueOnce({ insert })
      .mockReturnValueOnce({ select });

    await expect(
      createProfitCenter({
        code: "PC-001",
        slug: "ferro-alloys-division",
        name: "Ferro Alloys Division",
      }),
    ).rejects.toThrow("Workspace was created but could not be reloaded. Please refresh.");
  });
});