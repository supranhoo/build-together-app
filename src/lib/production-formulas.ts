/**
 * Workspace-configurable defaults for the FAD Production Entry screen.
 *
 * Stored in `profit_center_settings` under `setting_key='production.formulas'`
 * so admins can override per workspace without code changes. The defaults
 * below are the authoritative metallurgical constants used in
 * `src/lib/ferro-alloys.ts` (MnO→Mn = 1.29). They are NOT business policy —
 * they are the chemistry, and the workspace setting can only narrow defaults
 * for screen prefill, not override the formulas themselves.
 *
 * If you want to change how recovery is calculated, edit `ferro-alloys.ts`.
 * This file only affects screen prefill values (default FG Mn%, default
 * material group names mapped to ore/reductant/flux/paste, etc.).
 */
import { supabase } from "@/integrations/supabase/client";

export interface ProductionFormulaDefaults {
  /** Prefill for FG Mn% on the Output step. */
  fgMnDefaultPct: number;
  /** Prefill for slag MnO% on the Output step. */
  slagMnoDefaultPct: number;
  /** Prefill for dust Mn% on the Output step. */
  dustMnDefaultPct: number;
  /** Material group_name values that classify rows in pickers. */
  materialGroups: {
    ore: string[];
    reductant: string[];
    flux: string[];
    paste: string[];
  };
}

export const DEFAULT_PRODUCTION_FORMULAS: ProductionFormulaDefaults = {
  fgMnDefaultPct: 65,
  slagMnoDefaultPct: 15,
  dustMnDefaultPct: 10,
  materialGroups: {
    ore: ["Mn Ore", "Manganese Ore", "Ore"],
    reductant: ["Reductant", "Coke", "Coal", "Char"],
    flux: ["Flux", "Quartz", "Dolomite"],
    paste: ["Paste", "Electrode Paste"],
  },
};

const client = supabase as unknown as { from: (t: string) => any };

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export async function fetchProductionFormulaDefaults(profitCenterId: string): Promise<ProductionFormulaDefaults> {
  const { data, error } = await client
    .from("profit_center_settings")
    .select("setting_value")
    .eq("profit_center_id", profitCenterId)
    .eq("setting_key", "production.formulas")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;

  const v = (data?.setting_value ?? {}) as Partial<ProductionFormulaDefaults> & {
    materialGroups?: Partial<ProductionFormulaDefaults["materialGroups"]>;
  };

  const mg: Partial<ProductionFormulaDefaults["materialGroups"]> = v.materialGroups ?? {};
  return {
    fgMnDefaultPct: Number.isFinite(v.fgMnDefaultPct) ? Number(v.fgMnDefaultPct) : DEFAULT_PRODUCTION_FORMULAS.fgMnDefaultPct,
    slagMnoDefaultPct: Number.isFinite(v.slagMnoDefaultPct) ? Number(v.slagMnoDefaultPct) : DEFAULT_PRODUCTION_FORMULAS.slagMnoDefaultPct,
    dustMnDefaultPct: Number.isFinite(v.dustMnDefaultPct) ? Number(v.dustMnDefaultPct) : DEFAULT_PRODUCTION_FORMULAS.dustMnDefaultPct,
    materialGroups: {
      ore: isStringArray(mg.ore) ? mg.ore : DEFAULT_PRODUCTION_FORMULAS.materialGroups.ore,
      reductant: isStringArray(mg.reductant) ? mg.reductant : DEFAULT_PRODUCTION_FORMULAS.materialGroups.reductant,
      flux: isStringArray(mg.flux) ? mg.flux : DEFAULT_PRODUCTION_FORMULAS.materialGroups.flux,
      paste: isStringArray(mg.paste) ? mg.paste : DEFAULT_PRODUCTION_FORMULAS.materialGroups.paste,
    },
  };
}

export type FadMaterialKind = "ore" | "reductant" | "flux" | "paste";

/**
 * Classify a material into one of the four FAD entry buckets using its
 * `group_name` (preferred) or `category` (fallback). Returns null when
 * nothing matches so the page can hide it from the FAD pickers.
 */
export function classifyMaterial(
  material: { groupName?: string | null; category?: string | null },
  groups: ProductionFormulaDefaults["materialGroups"],
): FadMaterialKind | null {
  const value = (material.groupName ?? material.category ?? "").trim();
  if (!value) return null;
  const lc = value.toLowerCase();
  for (const kind of ["ore", "reductant", "flux", "paste"] as const) {
    if (groups[kind].some((g) => g.toLowerCase() === lc)) return kind;
  }
  return null;
}
