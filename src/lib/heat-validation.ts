/**
 * Phase 2 — Heat Validation & Alert Engine.
 *
 * Pure, deterministic functions. No I/O. The page passes:
 *   - the metallurgy snapshot the operator is about to save / submit
 *   - the resolved {@link ResolvedTarget} for that furnace + grade
 *   - the workspace-level threshold bundle (admin-configurable)
 *
 * We return a list of {@link HeatIssue}s with severity:
 *   - "block": submission MUST be refused (impossible chemistry / data error)
 *   - "warn":  surfaced to the approver but does not block submission
 *
 * Anything the operator can override is "warn". Anything the laws of
 * conservation forbid is "block".
 */
import type { MnBalance } from "@/lib/ferro-alloys";
import type { ProductionAlertThresholds } from "@/lib/production-alerts";
import type { ResolvedTarget } from "@/lib/production-targets";

export type IssueSeverity = "block" | "warn";

export interface HeatIssue {
  /** Stable machine code, e.g. "FG_MN_OUT_OF_RANGE". Used in approval UI badges. */
  code: string;
  severity: IssueSeverity;
  message: string;
  /** Which field this issue is anchored to (for inline hints). */
  field?:
    | "weightMt"
    | "fgMnPct"
    | "slagQtyMt"
    | "slagMnoPct"
    | "dustQtyMt"
    | "dustMnPct"
    | "powerMwh"
    | "recovery"
    | "siRecovery"
    | "electrode";
}

/** Snapshot of the heat used by validation. All percentages are 0–100. */
export interface HeatSnapshot {
  weightMt: number | null;
  fgMnPct: number | null;
  slagQtyMt: number | null;
  slagMnoPct: number | null;
  dustQtyMt: number | null;
  dustMnPct: number | null;
  totalPowerMwh: number | null;
  electrodeKg?: number | null;
  mnBalance?: MnBalance | null;
  siRecoveryPct?: number | null;
}

const PCT = { min: 0, max: 100 } as const;

function range(
  value: number | null | undefined,
  field: HeatIssue["field"],
  label: string,
  min: number,
  max: number,
  code: string,
): HeatIssue | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) {
    return { code: `${code}_NAN`, severity: "block", message: `${label} is not a number`, field };
  }
  if (value < min || value > max) {
    return {
      code,
      severity: "block",
      message: `${label} ${value} is outside the allowed range ${min}–${max}`,
      field,
    };
  }
  return null;
}

function pushIf<T>(arr: T[], v: T | null): void {
  if (v) arr.push(v);
}

/**
 * Validate a single heat against impossible-chemistry rules and the
 * configured targets. Pure function — same inputs always produce same output.
 *
 * Returns an empty list when the heat is acceptable.
 */
