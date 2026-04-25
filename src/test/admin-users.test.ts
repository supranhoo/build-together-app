import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: fromMock,
  },
}));

import { updateUserProfile } from "@/lib/workspace";

function buildUpdateFlow(error: unknown = null) {
  const eq = vi.fn().mockResolvedValue({ error });
  const update = vi.fn(() => ({ eq }));
  return { update, eq };
}

describe("updateUserProfile", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("sends mapped column names and targets the correct user", async () => {
    const { update, eq } = buildUpdateFlow();
    fromMock.mockReturnValueOnce({ update });

    await updateUserProfile({
      userId: "user-123",
      displayName: "Alice",
      department: "Ops",
      jobTitle: "Lead",
    });

    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(update).toHaveBeenCalledWith({
      display_name: "Alice",
      department: "Ops",
      job_title: "Lead",
    });
    expect(eq).toHaveBeenCalledWith("user_id", "user-123");
  });

  it("propagates RLS / network errors so the UI can surface them", async () => {
    const { update } = buildUpdateFlow({ message: "permission denied for table profiles" });
    fromMock.mockReturnValueOnce({ update });

    await expect(
      updateUserProfile({ userId: "user-x", displayName: "Bob", department: null, jobTitle: null }),
    ).rejects.toMatchObject({ message: expect.stringContaining("permission denied") });
  });

  it("allows clearing department and job title via null", async () => {
    const { update } = buildUpdateFlow();
    fromMock.mockReturnValueOnce({ update });

    await updateUserProfile({
      userId: "user-9",
      displayName: "Carol",
      department: null,
      jobTitle: null,
    });

    expect(update).toHaveBeenCalledWith({
      display_name: "Carol",
      department: null,
      job_title: null,
    });
  });
});
