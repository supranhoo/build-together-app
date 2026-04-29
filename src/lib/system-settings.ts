/**
 * System Logic & per-workspace module mappings.
 *
 * - `system_settings`  : single-row JSON config keyed by `key` (e.g. 'system_logic').
 * - `module_mappings`  : per-profit-center on/off toggle for app modules
 *                        (overrides the global `app_modules`/`profit_center_modules` config).
 *
 * RLS:
 *   - system_settings : authenticated SELECT, admin/super_admin INSERT/UPDATE.
 *   - module_mappings : workspace members SELECT, workspace admins INSERT/UPDATE/DELETE.
 */

import { supabase } from "@/integrations/supabase/client";

const client = supabase as unknown as { from: (t: string) => any };

export type AllocationBasis = "per_mt" | "per_kwh" | "per_nm3" | "per_day" | "lumpsum";

export interface SystemLogicConfig {
  enableSlagCredit: boolean;
  enableUtilityAllocation: boolean;
  defaultAllocationBasis: AllocationBasis;
  costRoundingDp: number;
}

export const DEFAULT_SYSTEM_LOGIC: SystemLogicConfig = {
  enableSlagCredit: true,
  enableUtilityAllocation: true,
  defaultAllocationBasis: "per_mt",
  costRoundingDp: 2,
};

export const SYSTEM_LOGIC_KEY = "system_logic";

export async function getSystemLogic(): Promise<SystemLogicConfig | null> {
  const { data, error } = await client
    .from("system_settings")
    .select("config")
    .eq("key", SYSTEM_LOGIC_KEY)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...DEFAULT_SYSTEM_LOGIC, ...(data.config as Partial<SystemLogicConfig>) };
}

export async function saveSystemLogic(config: SystemLogicConfig, updatedBy: string | null): Promise<void> {
  const { error } = await client.from("system_settings").upsert(
    {
      key: SYSTEM_LOGIC_KEY,
      config,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    },
    { onConflict: "key" },
  );
  if (error) throw error;
}

export interface ModuleMapping {
  profitCenterId: string;
  moduleId: string;
  isEnabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

function toMapping(row: any): ModuleMapping {
  return {
    profitCenterId: row.profit_center_id,
    moduleId: row.module_id,
    isEnabled: Boolean(row.is_enabled),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? null,
  };
}

export async function getModuleMappings(profitCenterId: string): Promise<ModuleMapping[]> {
  const { data, error } = await client
    .from("module_mappings")
    .select("profit_center_id, module_id, is_enabled, updated_at, updated_by")
    .eq("profit_center_id", profitCenterId);
  if (error) throw error;
  return (data ?? []).map(toMapping);
}

export async function setModuleMapping(
  profitCenterId: string,
  moduleId: string,
  isEnabled: boolean,
  updatedBy: string | null,
): Promise<void> {
  const { error } = await client.from("module_mappings").upsert(
    {
      profit_center_id: profitCenterId,
      module_id: moduleId,
      is_enabled: isEnabled,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    },
    { onConflict: "profit_center_id,module_id" },
  );
  if (error) throw error;
}

/**
 * Pure helper: a module is enabled when there is no override or the override is true.
 * Used at the boundary so callers don't have to special-case missing rows.
 */
export function isModuleEnabled(mappings: ModuleMapping[], moduleId: string): boolean {
  const m = mappings.find((x) => x.moduleId === moduleId);
  return m ? m.isEnabled : true;
}
