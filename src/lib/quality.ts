/**
 * Quality Control service layer (Phase B).
 *
 * Scope of this phase:
 *  - Sampling Management: CRUD + lifecycle transitions for `quality_samples`
 *      planned → collected → tested → released | rejected
 *      (a "released" sample is terminal — RLS blocks further updates.)
 *  - Bunker Feed QC: insert + list `bunker_feed_tests` with a pure
 *      `evaluateBunkerTest` helper that compares observed values
 *      to `materials.specs` and to optional workspace tolerances and
 *      classifies the result as pass | conditional | fail.
 *
 * Pure-vs-IO split:
 *  - All evaluation/transition rules are pure functions (testable, no DB).
 *  - DB calls are thin wrappers that translate snake_case ↔ camelCase
 *    and rely on the RLS + audit triggers shipped in Phase A.
 *
 * No business value is hardcoded — material specs come from
 * `materials.specs`, and tolerances are passed in by the caller.
 */
import { supabase } from "@/integrations/supabase/client";

const client = supabase as unknown as { from: (t: string) => any };

// =====================================================================
// Types
// =====================================================================

export type SampleStatus = "planned" | "collected" | "tested" | "released" | "rejected";
export type BunkerResult = "pass" | "conditional" | "fail";

export interface QualitySample {
  id: string;
  profitCenterId: string;
  sampleNo: string;
  materialId: string | null;
  stockLocationId: string | null;
  lotReference: string | null;
  status: SampleStatus;
  plannedAt: string;
  collectedAt: string | null;
  testedAt: string | null;
  testResults: Record<string, unknown>;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BunkerFeedTest {
  id: string;
  profitCenterId: string;
  materialId: string;
  stockLocationId: string;
  testedAt: string;
  mnPct: number | null;
  fcPct: number | null;
  moisturePct: number | null;
  sizeRange: string | null;
  extraSpecs: Record<string, unknown>;
  result: BunkerResult;
  deviations: BunkerDeviation[];
  validUntil: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface BunkerDeviation {
  field: string;
  observed: number | null;
  expectedMin?: number | null;
  expectedMax?: number | null;
  severity: "minor" | "major";
}

/**
 * Numeric specification for a bunker-tested field.
 * `min` / `max` come from `materials.specs[field]` or workspace tolerance overrides.
 * `criticalMin` / `criticalMax` represent the harder bounds where breach => fail.
 * Inside [min,max] = pass; outside [min,max] but inside criticals = conditional;
 * outside criticals (or either critical breached) = fail.
 */
export interface FieldSpec {
  min?: number | null;
  max?: number | null;
  criticalMin?: number | null;
  criticalMax?: number | null;
}

export type BunkerSpecMap = Partial<Record<"mnPct" | "fcPct" | "moisturePct", FieldSpec>>;

// =====================================================================
// Pure helpers — Sampling lifecycle
// =====================================================================

/** Allowed transitions for quality_samples. Mirrors policy in POLICY.md. */
const SAMPLE_TRANSITIONS: Record<SampleStatus, SampleStatus[]> = {
  planned:   ["collected", "rejected"],
  collected: ["tested", "rejected"],
  tested:    ["released", "rejected"],
  released:  [], // terminal
  rejected:  [], // terminal
};

export function canTransitionSample(from: SampleStatus, to: SampleStatus): boolean {
  return SAMPLE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextSampleStatuses(from: SampleStatus): SampleStatus[] {
  return [...(SAMPLE_TRANSITIONS[from] ?? [])];
}

// =====================================================================
// Pure helper — Bunker test evaluation
// =====================================================================

/**
 * Compare observed bunker values against the spec map and return a
 * verdict + ordered list of deviations. Pure — no I/O.
 *
 * Rules (single source of truth — see POLICY.md §Quality / Bunker Feed QC):
 *   • A field with no spec is ignored.
 *   • Breach of a critical bound on ANY field => fail.
 *   • Breach of a soft bound on ANY field    => conditional (unless already fail).
 *   • All within soft bounds                 => pass.
 *   • A null observation for a spec'd field is recorded as a major deviation
 *     (treated as conditional) — material with unknown chemistry should not
 *     silently pass.
 */
export function evaluateBunkerTest(
  observed: { mnPct?: number | null; fcPct?: number | null; moisturePct?: number | null },
  specs: BunkerSpecMap
): { result: BunkerResult; deviations: BunkerDeviation[] } {
  const deviations: BunkerDeviation[] = [];
  let worst: BunkerResult = "pass";

  const fields: Array<keyof BunkerSpecMap> = ["mnPct", "fcPct", "moisturePct"];
  for (const field of fields) {
    const spec = specs[field];
    if (!spec) continue;
    const value = observed[field] ?? null;

    if (value === null || value === undefined || Number.isNaN(value)) {
      deviations.push({
        field,
        observed: null,
        expectedMin: spec.min ?? null,
        expectedMax: spec.max ?? null,
        severity: "major",
      });
      if (worst === "pass") worst = "conditional";
      continue;
    }

    const breaksCriticalLow  = spec.criticalMin != null && value < spec.criticalMin;
    const breaksCriticalHigh = spec.criticalMax != null && value > spec.criticalMax;
    const breaksSoftLow      = spec.min != null && value < spec.min;
    const breaksSoftHigh     = spec.max != null && value > spec.max;

    if (breaksCriticalLow || breaksCriticalHigh) {
      worst = "fail";
      deviations.push({
        field, observed: value,
        expectedMin: spec.min ?? null, expectedMax: spec.max ?? null,
        severity: "major",
      });
    } else if (breaksSoftLow || breaksSoftHigh) {
      if (worst === "pass") worst = "conditional";
      deviations.push({
        field, observed: value,
        expectedMin: spec.min ?? null, expectedMax: spec.max ?? null,
        severity: "minor",
      });
    }
  }

  return { result: worst, deviations };
}

/**
 * Translate a `materials.specs` jsonb payload into a BunkerSpecMap.
 * Convention (documented in DOCUMENTATION.md):
 *   {
 *     "mn_pct": { "min": 46, "max": 52, "critical_min": 44 },
 *     "fc_pct": { "min": 80, "critical_min": 75 },
 *     "moisture_pct": { "max": 6, "critical_max": 8 }
 *   }
 */
export function specsFromMaterial(specsJson: unknown): BunkerSpecMap {
  const out: BunkerSpecMap = {};
  if (!specsJson || typeof specsJson !== "object") return out;
  const map: Record<string, keyof BunkerSpecMap> = {
    mn_pct: "mnPct",
    fc_pct: "fcPct",
    moisture_pct: "moisturePct",
  };
  for (const [src, dest] of Object.entries(map)) {
    const raw = (specsJson as Record<string, any>)[src];
    if (!raw || typeof raw !== "object") continue;
    out[dest] = {
      min: numOrNull(raw.min),
      max: numOrNull(raw.max),
      criticalMin: numOrNull(raw.critical_min ?? raw.criticalMin),
      criticalMax: numOrNull(raw.critical_max ?? raw.criticalMax),
    };
  }
  return out;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// =====================================================================
// Mappers
// =====================================================================

function toSample(row: any): QualitySample {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    sampleNo: row.sample_no,
    materialId: row.material_id ?? null,
    stockLocationId: row.stock_location_id ?? null,
    lotReference: row.lot_reference ?? null,
    status: row.status,
    plannedAt: row.planned_at,
    collectedAt: row.collected_at ?? null,
    testedAt: row.tested_at ?? null,
    testResults: row.test_results ?? {},
    notes: row.notes ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toBunkerTest(row: any): BunkerFeedTest {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    materialId: row.material_id,
    stockLocationId: row.stock_location_id,
    testedAt: row.tested_at,
    mnPct: row.mn_pct ?? null,
    fcPct: row.fc_pct ?? null,
    moisturePct: row.moisture_pct ?? null,
    sizeRange: row.size_range ?? null,
    extraSpecs: row.extra_specs ?? {},
    result: row.result,
    deviations: Array.isArray(row.deviations) ? row.deviations : [],
    validUntil: row.valid_until ?? null,
    notes: row.notes ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// =====================================================================
// Sampling — DB I/O
// =====================================================================

export async function fetchSamples(profitCenterId: string): Promise<QualitySample[]> {
  const { data, error } = await client.from("quality_samples")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("planned_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map(toSample);
}

export interface CreateSampleInput {
  profitCenterId: string;
  createdBy: string;
  sampleNo: string;
  materialId?: string | null;
  stockLocationId?: string | null;
  lotReference?: string | null;
  notes?: string | null;
}

export async function createSample(input: CreateSampleInput): Promise<QualitySample> {
  const { data, error } = await client.from("quality_samples")
    .insert({
      profit_center_id: input.profitCenterId,
      created_by: input.createdBy,
      sample_no: input.sampleNo,
      material_id: input.materialId ?? null,
      stock_location_id: input.stockLocationId ?? null,
      lot_reference: input.lotReference ?? null,
      notes: input.notes ?? null,
      status: "planned",
    })
    .select("*")
    .single();
  if (error) throw error;
  return toSample(data);
}

export interface TransitionSampleInput {
  id: string;
  current: SampleStatus;
  next: SampleStatus;
  testResults?: Record<string, unknown>;
  notes?: string | null;
}

export async function transitionSample(input: TransitionSampleInput): Promise<QualitySample> {
  if (!canTransitionSample(input.current, input.next)) {
    throw new Error(`Illegal sample transition: ${input.current} → ${input.next}`);
  }
  const patch: Record<string, unknown> = { status: input.next };
  const now = new Date().toISOString();
  if (input.next === "collected") patch.collected_at = now;
  if (input.next === "tested")    patch.tested_at = now;
  if (input.testResults)          patch.test_results = input.testResults;
  if (input.notes !== undefined)  patch.notes = input.notes;

  const { data, error } = await client.from("quality_samples")
    .update(patch)
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw error;
  return toSample(data);
}

// =====================================================================
// Bunker Feed QC — DB I/O
// =====================================================================

export async function fetchBunkerTests(profitCenterId: string): Promise<BunkerFeedTest[]> {
  const { data, error } = await client.from("bunker_feed_tests")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("tested_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map(toBunkerTest);
}

/**
 * Fetch the materials.specs jsonb for a single material so we can
 * evaluate observed values against the spec book. Read-only.
 */
export async function fetchMaterialSpecs(materialId: string): Promise<BunkerSpecMap> {
  const { data, error } = await client.from("materials")
    .select("specs")
    .eq("id", materialId)
    .maybeSingle();
  if (error) throw error;
  return specsFromMaterial(data?.specs);
}

export interface CreateBunkerTestInput {
  profitCenterId: string;
  createdBy: string;
  materialId: string;
  stockLocationId: string;
  mnPct?: number | null;
  fcPct?: number | null;
  moisturePct?: number | null;
  sizeRange?: string | null;
  validUntil?: string | null;
  notes?: string | null;
  /** Pre-fetched spec map. Use {} to skip evaluation. */
  specs: BunkerSpecMap;
}

export async function createBunkerTest(input: CreateBunkerTestInput): Promise<BunkerFeedTest> {
  const verdict = evaluateBunkerTest(
    { mnPct: input.mnPct ?? null, fcPct: input.fcPct ?? null, moisturePct: input.moisturePct ?? null },
    input.specs
  );

  const { data, error } = await client.from("bunker_feed_tests")
    .insert({
      profit_center_id: input.profitCenterId,
      created_by: input.createdBy,
      material_id: input.materialId,
      stock_location_id: input.stockLocationId,
      mn_pct: input.mnPct ?? null,
      fc_pct: input.fcPct ?? null,
      moisture_pct: input.moisturePct ?? null,
      size_range: input.sizeRange ?? null,
      valid_until: input.validUntil ?? null,
      notes: input.notes ?? null,
      result: verdict.result,
      deviations: verdict.deviations,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toBunkerTest(data);
}
