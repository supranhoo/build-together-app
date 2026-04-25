/**
 * Ferro-alloys metallurgy formulas.
 *
 * Pure functions — no I/O, no React. All inputs are explicit so they can be
 * unit-tested deterministically and reused by Production summaries and the
 * Costing engine.
 *
 * All percentage inputs are expressed as 0–100 (e.g. Mn% = 35 means 35%).
 */

export interface MaterialSpecLookup {
  /** Mn% on the as-received basis, 0–100. */
  mnPct?: number;
  /** Moisture% on the as-received basis, 0–100. */
  moisturePct?: number;
  /** Fe% on the as-received basis, 0–100. */
  fePct?: number;
}

export interface ConsumptionRow {
  materialId: string;
  /** Quantity in MT (or any consistent mass unit). */
  quantity: number;
}

/**
 * Total Mn input across all consumed raw materials, in the same mass unit as
 * `quantity`. Each row contributes:
 *
 *     qty * (mnPct / 100) * (1 - moisturePct / 100)
 *
 * Materials with no `mnPct` in `specs` contribute 0 (they are not Mn-bearing).
 */
export function mnInput(
  rows: ConsumptionRow[],
  specsByMaterialId: Record<string, MaterialSpecLookup | undefined>,
): number {
  let total = 0;
  for (const row of rows) {
    const specs = specsByMaterialId[row.materialId];
    const mn = Number(specs?.mnPct ?? 0);
    if (!Number.isFinite(mn) || mn <= 0) continue;
    const moisture = Number(specs?.moisturePct ?? 0);
    const dryFactor = Math.max(0, 1 - moisture / 100);
    total += row.quantity * (mn / 100) * dryFactor;
  }
  return total;
}

/**
 * Mn output contained in the produced metal.
 *   productionMt × (gradeMnPct / 100)
 */
export function mnOutput(productionMt: number, gradeMnPct: number): number {
  if (!Number.isFinite(productionMt) || !Number.isFinite(gradeMnPct)) return 0;
  return productionMt * (gradeMnPct / 100);
}

/**
 * Recovery percentage = output / input × 100.
 * Returns null when input is 0 or non-finite to avoid divide-by-zero noise.
 */
export function recoveryPct(input: number, output: number): number | null {
  if (!Number.isFinite(input) || input <= 0) return null;
  if (!Number.isFinite(output)) return null;
  return (output / input) * 100;
}

/**
 * Mn locked in slag.
 *   (slagQty × MnO%) / 1.29
 *
 * 1.29 is the stoichiometric MnO → Mn factor used in ferro-alloy
 * accounting (M(MnO) / M(Mn) = 70.94 / 54.94 ≈ 1.29).
 */
export function slagMn(slagQty: number, mnoPct: number): number {
  if (!Number.isFinite(slagQty) || !Number.isFinite(mnoPct)) return 0;
  if (slagQty <= 0 || mnoPct <= 0) return 0;
  return (slagQty * (mnoPct / 100)) / 1.29;
}

/**
 * Group consumption rows by heat log id. Pure helper used by the Heat-wise
 * production view and per-heat costing.
 */
export function groupConsumptionByHeat<T extends { heatLogId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.heatLogId) ?? [];
    list.push(row);
    map.set(row.heatLogId, list);
  }
  return map;
}
