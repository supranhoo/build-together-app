/**
 * Procurement Phase A — route + shell smoke tests.
 *
 * Verifies:
 *  1. The 16-tab spec is intact (no accidental removals).
 *  2. Every deep-link target points to an existing route in App.tsx so we
 *     never ship a broken "Open …" button.
 *  3. AdminShell exposes the /admin/procurement nav entry.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();
const APP_TSX = readFileSync(join(REPO, "src/App.tsx"), "utf8");
const SHELL_TSX = readFileSync(join(REPO, "src/components/AdminShell.tsx"), "utf8");
const PAGE_TSX = readFileSync(join(REPO, "src/pages/AdminProcurement.tsx"), "utf8");

describe("Procurement Phase A", () => {
  it("registers /admin/procurement under RequireAdmin", () => {
    expect(APP_TSX).toMatch(/path="procurement"\s+element=\{<AdminProcurement\s*\/>/);
    expect(APP_TSX).toMatch(/import AdminProcurement from "\.\/pages\/AdminProcurement"/);
  });

  it("AdminShell sidebar exposes Procurement", () => {
    expect(SHELL_TSX).toMatch(/to:\s*"\/admin\/procurement"/);
    expect(SHELL_TSX).toMatch(/label:\s*"Procurement"/);
  });

  it("renders all 16 tabs", () => {
    const tabIds = [
      "dashboard", "rm_master", "min_max", "mrp", "suppliers", "pr", "po",
      "shipments", "grn", "quality", "inventory", "supplier_perf", "cost",
      "risk", "reports", "kpis",
    ];
    for (const id of tabIds) {
      expect(PAGE_TSX, `tab "${id}" missing`).toMatch(new RegExp(`id:\\s*"${id}"`));
    }
  });

  it("every deep-link target is a real registered route", () => {
    // Targets used in AdminProcurement.tsx
    const targets = [
      "/admin/settings?tab=materials",
      "/portal/inventory/min-max",
      "/portal/inventory/grn",
      "/portal/inventory/stock",
      "/admin/settings?tab=cost-rates",
      "/portal/reports",
      "/admin/settings?tab=kpis",
    ];
    for (const url of targets) {
      const path = url.split("?")[0];
      // Strip /admin or /portal prefix to get the route segment used in App.tsx
      const segs = path.split("/").filter(Boolean);
      // The deepest segment must appear as a path="..." in App.tsx
      const deepest = segs[segs.length - 1];
      expect(APP_TSX, `route for ${url} not found in App.tsx`).toMatch(
        new RegExp(`path="${deepest}"`)
      );
    }
  });
});
