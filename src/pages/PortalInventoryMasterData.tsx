import AdminMasterData from "./AdminMasterData";

/**
 * Master Data inside the Inventory module.
 *
 * SSOT: this page mounts the SAME `<AdminMasterData />` orchestrator that
 * previously lived under Admin → Settings → Master Data. The underlying
 * tables (`materials`, `material_groups`, `uom_conversions`, `cost_rates`,
 * `stock_locations`, `furnaces`, `kpi_definitions`) are unchanged, so every
 * downstream consumer (Production, Procurement, Quality, Maintenance,
 * Finance, Sales, Inventory itself) keeps reading from one place.
 *
 * Per project policy (Rule #5 SSOT, Rule #3 Surgical Changes), no logic is
 * duplicated. This file is a thin host so the route lives under
 * `/portal/inventory/master-data`.
 */
export default function PortalInventoryMasterData() {
  return <AdminMasterData />;
}
