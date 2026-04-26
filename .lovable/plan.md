# Quality Control Module — Plan (revised)

Build a Quality Control surface modeled on the uploaded `QualityControlModule.tsx`, adapted to this project's patterns (shadcn `Tabs`, semantic tokens, `useWorkspace`, Supabase RLS, SSOT). Same delivery model as Procurement: phased build, every code change ships with tests, `DOCUMENTATION.md` and `POLICY.md` updates in the same response.

## Change vs. previous plan

- **Removed**: "CLU Quality" tab (CLU is not part of the Ferro Alloys Division process).
- **Added**: **"Bunker Feed QC"** tab — pre-consumption test of ore and reductant items being fed from raw-material bunkers to the furnace. Purpose: every material actually consumed must have a test report verifying it meets scope/specification before it is charged.

## Scope (9 tabs)

1. **Dashboard & KPIs** — live aggregator
2. **Raw Material QC** — deep-link to GRN (incoming Mn%/Fe%/moisture already on `grn_logs`) + classification vs. spec
3. **Sampling Management** — sample plans, lot tracking, status workflow
4. **Bunker Feed QC** *(replaces CLU)* — per-bunker test of ore + reductant before charging; gates `material_consumption` against an approved test
5. **Furnace Quality** — deep-link to existing `PortalProductionQuality` (FG Mn%, slag MnO%, dust Mn% per heat — already live)
6. **Finished Goods QC** — batch-level FG inspection, pass/fail, certificate of analysis
7. **Dispatch Clearance** — release gate before shipment, requires FG pass
8. **Customer Complaints** — NCR / 8D workflow
9. **Compliance & Lab** — lab cert expiry, instrument calibration

## Bunker Feed QC — design detail

**Why it exists**: Incoming GRN tests prove what a supplier delivered, but material sitting in bunkers can degrade (moisture pickup, segregation, contamination). Before any ore or reductant is fed to the furnace, a fresh bunker sample must be tested against the workspace material spec (target Mn%, FC%, moisture max, size range stored in `materials.specs` JSON).

**New table — `bunker_feed_tests`** (workspace-scoped, RLS-gated, audit-logged)
- `id`, `profit_center_id`, `material_id`, `stock_location_id` (= bunker), `tested_at`
- `mn_pct`, `fc_pct`, `moisture_pct`, `size_range`, `extra_specs jsonb` (free-form for ash %, P %, S %, etc.)
- `result` enum `bunker_test_result` (`pass` / `conditional` / `fail`)
- `valid_until` (timestamp — beyond this, a fresh test is required)
- `notes`, `created_by`, `created_at`

**Spec source (zero-hardcoding §10)**: Targets and tolerances come from `materials.specs` and a new `profit_center_settings` key `quality.bunker_spec_tolerances` (e.g. moisture max +1%, Mn min −2%). No business numbers in code.

**Material-type filter**: Tab UI lists only materials whose `category` / `group_name` resolves to ore or reductant via the existing `production.material_groups` setting (same source PortalProductionFAD already uses). No hardcoded "SAF-1" / fixed material lists.

**Consumption gate (policy, not enforced in DB this phase)**:
- `POLICY.md` records: a `material_consumption` row for an ore/reductant material should reference an active `bunker_feed_tests` row (matching `material_id` + `stock_location_id`, `result IN ('pass','conditional')`, `valid_until >= now()`).
- Phase B ships a UI warning + dashboard counter "consumptions without active bunker test". A future phase can promote this to a hard DB trigger once historical data is clean.

**SSOT**: Bunker = `stock_locations` row. Materials = `materials`. Specs = `materials.specs` + workspace tolerances. No duplication.

## SSOT — what we reuse vs. what's new

**Reuse (deep-link, no duplication)**:
- Raw Material QC → `grn_logs` quality fields at `/portal/inventory/grn`
- Furnace Quality → `heat_metallurgy` at `/portal/production` quality tab
- KPI / Reports → central surfaces

**New tables (6)**: `quality_samples`, `bunker_feed_tests`, `fg_inspections`, `dispatch_clearances`, `quality_complaints`, `compliance_records`. New permission resource `quality` with actions `inspect`, `bunker_test`, `clear`, `complaint`, `compliance`.

## Routes & nav