export function validateHeat(
  snap: HeatSnapshot,
  thresholds: ProductionAlertThresholds,
  target: ResolvedTarget,
): HeatIssue[] {
  const issues: HeatIssue[] = [];

  // 1. Range guards (BLOCK) — impossible values.
  pushIf(issues, range(snap.weightMt, "weightMt", "Heat weight (MT)", 0, 1000, "WEIGHT_RANGE"));
  pushIf(issues, range(snap.fgMnPct, "fgMnPct", "FG Mn %", PCT.min, PCT.max, "FG_MN_RANGE"));
  pushIf(issues, range(snap.slagQtyMt, "slagQtyMt", "Slag quantity (MT)", 0, 1000, "SLAG_QTY_RANGE"));
  pushIf(issues, range(snap.slagMnoPct, "slagMnoPct", "Slag MnO %", PCT.min, PCT.max, "SLAG_MNO_RANGE"));
  pushIf(issues, range(snap.dustQtyMt, "dustQtyMt", "Dust quantity (MT)", 0, 1000, "DUST_QTY_RANGE"));
  pushIf(issues, range(snap.dustMnPct, "dustMnPct", "Dust Mn %", PCT.min, PCT.max, "DUST_MN_RANGE"));
  pushIf(issues, range(snap.totalPowerMwh, "powerMwh", "Power (MWh)", 0, 10000, "POWER_RANGE"));
  if (snap.electrodeKg != null) {
    pushIf(issues, range(snap.electrodeKg, "electrode", "Electrode (Kg)", 0, 100000, "ELECTRODE_RANGE"));
  }

  // 2. Mn balance sanity (BLOCK on conservation breach beyond tolerance).
  const bal = snap.mnBalance ?? null;
  if (bal) {
    const maxRec = Number.isFinite(thresholds.maxRecoveryPct) ? thresholds.maxRecoveryPct : 100;
    if (bal.recoveryPct != null && bal.recoveryPct > maxRec) {
      issues.push({
        code: "RECOVERY_OVERSHOOT",
        severity: "block",
        message: `Mn recovery ${bal.recoveryPct.toFixed(2)}% exceeds the allowed maximum of ${maxRec}% — chemistry breach (output > input).`,
        field: "recovery",
      });
    }
    const tol = Number.isFinite(thresholds.negativeLossTolerancePct)
      ? thresholds.negativeLossTolerancePct
      : 2;
    // Slag / dust losses are conserved masses — they cannot be negative.
    if (bal.slagLossPct != null && bal.slagLossPct < -tol) {
      issues.push({
        code: "NEG_SLAG_LOSS",
        severity: "block",
        message: `Slag Mn loss is negative (${bal.slagLossPct.toFixed(2)}%) — check slag quantity or MnO%.`,
        field: "slagQtyMt",
      });
    }
    if (bal.dustLossPct != null && bal.dustLossPct < -tol) {
      issues.push({
        code: "NEG_DUST_LOSS",
        severity: "block",
        message: `Dust Mn loss is negative (${bal.dustLossPct.toFixed(2)}%) — check dust quantity or Mn%.`,
        field: "dustQtyMt",
      });
    }
    // Diff loss CAN legitimately be slightly negative on rounding, so we warn
    // unless it crosses the tolerance.
    if (bal.diffLossPct != null && bal.diffLossPct < -tol) {
      issues.push({
        code: "NEG_DIFF_LOSS",
        severity: "warn",
        message: `Unaccounted Mn is negative (${bal.diffLossPct.toFixed(2)}%) — likely overstated outputs.`,
      });
    }

    // 3. Target deviation (WARN).
    if (target.mnRecoveryTargetPct != null && bal.recoveryPct != null) {
      if (bal.recoveryPct < target.mnRecoveryTargetPct) {
        issues.push({
          code: "MN_RECOVERY_BELOW_TARGET",
          severity: "warn",
          message: `Mn recovery ${bal.recoveryPct.toFixed(2)}% is below target ${target.mnRecoveryTargetPct}%.`,
          field: "recovery",
        });
      }
    } else if (bal.recoveryPct != null && bal.recoveryPct < thresholds.recoveryMinPct) {
      // Fallback to workspace minimum when no scoped target is set.
      issues.push({
        code: "MN_RECOVERY_BELOW_MIN",
        severity: "warn",
        message: `Mn recovery ${bal.recoveryPct.toFixed(2)}% is below the workspace minimum ${thresholds.recoveryMinPct}%.`,
        field: "recovery",
      });
    }
  }

  // 4. Si recovery vs target (WARN).
  if (snap.siRecoveryPct != null) {
    if (target.siRecoveryTargetPct != null && snap.siRecoveryPct < target.siRecoveryTargetPct) {
      issues.push({
        code: "SI_RECOVERY_BELOW_TARGET",
        severity: "warn",
        message: `Si recovery ${snap.siRecoveryPct.toFixed(2)}% is below target ${target.siRecoveryTargetPct}%.`,
        field: "siRecovery",
      });
    } else if (
      target.siRecoveryTargetPct == null &&
      snap.siRecoveryPct < thresholds.siRecoveryMinPct
    ) {
      issues.push({
        code: "SI_RECOVERY_BELOW_MIN",
        severity: "warn",
        message: `Si recovery ${snap.siRecoveryPct.toFixed(2)}% is below the workspace minimum ${thresholds.siRecoveryMinPct}%.`,
        field: "siRecovery",
      });
    }
  }

  // 5. Energy deviation (WARN). kWh/MT = power MWh × 1000 / weight MT.
  if (snap.weightMt != null && snap.weightMt > 0 && snap.totalPowerMwh != null) {
    const kwhPerMt = (snap.totalPowerMwh * 1000) / snap.weightMt;
    const tgt = target.kwhPerMtTarget ?? thresholds.kwhPerMtTarget;
    if (kwhPerMt > tgt) {
      issues.push({
        code: "POWER_ABOVE_TARGET",
        severity: "warn",
        message: `Energy ${kwhPerMt.toFixed(0)} kWh/MT exceeds target ${tgt.toFixed(0)} kWh/MT.`,
        field: "powerMwh",
      });
    }
  }

  // 6. Electrode deviation (WARN). Only when target + actual both known.
  if (
    snap.electrodeKg != null &&
    snap.weightMt != null &&
    snap.weightMt > 0 &&
    target.electrodeKgPerMtTarget != null
  ) {
    const eKgPerMt = snap.electrodeKg / snap.weightMt;
    if (eKgPerMt > target.electrodeKgPerMtTarget) {
      issues.push({
        code: "ELECTRODE_ABOVE_TARGET",
        severity: "warn",
        message: `Electrode ${eKgPerMt.toFixed(2)} Kg/MT exceeds target ${target.electrodeKgPerMtTarget} Kg/MT.`,
        field: "electrode",
      });
    }
  }

  return issues;
}

/** Convenience predicate — true if any issue would block submission. */
export function hasBlockingIssue(issues: HeatIssue[]): boolean {
  return issues.some((i) => i.severity === "block");
}

/** Counts grouped by severity. */
export function summariseIssues(issues: HeatIssue[]): { block: number; warn: number } {
  let block = 0;
  let warn = 0;
  for (const i of issues) {
    if (i.severity === "block") block += 1;
    else warn += 1;
  }
  return { block, warn };
}
