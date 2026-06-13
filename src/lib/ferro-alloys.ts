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

/** Default MnO→Mn stoichiometric factor (M(MnO)/M(Mn) = 70.94/54.94 ≈ 1.29).
 *  Kept as a default so legacy callers continue to work; new callers should
 *  pass the workspace-configured factor from `production.alerts.mnoToMnFactor`. */
export const DEFAULT_MNO_TO_MN_FACTOR = 1.29;

/**
 * Mn locked in slag.
 *   (slagQty × MnO%) / mnoToMnFactor
 *
 * Phase 2: factor is admin-configurable per workspace. Callers pass
 * `thresholds.mnoToMnFactor`; the default preserves prior behaviour for
 * legacy call sites and tests that did not yet thread the factor.
 */
export function slagMn(slagQty: number, mnoPct: number, mnoToMnFactor: number = DEFAULT_MNO_TO_MN_FACTOR): number {
  if (!Number.isFinite(slagQty) || !Number.isFinite(mnoPct)) return 0;
  if (slagQty <= 0 || mnoPct <= 0) return 0;
  const f = Number.isFinite(mnoToMnFactor) && mnoToMnFactor > 0 ? mnoToMnFactor : DEFAULT_MNO_TO_MN_FACTOR;
  return (slagQty * (mnoPct / 100)) / f;
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

/**
 * Full Mn balance breakdown for one heat. All percentages are returned in
 * 0–100 form so the UI can render directly. `recoveryPct`, `slagLossPct`,
 * `dustLossPct` and `diffLossPct` sum to 100 when input > 0.
 */
export interface MnBalance {
  metalMn: number;
  slagMn: number;
  dustMn: number;
  totalOutputMn: number;
  recoveryPct: number | null;
  slagLossPct: number | null;
  dustLossPct: number | null;
  diffLossPct: number | null;
}

export function mnBalance(args: {
  inputMn: number;
  productionMt: number;
  fgMnPct: number;
  slagQty: number;
  slagMnoPct: number;
  dustQty: number;
  dustMnPct: number;
  /** Phase 2: optional workspace-configured factor. Defaults to 1.29. */
  mnoToMnFactor?: number;
}): MnBalance {
  const metal = mnOutput(args.productionMt, args.fgMnPct);
  const slag = slagMn(args.slagQty, args.slagMnoPct, args.mnoToMnFactor);
  // Dust Mn = qty × Mn% / 100 (Mn already, not MnO — no MnO→Mn factor).
  const dust =
    Number.isFinite(args.dustQty) && Number.isFinite(args.dustMnPct) && args.dustQty > 0 && args.dustMnPct > 0
      ? args.dustQty * (args.dustMnPct / 100)
      : 0;
  const total = metal + slag + dust;

  if (!Number.isFinite(args.inputMn) || args.inputMn <= 0) {
    return {
      metalMn: metal,
      slagMn: slag,
      dustMn: dust,
      totalOutputMn: total,
      recoveryPct: null,
      slagLossPct: null,
      dustLossPct: null,
      diffLossPct: null,
    };
  }

  const recovery = (metal / args.inputMn) * 100;
  const slagLoss = (slag / args.inputMn) * 100;
  const dustLoss = (dust / args.inputMn) * 100;
  // Diff loss can be negative if measured outputs exceed input — reported as-is so users can spot bad data.
  const diff = 100 - (recovery + slagLoss + dustLoss);

  return {
    metalMn: metal,
    slagMn: slag,
    dustMn: dust,
    totalOutputMn: total,
    recoveryPct: recovery,
    slagLossPct: slagLoss,
    dustLossPct: dustLoss,
    diffLossPct: diff,
  };
}
