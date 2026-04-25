/**
 * Min/Max stock classification — pure logic, used by Inventory Dashboard,
 * Min-Max tab, and Portal Overview alerts.
 */

export type StockStatus = "below_min" | "reorder" | "ok" | "over_max" | "unconfigured";

export interface StockThreshold {
  minLevel: number | null;
  reorderLevel: number | null;
  maxLevel: number | null;
}

export function classifyStockStatus(quantity: number, t: StockThreshold): StockStatus {
  const noThresholds = t.minLevel === null && t.reorderLevel === null && t.maxLevel === null;
  if (noThresholds) return "unconfigured";
  if (t.minLevel !== null && quantity < t.minLevel) return "below_min";
  if (t.maxLevel !== null && quantity > t.maxLevel) return "over_max";
  if (t.reorderLevel !== null && quantity <= t.reorderLevel) return "reorder";
  return "ok";
}
