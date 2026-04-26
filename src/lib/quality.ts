/**
 * Quality Control service layer (Phases B + C).
 *
 * Phase B — already shipped:
 *  - Sampling Management: lifecycle for `quality_samples`
 *      planned → collected → tested → released | rejected
 *  - Bunker Feed QC: `bunker_feed_tests` with `evaluateBunkerTest`
 *      verdict ladder (pass | conditional | fail) sourced from
 *      `materials.specs`.
 *
 * Phase C — added in this file:
 *  - Finished Goods Inspection: `fg_inspections` with
 *      `evaluateFgInspection` ladder (pass | conditional | fail)
 *      computed from observed FG chemistry vs caller-provided spec.
 *      Result is stored on the row; only `pending` rows can be edited
 *      (DB RLS enforces this — the JS layer mirrors the rule).
 *  - Dispatch Clearance: `dispatch_clearances` with the release-gate
 *      transition table  pending → cleared | held | rejected.
 *      A `cleared` clearance REQUIRES a linked FG inspection that
 *      itself passed (or was cleared as conditional with a reason).
 *
 * Pure-vs-IO split:
 *  - All evaluation/transition rules are pure functions (testable, no DB).
 *  - DB calls are thin wrappers that translate snake_case ↔ camelCase
 *    and rely on the RLS + audit triggers shipped in Phase A.
 *
 * No business value is hardcoded — material specs come from
 * `materials.specs`; FG specs are passed in by the caller (sourced
 * from product master in a future phase, see DOCUMENTATION.md).
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

// =====================================================================
// Phase C — Finished Goods Inspection
// =====================================================================

export type InspectionResult = "pending" | "pass" | "conditional" | "fail";

export interface FgInspection {
  id: string;
  profitCenterId: string;
  inspectionNo: string;
  batchNo: string | null;
  product: string | null;
  grade: string | null;
  heatLogId: string | null;
  inspectedAt: string;
  fgMnPct: number | null;
  fgSiPct: number | null;
  fgCPct: number | null;
  fgPPct: number | null;
  fgSPct: number | null;
  sizeRange: string | null;
  extraSpecs: Record<string, unknown>;
  result: InspectionResult;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * FG spec map. Same shape as BunkerSpecMap but covers FG chemistry.
 * Sourced from product/grade master in a future phase; for now the
 * caller (UI) supplies it explicitly.
 */
export type FgSpecMap = Partial<Record<
  "fgMnPct" | "fgSiPct" | "fgCPct" | "fgPPct" | "fgSPct",
  FieldSpec
>>;

export interface FgDeviation {
  field: string;
  observed: number | null;
  expectedMin?: number | null;
  expectedMax?: number | null;
  severity: "minor" | "major";
}

/**
 * Pure ladder for FG inspections. Identical rules to bunker tests
 * (single-source ladder documented in POLICY.md §Quality Verdict Ladder)
 * applied to FG fields. Returns `pending` ONLY if no fields are spec'd
 * AND no observations were given — caller can decide whether to surface.
 */
