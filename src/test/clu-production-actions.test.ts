/**
 * Tests for the CLU heat status transition helper. Pure logic — uses
 * `nextStatusFor` so we don't need a database.
 */
import { describe, it, expect } from "vitest";
import { nextStatusFor } from "@/lib/clu-production";

describe("nextStatusFor", () => {
  it("draft → pending_approval on submit", () => {
    expect(nextStatusFor("draft", "submit")).toBe("pending_approval");
  });
  it("pending_approval → approved on approve", () => {
    expect(nextStatusFor("pending_approval", "approve")).toBe("approved");
  });
  it("pending_approval → rejected on reject", () => {
    expect(nextStatusFor("pending_approval", "reject")).toBe("rejected");
  });
  it("approved → voided on void", () => {
    expect(nextStatusFor("approved", "void")).toBe("voided");
  });
  it("blocks submit from approved", () => {
    expect(nextStatusFor("approved", "submit")).toBeNull();
  });
  it("blocks approve from draft", () => {
    expect(nextStatusFor("draft", "approve")).toBeNull();
  });
  it("blocks void from rejected", () => {
    expect(nextStatusFor("rejected", "void")).toBeNull();
  });
});
