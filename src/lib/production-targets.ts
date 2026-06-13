/**
 * Phase 2 — Production Targets (per-workspace, scoped).
 *
 * Source of truth for furnace- and grade-specific Mn recovery, Si recovery,
 * power (kWh/MT) and electrode (kg/MT) targets. The Alert Engine compares
 * actual heat values against the resolved target. The resolver picks the
 * most-specific row that matches a heat:
 *
 *     furnace + grade  >  grade  >  furnace  >  workspace default
 *
 * Rows with `is_active = false` are ignored.
 *
 * NEVER read targets directly in a UI component — always use the resolver
 * (`resolveTarget`) so the precedence is consistent across screens.
 */
import { supabase } from "@/integrations/supabase/client";

const client = supabase as unknown as { from: (t: string) => any };

export interface ProductionTarget {
  id: string;
  profitCenterId: string;
  furnaceId: string | null;
  product: string | null;
  grade: string | null;
  mnRecoveryTargetPct: number | null;
  siRecoveryTargetPct: number | null;
  kwhPerMtTarget: number | null;
  electrodeKgPerMtTarget: number | null;
  isActive: boolean;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionTargetInput {
  id?: string;
  profitCenterId: string;
  furnaceId?: string | null;
  product?: string | null;
  grade?: string | null;
  mnRecoveryTargetPct?: number | null;
  siRecoveryTargetPct?: number | null;
  kwhPerMtTarget?: number | null;
  electrodeKgPerMtTarget?: number | null;
  isActive?: boolean;
  notes?: string | null;
  createdBy: string;
}

function toRow(r: any): ProductionTarget {
  return {
    id: r.id,
    profitCenterId: r.profit_center_id,
    furnaceId: r.furnace_id ?? null,
    product: r.product ?? null,
    grade: r.grade ?? null,
    mnRecoveryTargetPct: r.mn_recovery_target_pct == null ? null : Number(r.mn_recovery_target_pct),
    siRecoveryTargetPct: r.si_recovery_target_pct == null ? null : Number(r.si_recovery_target_pct),
    kwhPerMtTarget: r.kwh_per_mt_target == null ? null : Number(r.kwh_per_mt_target),
    electrodeKgPerMtTarget: r.electrode_kg_per_mt_target == null ? null : Number(r.electrode_kg_per_mt_target),
    isActive: Boolean(r.is_active),
    notes: r.notes ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchProductionTargets(profitCenterId: string): Promise<ProductionTarget[]> {
  const { data, error } = await client
    .from("production_targets")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []).map(toRow);
}

export async function upsertProductionTarget(input: ProductionTargetInput): Promise<string> {
  const payload = {
    profit_center_id: input.profitCenterId,
    furnace_id: input.furnaceId ?? null,
    product: input.product ?? null,
    grade: input.grade ?? null,
    mn_recovery_target_pct: input.mnRecoveryTargetPct ?? null,
    si_recovery_target_pct: input.siRecoveryTargetPct ?? null,
    kwh_per_mt_target: input.kwhPerMtTarget ?? null,
    electrode_kg_per_mt_target: input.electrodeKgPerMtTarget ?? null,
    is_active: input.isActive ?? true,
    notes: input.notes ?? null,
    created_by: input.createdBy,
  };
  if (input.id) {
    const { error } = await client.from("production_targets").update(payload).eq("id", input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await client.from("production_targets").insert(payload).select("id").single();
  if (error) throw error;
  return (data as any).id as string;
}

export async function deactivateProductionTarget(id: string): Promise<void> {
  const { error } = await client.from("production_targets").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}

/** Resolved target snapshot — one field per metric, null when no rule matches. */
export interface ResolvedTarget {
  mnRecoveryTargetPct: number | null;
  siRecoveryTargetPct: number | null;
  kwhPerMtTarget: number | null;
  electrodeKgPerMtTarget: number | null;
  /** Diagnostic — which row(s) contributed. */
  sourceIds: string[];
}

const EMPTY_RESOLVED: ResolvedTarget = {
  mnRecoveryTargetPct: null,
  siRecoveryTargetPct: null,
  kwhPerMtTarget: null,
  electrodeKgPerMtTarget: null,
  sourceIds: [],
};

function eq(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/**
 * Resolve targets for a specific heat by walking from most-specific to least.
 *
 *   1. furnace + grade  (also matches product if present)
 *   2. grade            (workspace-level grade target)
 *   3. furnace          (any grade on this furnace)
 *   4. workspace default (no furnace, no grade)
 *
 * Each metric resolves independently — a metric may inherit from a higher
 * scope if the most-specific row leaves it null. `sourceIds` lists every row
 * that contributed at least one metric.
 */
export function resolveTarget(
  targets: ProductionTarget[],
  ctx: { furnaceId?: string | null; product?: string | null; grade?: string | null },
): ResolvedTarget {
  if (!Array.isArray(targets) || targets.length === 0) return EMPTY_RESOLVED;

  const matches: { rank: number; t: ProductionTarget }[] = [];
  for (const t of targets) {
    if (!t.isActive) continue;
    const fMatch = t.furnaceId ? t.furnaceId === ctx.furnaceId : true;
    const gMatch = t.grade ? eq(t.grade, ctx.grade) : true;
    const pMatch = t.product ? eq(t.product, ctx.product) : true;
    if (!fMatch || !gMatch || !pMatch) continue;
    let rank = 0;
    if (t.furnaceId) rank += 4;
    if (t.grade) rank += 2;
    if (t.product) rank += 1;
    matches.push({ rank, t });
  }
  if (matches.length === 0) return EMPTY_RESOLVED;
  matches.sort((a, b) => b.rank - a.rank);

  const out: ResolvedTarget = { ...EMPTY_RESOLVED, sourceIds: [] };
  const touched = new Set<string>();
  const fields = [
    "mnRecoveryTargetPct",
    "siRecoveryTargetPct",
    "kwhPerMtTarget",
    "electrodeKgPerMtTarget",
  ] as const;
  for (const { t } of matches) {
    let contributed = false;
    for (const f of fields) {
      if (out[f] === null && t[f] != null) {
        (out as any)[f] = t[f];
        contributed = true;
      }
    }
    if (contributed) touched.add(t.id);
  }
  out.sourceIds = Array.from(touched);
  return out;
}