export function evaluateFgInspection(
  observed: Partial<Record<keyof FgSpecMap, number | null>>,
  specs: FgSpecMap
): { result: Exclude<InspectionResult, "pending">; deviations: FgDeviation[] } {
  const fields: Array<keyof FgSpecMap> = ["fgMnPct", "fgSiPct", "fgCPct", "fgPPct", "fgSPct"];
  const deviations: FgDeviation[] = [];
  let worst: Exclude<InspectionResult, "pending"> = "pass";

  for (const field of fields) {
    const spec = specs[field];
    if (!spec) continue;
    const value = observed[field] ?? null;

    if (value === null || value === undefined || Number.isNaN(value)) {
      deviations.push({
        field, observed: null,
        expectedMin: spec.min ?? null, expectedMax: spec.max ?? null,
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

function toFgInspection(row: any): FgInspection {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    inspectionNo: row.inspection_no,
    batchNo: row.batch_no ?? null,
    product: row.product ?? null,
    grade: row.grade ?? null,
    heatLogId: row.heat_log_id ?? null,
    inspectedAt: row.inspected_at,
    fgMnPct: row.fg_mn_pct ?? null,
    fgSiPct: row.fg_si_pct ?? null,
    fgCPct: row.fg_c_pct ?? null,
    fgPPct: row.fg_p_pct ?? null,
    fgSPct: row.fg_s_pct ?? null,
    sizeRange: row.size_range ?? null,
    extraSpecs: row.extra_specs ?? {},
    result: row.result,
    notes: row.notes ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchFgInspections(profitCenterId: string): Promise<FgInspection[]> {
  const { data, error } = await client.from("fg_inspections")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("inspected_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map(toFgInspection);
}

export interface CreateFgInspectionInput {
  profitCenterId: string;
  createdBy: string;
  inspectionNo: string;
  batchNo?: string | null;
  product?: string | null;
  grade?: string | null;
  heatLogId?: string | null;
  fgMnPct?: number | null;
  fgSiPct?: number | null;
  fgCPct?: number | null;
  fgPPct?: number | null;
  fgSPct?: number | null;
  sizeRange?: string | null;
  notes?: string | null;
  /** Provide {} to defer scoring (row stays pending). */
  specs: FgSpecMap;
}

export async function createFgInspection(input: CreateFgInspectionInput): Promise<FgInspection> {
  const hasSpecs = Object.keys(input.specs).length > 0;
  const observed = {
    fgMnPct: input.fgMnPct ?? null,
    fgSiPct: input.fgSiPct ?? null,
    fgCPct:  input.fgCPct  ?? null,
    fgPPct:  input.fgPPct  ?? null,
    fgSPct:  input.fgSPct  ?? null,
  };
  const result: InspectionResult = hasSpecs ? evaluateFgInspection(observed, input.specs).result : "pending";

  const { data, error } = await client.from("fg_inspections")
    .insert({
      profit_center_id: input.profitCenterId,
      created_by: input.createdBy,
      inspection_no: input.inspectionNo,
      batch_no: input.batchNo ?? null,
      product: input.product ?? null,
      grade: input.grade ?? null,
      heat_log_id: input.heatLogId ?? null,
      fg_mn_pct: input.fgMnPct ?? null,
      fg_si_pct: input.fgSiPct ?? null,
      fg_c_pct:  input.fgCPct  ?? null,
      fg_p_pct:  input.fgPPct  ?? null,
      fg_s_pct:  input.fgSPct  ?? null,
      size_range: input.sizeRange ?? null,
      notes: input.notes ?? null,
      result,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toFgInspection(data);
}

export interface ScoreFgInspectionInput {
  id: string;
  current: InspectionResult;
  observed: Partial<Record<keyof FgSpecMap, number | null>>;
  specs: FgSpecMap;
  notes?: string | null;
}

/**
 * Apply the verdict ladder to a pending FG inspection and persist the
 * computed result. Mirrors the RLS rule: only `pending` rows are
 * editable. The DB will still reject non-pending updates — this guard
 * prevents the round-trip.
 */
export async function scoreFgInspection(input: ScoreFgInspectionInput): Promise<FgInspection> {
  if (input.current !== "pending") {
    throw new Error("FG inspection already scored — cannot rescore.");
  }
  const verdict = evaluateFgInspection(input.observed, input.specs);
  const patch: Record<string, unknown> = {
    result: verdict.result,
    fg_mn_pct: input.observed.fgMnPct ?? null,
    fg_si_pct: input.observed.fgSiPct ?? null,
    fg_c_pct:  input.observed.fgCPct  ?? null,
    fg_p_pct:  input.observed.fgPPct  ?? null,
    fg_s_pct:  input.observed.fgSPct  ?? null,
  };
  if (input.notes !== undefined) patch.notes = input.notes;

  const { data, error } = await client.from("fg_inspections")
    .update(patch)
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw error;
  return toFgInspection(data);
}

// =====================================================================
// Phase C — Dispatch Clearance (release gate)
// =====================================================================

export type DispatchStatus = "pending" | "cleared" | "held" | "rejected";

export interface DispatchClearance {
  id: string;
  profitCenterId: string;
  clearanceNo: string;
  fgInspectionId: string | null;
  customer: string | null;
  vehicleNo: string | null;
  status: DispatchStatus;
  clearedAt: string | null;
  clearedBy: string | null;
  holdReason: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const DISPATCH_TRANSITIONS: Record<DispatchStatus, DispatchStatus[]> = {
  pending:  ["cleared", "held", "rejected"],
  held:     ["cleared", "rejected"], // operator can resolve a hold
  cleared:  [], // terminal — once material leaves the gate it cannot be uncleared
  rejected: [], // terminal
};

export function canTransitionDispatch(from: DispatchStatus, to: DispatchStatus): boolean {
  return DISPATCH_TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextDispatchStatuses(from: DispatchStatus): DispatchStatus[] {
  return [...(DISPATCH_TRANSITIONS[from] ?? [])];
}

/**
 * Pure release-gate guard. A dispatch can only be `cleared` when:
 *   1. The transition itself is legal (pending|held → cleared), AND
 *   2. A linked FG inspection exists, AND
 *   3. That inspection's result is `pass` (strict) OR `conditional`
 *      with a non-empty hold_reason supplied as the override note.
 * `fail` and `pending` block clearance regardless.
 *
 * For `held` and `rejected` transitions a `holdReason` is required so
 * the audit trail explains why material was stopped.
 */
export interface DispatchGateInput {
  current: DispatchStatus;
  next: DispatchStatus;
  inspection: { id: string; result: InspectionResult } | null;
  holdReason?: string | null;
}

export interface DispatchGateResult {
  ok: boolean;
  reason?: string;
}

export function checkDispatchGate(input: DispatchGateInput): DispatchGateResult {
  if (!canTransitionDispatch(input.current, input.next)) {
    return { ok: false, reason: `Illegal transition: ${input.current} → ${input.next}` };
  }
  if (input.next === "cleared") {
    if (!input.inspection) {
      return { ok: false, reason: "Linked FG inspection required to clear dispatch." };
    }
    if (input.inspection.result === "fail") {
      return { ok: false, reason: "FG inspection failed — clearance refused." };
    }
    if (input.inspection.result === "pending") {
      return { ok: false, reason: "FG inspection not yet scored." };
    }
    if (input.inspection.result === "conditional"
        && (!input.holdReason || input.holdReason.trim().length < 3)) {
      return { ok: false, reason: "Conditional FG result requires an override reason." };
    }
  }
  if ((input.next === "held" || input.next === "rejected")
      && (!input.holdReason || input.holdReason.trim().length < 3)) {
    return { ok: false, reason: "A reason (≥3 chars) is required to hold or reject dispatch." };
  }
  return { ok: true };
}

function toDispatch(row: any): DispatchClearance {
  return {
    id: row.id,
    profitCenterId: row.profit_center_id,
    clearanceNo: row.clearance_no,
    fgInspectionId: row.fg_inspection_id ?? null,
    customer: row.customer ?? null,
    vehicleNo: row.vehicle_no ?? null,
    status: row.status,
    clearedAt: row.cleared_at ?? null,
    clearedBy: row.cleared_by ?? null,
    holdReason: row.hold_reason ?? null,
    notes: row.notes ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchDispatchClearances(profitCenterId: string): Promise<DispatchClearance[]> {
  const { data, error } = await client.from("dispatch_clearances")
    .select("*")
    .eq("profit_center_id", profitCenterId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map(toDispatch);
}

export interface CreateDispatchInput {
  profitCenterId: string;
  createdBy: string;
  clearanceNo: string;
  fgInspectionId?: string | null;
  customer?: string | null;
  vehicleNo?: string | null;
  notes?: string | null;
}

export async function createDispatchClearance(input: CreateDispatchInput): Promise<DispatchClearance> {
  const { data, error } = await client.from("dispatch_clearances")
    .insert({
      profit_center_id: input.profitCenterId,
      created_by: input.createdBy,
      clearance_no: input.clearanceNo,
      fg_inspection_id: input.fgInspectionId ?? null,
      customer: input.customer ?? null,
      vehicle_no: input.vehicleNo ?? null,
      notes: input.notes ?? null,
      status: "pending",
    })
    .select("*")
    .single();
  if (error) throw error;
  return toDispatch(data);
}

export interface TransitionDispatchInput {
  id: string;
  current: DispatchStatus;
  next: DispatchStatus;
  clearedBy?: string | null;
  inspection: { id: string; result: InspectionResult } | null;
  holdReason?: string | null;
  notes?: string | null;
}

export async function transitionDispatch(input: TransitionDispatchInput): Promise<DispatchClearance> {
  const gate = checkDispatchGate({
    current: input.current,
    next: input.next,
    inspection: input.inspection,
    holdReason: input.holdReason ?? null,
  });
  if (!gate.ok) throw new Error(gate.reason ?? "Dispatch transition refused.");

  const patch: Record<string, unknown> = { status: input.next };
  if (input.next === "cleared") {
    patch.cleared_at = new Date().toISOString();
    patch.cleared_by = input.clearedBy ?? null;
    patch.hold_reason = input.holdReason ?? null;
  } else if (input.next === "held" || input.next === "rejected") {
    patch.hold_reason = input.holdReason ?? null;
  }
  if (input.notes !== undefined) patch.notes = input.notes;

  const { data, error } = await client.from("dispatch_clearances")
    .update(patch)
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw error;
  return toDispatch(data);
}
