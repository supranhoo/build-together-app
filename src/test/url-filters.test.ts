import { describe, it, expect } from "vitest";
import {
  encodeFilters, buildDrilldownPath, readFilter, applyFilters,
} from "@/lib/url-filters";

describe("encodeFilters", () => {
  it("returns empty string when no filters", () => {
    expect(encodeFilters(undefined)).toBe("");
    expect(encodeFilters({})).toBe("");
  });
  it("skips null, undefined, and empty strings", () => {
    expect(encodeFilters({ a: null, b: undefined, c: "", d: "x" })).toBe("?d=x");
  });
  it("encodes booleans and numbers as strings", () => {
    expect(encodeFilters({ flag: true, count: 5 })).toBe("?flag=true&count=5");
  });
  it("preserves multi-value comma syntax (we treat values opaquely)", () => {
    expect(encodeFilters({ status: "dispatched,sailed,delivered" }))
      .toBe("?status=dispatched%2Csailed%2Cdelivered");
  });
});

describe("buildDrilldownPath", () => {
  it("returns path alone when no filters", () => {
    expect(buildDrilldownPath("/portal/sales")).toBe("/portal/sales");
  });
  it("appends encoded query string", () => {
    expect(buildDrilldownPath("/portal/sales", { tab: "orders", status: "confirmed" }))
      .toBe("/portal/sales?tab=orders&status=confirmed");
  });
});

describe("readFilter", () => {
  it("returns the value when present", () => {
    expect(readFilter(new URLSearchParams("?status=open"), "status")).toBe("open");
  });
  it("returns the fallback when missing", () => {
    expect(readFilter(new URLSearchParams("?other=x"), "status", "all")).toBe("all");
  });
});

describe("applyFilters", () => {
  it("adds new keys without losing existing ones", () => {
    const next = applyFilters(new URLSearchParams("?tab=orders"), { status: "confirmed" });
    expect(next.get("tab")).toBe("orders");
    expect(next.get("status")).toBe("confirmed");
  });
  it("removes keys when value is null/empty", () => {
    const next = applyFilters(new URLSearchParams("?tab=orders&status=confirmed"), { status: null });
    expect(next.has("status")).toBe(false);
  });
  it("does not mutate the input", () => {
    const input = new URLSearchParams("?a=1");
    applyFilters(input, { b: "2" });
    expect(input.has("b")).toBe(false);
  });
});
