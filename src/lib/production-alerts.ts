/**
 * Production alert thresholds. Sourced from `profit_center_settings` under
 * `setting_key = 'production.alerts'`. Defaults below are applied ONLY when
 * the workspace has not configured its own — never used as policy.
 *
 * Admins can override per-workspace via Admin Settings.
 *
 * Phase 2 additions:
 *   - `mnoToMnFactor`: chemistry constant (default 1.29 = M(MnO)/M(Mn))
 *     previously hardcoded in `ferro-alloys.ts` / `clu-calc.ts`. Now fed to
 *     pure libs so admins can correct for local lab convention.
 *   - `maxRecoveryPct`: blocking validation threshold; if calculated Mn
 *     recovery exceeds this it's a chemistry breach (output > input).
 *   - `negativeLossTolerancePct`: tolerance for slightly negative loss
 *     percentages due to rounding before they become block / warn issues.
 *   - `electrodePasteKgPerMtTarget`: workspace default for electrode/paste
 *     consumption target (kg per MT) used by the Alert Engine when no
 *     scoped {@link ProductionTarget} matches.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ProductionAlertThresholds {
  /** Recovery % below this → red alert. */
  recoveryMinPct: number;
  /** Slag MnO % above this → warning. */
  slagMnoMaxPct: number;
  /** FC consumed per MT of production above this → high-cost alert. */
  fcPerMtMax: number;
  /** Material moisture % above this → warning at entry. */
  moistureMaxPct: number;
  /** kWh/MT above this → energy "high" status; within +5% → "near limit". */
  kwhPerMtTarget: number;
  /** Si recovery % below this → red alert (SiMn / FeSi heats). */
  siRecoveryMinPct: number;
  /** SiO₂→Si stoichiometric factor (admin-configurable; default 2.139). */
  sio2ToSiFactor: number;
  /** MnO→Mn stoichiometric factor (admin-configurable; default 1.29). */
  mnoToMnFactor: number;
  /** Recovery > this → BLOCK (mass-conservation breach). */
  maxRecoveryPct: number;
  /** Loss % may be negative within ±this (rounding); beyond → BLOCK. */
  negativeLossTolerancePct: number;
  /** Workspace-default electrode/paste consumption target (Kg/MT). */
  electrodePasteKgPerMtTarget: number;
}

export const DEFAULT_PRODUCTION_ALERTS: ProductionAlertThresholds = {
  recoveryMinPct: 70,
  slagMnoMaxPct: 18,
  fcPerMtMax: 0.45,
  moistureMaxPct: 15,
  kwhPerMtTarget: 4000,
  siRecoveryMinPct: 75,
  sio2ToSiFactor: 2.139,
  mnoToMnFactor: 1.29,
  maxRecoveryPct: 98,
  negativeLossTolerancePct: 2,
  electrodePasteKgPerMtTarget: 35,
};

const client = supabase as unknown as { from: (t: string) => any };

function num(v: unknown, fallback: number, opts?: { positive?: boolean }): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (opts?.positive && n <= 0) return fallback;
  return n;
}

export async function fetchProductionAlertThresholds(profitCenterId: string): Promise<ProductionAlertThresholds> {
  const { data, error } = await client
    .from("profit_center_settings")
    .select("setting_value")
    .eq("profit_center_id", profitCenterId)
    .eq("setting_key", "production.alerts")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;

  const v = (data?.setting_value ?? {}) as Partial<ProductionAlertThresholds>;
  const d = DEFAULT_PRODUCTION_ALERTS;
  return {
    recoveryMinPct: num(v.recoveryMinPct, d.recoveryMinPct),
    slagMnoMaxPct: num(v.slagMnoMaxPct, d.slagMnoMaxPct),
    fcPerMtMax: num(v.fcPerMtMax, d.fcPerMtMax),
    moistureMaxPct: num(v.moistureMaxPct, d.moistureMaxPct),
    kwhPerMtTarget: num(v.kwhPerMtTarget, d.kwhPerMtTarget),
    siRecoveryMinPct: num(v.siRecoveryMinPct, d.siRecoveryMinPct),
    sio2ToSiFactor: num(v.sio2ToSiFactor, d.sio2ToSiFactor, { positive: true }),
    mnoToMnFactor: num(v.mnoToMnFactor, d.mnoToMnFactor, { positive: true }),
    maxRecoveryPct: num(v.maxRecoveryPct, d.maxRecoveryPct, { positive: true }),
    negativeLossTolerancePct: num(v.negativeLossTolerancePct, d.negativeLossTolerancePct),
    electrodePasteKgPerMtTarget: num(v.electrodePasteKgPerMtTarget, d.electrodePasteKgPerMtTarget, { positive: true }),
  };
}
