/**
 * Pure metallurgical math for the CLU (Converter Ladle Unit) module.
 *
 * Mirrors the Mn-balance approach used by the FAD page (`ferro-alloys.ts`)
 * but tailored to the CLU output shape. No Supabase / no React imports —
 * keep this file pure so it stays easy to unit-test.
 *
 * Formulas:
 *   - dryQty       = qtyWet * (1 - moisture% / 100)
 *   - mnInput      = dryQty * (mn% / 100)
 *   - metalMn      = productionQty * fgMn% / 100
 *   - slagMnAsMn   = (slagQty * slagMnO% / 100) / mnoToMnFactor
 *   - dustMn       = dustQty * dustMn% / 100
 *   - mnRecovery%  = metalMn / totalMnInput * 100
 *
 * `mnoToMnFactor` defaults to 1.29 (chemistry: MnO molar mass / Mn molar mass)
 * but is parameterised so the workspace `production.formulas` setting can
 * override it without code change. NEVER hardcode the factor in components.
 */

export interface CluMaterialInput {
  qtyWet: number;
  /** Moisture percentage 0-100. */
  moisturePct: number;
  /** Mn percentage on a dry basis, 0-100. */
  mnPct: number;
}

export interface CluOutputShape {
  productionQtyMt: number;
  fgMnPct: number;
  slagQtyMt: number;
  slagMnoPct: number;
  dustQtyMt: number;
  dustMnPct: number;
}

export interface CluBalanceResult {
  totalMnInput: number;
  metalMn: number;
  slagMn: number;
  dustMn: number;
  totalMnOutput: number;
  mnRecoveryPct: number;
  slagRecoveryPct: number;
  dustRecoveryPct: number;
  diffusiveLossPct: number;
  totalBalancePct: number;
  performanceTag: "Efficient" | "Normal" | "Loss High";
}

const DEFAULT_MNO_TO_MN_FACTOR = 1.29;

function safePct(numerator: number, denominator: number): number {
  if (!denominator || !Number.isFinite(denominator)) return 0;
  return (numerator / denominator) * 100;
}

export function computeCluBalance(
  materials: CluMaterialInput[],
  output: CluOutputShape,
  mnoToMnFactor: number = DEFAULT_MNO_TO_MN_FACTOR,
): CluBalanceResult {
  const factor = Number.isFinite(mnoToMnFactor) && mnoToMnFactor > 0 ? mnoToMnFactor : DEFAULT_MNO_TO_MN_FACTOR;

  const totalMnInput = materials.reduce((sum, m) => {
    const dry = m.qtyWet * (1 - (m.moisturePct ?? 0) / 100);
    return sum + dry * ((m.mnPct ?? 0) / 100);
  }, 0);

  const metalMn = output.productionQtyMt * (output.fgMnPct ?? 0) / 100;
  const slagMn = (output.slagQtyMt * (output.slagMnoPct ?? 0) / 100) / factor;
  const dustMn = output.dustQtyMt * (output.dustMnPct ?? 0) / 100;
  const totalMnOutput = metalMn + slagMn + dustMn;

  const mnRecoveryPct = safePct(metalMn, totalMnInput);
  const slagRecoveryPct = safePct(slagMn, totalMnInput);
  const dustRecoveryPct = safePct(dustMn, totalMnInput);
  const diffusiveLossPct = totalMnInput === 0 ? 0 : Math.max(0, 100 - (mnRecoveryPct + slagRecoveryPct + dustRecoveryPct));
  const totalBalancePct = mnRecoveryPct + slagRecoveryPct + dustRecoveryPct + diffusiveLossPct;

  let performanceTag: CluBalanceResult["performanceTag"];
  if (totalMnInput === 0) {
    performanceTag = "Normal";
  } else if (totalBalancePct >= 98 && totalBalancePct <= 102) {
    performanceTag = "Efficient";
  } else if (totalBalancePct < 98) {
    performanceTag = "Loss High";
  } else {
    performanceTag = "Normal";
  }

  return {
    totalMnInput,
    metalMn,
    slagMn,
    dustMn,
    totalMnOutput,
    mnRecoveryPct,
    slagRecoveryPct,
    dustRecoveryPct,
    diffusiveLossPct,
    totalBalancePct,
    performanceTag,
  };
}