- `/portal/quality` and `/admin/quality` — same component (SSOT), same fix pattern as Procurement (rendered inside `PortalShell` so plant sidebar stays visible).
- Admin sidebar entry "Quality Control" added to `src/components/AdminShell.tsx`.

## Phased delivery (mirrors Procurement)

**Phase A — Shell + schema**
- Migration: 6 tables + enums (`sample_status`, `inspection_result`, `complaint_status`, `dispatch_status`, `bunker_test_result`), RLS, audit triggers via existing `log_procurement_event` pattern, permission grants seed.
- New page `src/pages/AdminQuality.tsx` — 9-tab shell (shadcn `Tabs`, semantic tokens only).
- Routes registered, sidebar entry added.
- Tests: `src/test/quality-phase-a.test.ts` (route audit, tab list, RLS smoke).

**Phase B — Sampling + Bunker Feed QC** ✅ done 2026-04-26
- `src/components/quality/SamplingTab.tsx`, `src/components/quality/BunkerFeedQCTab.tsx`.
- `src/lib/quality.ts` service layer — `canTransitionSample`, `evaluateBunkerTest(observed, specs) → { result, deviations[] }`, `specsFromMaterial`, plus DB I/O wrappers.
- Raw Material QC and Furnace Quality remain SSOT deep-links (no duplicate UI built).
- Tests: `src/test/quality-phase-b.test.ts` — 13 cases covering lifecycle + verdict ladder + AdminQuality wiring. 245/245 suite green.

**Phase C — FG + Dispatch** ✅ done 2026-04-26
- `src/components/quality/FinishedGoodsTab.tsx` — create + score (pending rows scoreable; non-pending immutable per RLS).
- `src/components/quality/DispatchClearanceTab.tsx` — create + status transitions through `checkDispatchGate`.
- `src/lib/quality.ts` adds `evaluateFgInspection`, `createFgInspection`, `scoreFgInspection`, `canTransitionDispatch`, `nextDispatchStatuses`, `checkDispatchGate`, `createDispatchClearance`, `transitionDispatch`.
- Tests: `src/test/quality-phase-c.test.ts` — 16 cases. 261/261 suite green.

**Phase D — Complaints + Compliance + Dashboard** ✅ done 2026-04-26
- `ComplaintsTab.tsx` — 8D lifecycle (`open → investigating → corrective_action → closed`); closing requires root cause + corrective action.
- `ComplianceTab.tsx` — cert/calibration registry with `bucketComplianceExpiry` (`expired`/`due_soon`/`ok`/`no_expiry`, 30-day window).
- `QCDashboardTab.tsx` — read-only aggregator backed by pure `buildQualityKpis` (SSOT, no I/O).
- Service additions in `src/lib/quality.ts`: complaint gate, compliance bucketer, KPI aggregator (all pure).
- Note: "Consumptions without active bunker test" counter is deferred — current Bunker QC rows do not yet carry a heat-link, so the counter would be misleading. Tracked as a follow-up once `material_consumption` carries an explicit bunker-test reference.
- Tests: `src/test/quality-phase-d.test.ts` — 14 cases. 275/275 suite green.

## Risk & Impact (per project knowledge §9)

- **Data**: Additive only — 6 new tables, 5 enums, 1 new permission resource. No existing tables touched.
- **Workflow**: New role actions default to denied; admin grants. Bunker test consumption gate is policy + UI warning in Phase B (not a hard DB trigger), to avoid blocking historical workflows.
- **UI/UX**: Renders inside `PortalShell` (sidebar visible). Semantic tokens only.
- **Regression**: Low. Raw Material and Furnace tabs deep-link rather than duplicate. Existing GRN entry, `PortalProductionQuality`, `material_consumption` writes unchanged.
- **Mitigation**: Per-phase unit tests; full suite must stay green. Append-only RLS on inspection tables.

## Out of scope (call out, don't build)

- Hard DB trigger blocking consumption without active bunker test (deferred until historical data verified clean).
- Lab instrument auto-import (manual entry only).
- Auto-rendered Certificate of Analysis PDFs (data captured; rendering deferred).
- CLU module (explicitly excluded — not part of Ferro Alloys Division).

## Confirm before I start

On approval, I'll begin with **Phase A** (schema + shell + routes + admin sidebar + tests + DOCUMENTATION/POLICY updates), then wait for "go Phase B" etc. — same cadence as Procurement.
