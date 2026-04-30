/**
 * Silicon (Si) balance — mirror of the Mn balance, used by SiMn / Ferro-Si
 * heat entry. Pure functions, no I/O, no React.
 *
 * NO HARDCODED CHEMISTRY: the SiO₂→Si stoichiometric factor is supplied by
 * the caller (admin-configurable, default 2.139 = M(SiO₂)/M(Si) = 60.08/28.09).
 *
 * All percentages are 0–100 (e.g. fgSiPct = 16 means 16% Si in the metal).
 */

/** Default SiO₂ → Si conversion factor (M(SiO₂)/M(Si) ≈ 60.08/28.09). */
export const DEFAULT_SIO2_TO_SI_FACTOR = 2.139;

export interface SiInputRow {
  /** Wet quantity in MT (or the same unit as your output). */
  qty: number;
  /** Si% on the as-received basis, 0–100. */
  siPct: number;
  /** Moisture% on the as-received basis, 0–100. */
  moisturePct: number;
}

/**
 * Total Si input across all consumed rows (MT Si):
 *   Σ qty × (siPct / 100) × (1 − moisturePct / 100)
 */
export function siInput(rows: SiInputRow[]): number {
  let total = 0;
  for (const r of rows) {
    if (!Number.isFinite(r.qty) || !Number.isFinite(r.siPct) || r.qty <= 0 || r.siPct <= 0) continue;
    const moisture = Number.isFinite(r.moisturePct) ? Math.max(0, r.moisturePct) : 0;
    const dryFactor = Math.max(0, 1 - moisture / 100);
    total += r.qty * (r.siPct / 100) * dryFactor;
  }
  return total;
}

/** Si in metal = production × (fgSi% / 100). */
export function siMetal(productionMt: number, fgSiPct: number): number {
  if (!Number.isFinite(productionMt) || !Number.isFinite(fgSiPct)) return 0;
  if (productionMt <= 0 || fgSiPct <= 0) return 0;
  return productionMt * (fgSiPct / 100);
}

/**
 * Si locked in slag = (slagQty × SiO₂%/100) / sio2ToSiFactor.
 * Factor is required and admin-configurable — never hardcode at the call site.
 */
export function siSlag(slagQty: number, sio2Pct: number, sio2ToSiFactor: number): number {
  if (!Number.isFinite(slagQty) || !Number.isFinite(sio2Pct) || !Number.isFinite(sio2ToSiFactor)) return 0;
  if (slagQty <= 0 || sio2Pct <= 0 || sio2ToSiFactor <= 0) return 0;
  return (slagQty * (sio2Pct / 100)) / sio2ToSiFactor;
}

/** Si in dust = qty × Si% / 100 (already Si, no SiO₂ conversion). */
export function siDust(dustQty: number, dustSiPct: number): number {
  if (!Number.isFinite(dustQty) || !Number.isFinite(dustSiPct)) return 0;
  if (dustQty <= 0 || dustSiPct <= 0) return 0;
  return dustQty * (dustSiPct / 100);
}

export interface SiBalance {
  metalSi: number;
  slagSi: number;
  dustSi: number;
  totalOutputSi: number;
  recoveryPct: number | null;
  slagLossPct: number | null;
  dustLossPct: number | null;
  diffLossPct: number | null;
}

/**
 * Full Si balance for one heat. `sio2ToSiFactor` is required and comes from
 * workspace settings — pass DEFAULT_SIO2_TO_SI_FACTOR only as a fallback.
 *
 * recovery + slagLoss + dustLoss + diffLoss = 100 when inputSi > 0.
 */
export function siBalance(args: {
  inputSi: number;
  productionMt: number;
  fgSiPct: number;
  slagQty: number;
  slagSio2Pct: number;
  dustQty: number;
  dustSiPct: number;
  sio2ToSiFactor: number;
}): SiBalance {
  const metal = siMetal(args.productionMt, args.fgSiPct);
  const slag = siSlag(args.slagQty, args.slagSio2Pct, args.sio2ToSiFactor);
  const dust = siDust(args.dustQty, args.dustSiPct);
  const total = metal + slag + dust;

  if (!Number.isFinite(args.inputSi) || args.inputSi <= 0) {
    return {
      metalSi: metal,
      slagSi: slag,
      dustSi: dust,
      totalOutputSi: total,
      recoveryPct: null,
      slagLossPct: null,
      dustLossPct: null,
      diffLossPct: null,
    };
  }

  const recovery = (metal / args.inputSi) * 100;
  const slagLoss = (slag / args.inputSi) * 100;
  const dustLoss = (dust / args.inputSi) * 100;
  const diff = 100 - (recovery + slagLoss + dustLoss);

  return {
    metalSi: metal,
    slagSi: slag,
    dustSi: dust,
    totalOutputSi: total,
    recoveryPct: recovery,
    slagLossPct: slagLoss,
    dustLossPct: dustLoss,
    diffLossPct: diff,
  };
}
