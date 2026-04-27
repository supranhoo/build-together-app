import { describe, it, expect } from "vitest";
import { ADMIN_SETTINGS_TABS, resolveAdminSettingsTab } from "@/pages/AdminSettings";
import { INVENTORY_TABS } from "@/pages/PortalInventory";
import { MASTER_DATA_TABS } from "@/pages/AdminMasterData";

/**
 * Verifies the relocation of the Master Data orchestrator from
 * Admin → Settings into the Inventory module. Locks down:
 *  1. Master Data is no longer reachable via Admin Settings tabs.
 *  2. It IS reachable as a top-level Inventory tab.
 *  3. The inner sub-tabs (Item Master, Groups, Furnaces, Cost Rates,
 *     UOM, Locations, Master KPIs) are still the same SSOT screens.
 *  4. Legacy `?tab=master-data` no longer resolves to a real Admin tab
 *     (so the redirect in AdminSettings.tsx is required and active).
 */
describe("Master Data relocation to Inventory module", () => {
  it("removes 'master-data' from Admin Settings tabs", () => {
    const keys = ADMIN_SETTINGS_TABS.map((t) => t.key);
    expect(keys).not.toContain("master-data");
  });

  it("legacy ?tab=master-data no longer matches a valid Admin tab", () => {
    // Falls back to first tab — the page-level redirect catches this case.
    expect(resolveAdminSettingsTab("master-data")).toBe(ADMIN_SETTINGS_TABS[0].key);
  });

  it("adds 'master-data' as a top-level Inventory tab", () => {
    const tab = INVENTORY_TABS.find((t) => t.value === "master-data");
    expect(tab).toBeDefined();
    expect(tab?.path).toBe("/portal/inventory/master-data");
  });

  it("preserves all Master Data sub-tabs (SSOT screens)", () => {
    const expected = ["items", "catalogue", "groups", "specs", "furnaces", "cost-rates", "uom", "locations", "kpis"];
    expect(MASTER_DATA_TABS.map((t) => t.key)).toEqual(expected);
  });
});
