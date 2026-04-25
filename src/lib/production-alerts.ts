/**
 * Production alert thresholds. Sourced from `profit_center_settings` under
 * `setting_key = 'production.alerts'`. Defaults below are applied ONLY when
 * the workspace has not configured its own — never used as policy.
 *
 * Admins can override per-workspace via Admin Settings.
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
}

export const DEFAULT_PRODUCTION_ALERTS: ProductionAlertThresholds = {
  recoveryMinPct: 70,
  slagMnoMaxPct: 18,
  fcPerMtMax: 0.45,
  moistureMaxPct: 15,
  kwhPerMtTarget: 4000,
};

const client = supabase as unknown as { from: (t: string) => any };

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
  return {
    recoveryMinPct: Number.isFinite(v.recoveryMinPct) ? Number(v.recoveryMinPct) : DEFAULT_PRODUCTION_ALERTS.recoveryMinPct,
    slagMnoMaxPct: Number.isFinite(v.slagMnoMaxPct) ? Number(v.slagMnoMaxPct) : DEFAULT_PRODUCTION_ALERTS.slagMnoMaxPct,
    fcPerMtMax: Number.isFinite(v.fcPerMtMax) ? Number(v.fcPerMtMax) : DEFAULT_PRODUCTION_ALERTS.fcPerMtMax,
    moistureMaxPct: Number.isFinite(v.moistureMaxPct) ? Number(v.moistureMaxPct) : DEFAULT_PRODUCTION_ALERTS.moistureMaxPct,
  };
}
