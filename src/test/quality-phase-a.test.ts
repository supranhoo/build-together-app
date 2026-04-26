/**
 * Quality Control Phase A — route + shell smoke tests.
 *
 * Verifies:
 *  1. The 9-tab spec is intact (CLU removed, Bunker Feed QC present).
 *  2. /admin/quality and /portal/quality both mount AdminQuality (SSOT).
 *  3. AdminShell exposes the /admin/quality nav entry.
 *  4. Every deep-link target points to a registered route in App.tsx.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();
const APP_TSX = readFileSync(join(REPO, "src/App.tsx"), "utf8");
const SHELL_TSX = readFileSync(join(REPO, "src/components/AdminShell.tsx"), "utf8");
const PAGE_TSX = readFileSync(join(REPO, "src/pages/AdminQuality.tsx"), "utf8");

describe("Quality Control Phase A", () => {
  it("registers /admin/quality and /portal/quality on AdminQuality", () => {
    expect(APP_TSX).toMatch(/import AdminQuality from "\.\/pages\/AdminQuality"/);
    // Two mounts (admin + portal) of the same component
    const matches = APP_TSX.match(/path="quality"\s+element=\{<AdminQuality\s*\/>/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("AdminShell sidebar exposes Quality Control", () => {
    expect(SHELL_TSX).toMatch(/to:\s*"\/admin\/quality"/);
    expect(SHELL_TSX).toMatch(/label:\s*"Quality Control"/);
  });

  it("renders all 9 tabs (CLU removed, Bunker Feed QC present)", () => {
    const tabIds = [
      "dashboard", "raw_material", "sampling", "bunker_feed",
      "furnace", "finished_goods", "dispatch", "complaints", "compliance",
    ];
    for (const id of tabIds) {
      expect(PAGE_TSX, `tab "${id}" missing`).toMatch(new RegExp(`id:\\s*"${id}"`));
    }
    // Ensure CLU was not re-introduced.
    expect(PAGE_TSX).not.toMatch(/id:\s*"clu"/);
  });

  it("every deep-link target is a real registered route", () => {
    const targets = [
      "/portal/inventory/grn",
      "/portal/production",
    ];
    for (const url of targets) {
      const segs = url.split("/").filter(Boolean);
      const deepest = segs[segs.length - 1];
      expect(APP_TSX, `route for ${url} not found in App.tsx`).toMatch(
        new RegExp(`path="${deepest}"`)
      );
    }
  });
});
