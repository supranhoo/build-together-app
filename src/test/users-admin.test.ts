import { describe, it, expect, vi, beforeEach } from "vitest";
import { validatePasswordStrength } from "@/lib/auth";

// Mock the Supabase client BEFORE importing the helpers (they capture the reference).
const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

import { changeUserEmail, createUserDirect, resetUserPassword, setUserActive } from "@/lib/users-admin";

describe("validatePasswordStrength", () => {
  it("rejects empty", () => {
    expect(validatePasswordStrength("")).toEqual({ ok: false, reason: "Password is required." });
  });
  it("rejects too short", () => {
    expect(validatePasswordStrength("Abc12")).toMatchObject({ ok: false });
  });
  it("rejects no digit", () => {
    expect(validatePasswordStrength("abcdefgh")).toMatchObject({ ok: false });
  });
  it("rejects no letter", () => {
    expect(validatePasswordStrength("12345678")).toMatchObject({ ok: false });
  });
  it("rejects > 72 chars", () => {
    expect(validatePasswordStrength("a1" + "x".repeat(72))).toMatchObject({ ok: false });
  });
  it("accepts a valid password", () => {
    expect(validatePasswordStrength("Hunter21")).toEqual({ ok: true });
  });
});

describe("users-admin wrappers", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
  });

  it("createUserDirect calls admin-create-user with the payload", async () => {
    await createUserDirect({ email: "x@y.com", password: "Hunter21", displayName: "X" });
    expect(invokeMock).toHaveBeenCalledWith("admin-create-user", {
      body: { email: "x@y.com", password: "Hunter21", displayName: "X" },
    });
  });

  it("resetUserPassword calls admin-reset-password", async () => {
    await resetUserPassword({ userId: "u1", password: "Hunter21" });
    expect(invokeMock).toHaveBeenCalledWith("admin-reset-password", {
      body: { userId: "u1", password: "Hunter21" },
    });
  });

  it("setUserActive calls admin-set-user-active", async () => {
    await setUserActive({ userId: "u1", isActive: false });
    expect(invokeMock).toHaveBeenCalledWith("admin-set-user-active", {
      body: { userId: "u1", isActive: false },
    });
  });

  it("throws when the edge function returns an error payload", async () => {
    invokeMock.mockResolvedValueOnce({ data: { error: "forbidden" }, error: null });
    await expect(setUserActive({ userId: "u1", isActive: true })).rejects.toThrow("forbidden");
  });

  it("throws when invoke itself errors", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: new Error("network") });
    await expect(setUserActive({ userId: "u1", isActive: true })).rejects.toThrow("network");
  });

  it("throws the edge function response error when invoke returns a non-2xx error", async () => {
    const error = new Error("Edge Function returned a non-2xx status code") as Error & { context: Response };
    error.context = new Response(JSON.stringify({ error: "User not allowed" }), { status: 400 });
    invokeMock.mockResolvedValueOnce({ data: null, error });
    await expect(resetUserPassword({ userId: "u1", password: "Hunter21" })).rejects.toThrow("User not allowed");
  });

  it("changeUserEmail calls admin-change-user-email with the payload", async () => {
    await changeUserEmail({ userId: "u1", email: "new@example.com" });
    expect(invokeMock).toHaveBeenCalledWith("admin-change-user-email", {
      body: { userId: "u1", email: "new@example.com" },
    });
  });

  it("changeUserEmail surfaces the backend message on non-2xx", async () => {
    const error = new Error("Edge Function returned a non-2xx status code") as Error & { context: Response };
    error.context = new Response(JSON.stringify({ error: "Email address is already registered" }), { status: 400 });
    invokeMock.mockResolvedValueOnce({ data: null, error });
    await expect(changeUserEmail({ userId: "u1", email: "dup@x.com" })).rejects.toThrow(
      "Email address is already registered",
    );
  });
});
