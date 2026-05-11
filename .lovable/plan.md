# CLU Production Module — Staged Port

## Status
**PR1–PR6 complete (2026-05-11)** — schema/RLS/calc/persistence + page scaffold + 21-step heat-entry sheet + AI analysis + SOP/delay editors + **polymorphic approvals queue** unifying EAF and CLU heats under `/portal/heat-approvals` via the read-only view `production_approvals_v`.

## Goal
Bring CLU process management to `/portal/production/clu`, adapted to our stack (Supabase + RLS, useWorkspace, semantic tokens, Lovable AI Gateway).

## Delivered

### PR1 — Schema + RLS + lib (DONE)
7 tables, RLS, `update_updated_at_column` triggers, `clu-calc.ts` (12 tests), `clu-production.ts` typed CRUD.

### PR2 — Page scaffold (DONE)
`PortalProductionCLU.tsx`, route, NavLink driven by `processProfile` containing "CLU".

### PR3 — Heat Entry lifecycle (DONE)
`clu-lifecycle.ts` (21 steps, 9 phases), `CluHeatEntrySheet.tsx`, `transitionHeat` workflow with audit trail in `metadata.transitions`, 7 transition tests.

### PR4 — AI Analysis tab (DONE)
Edge function `clu-heat-analysis` (Lovable AI Gateway, `google/gemini-2.5-pro`), `runHeatAnalysis` helper, summary panel persisting `metadata.last_ai_analysis`.

### PR5 — SOP master + Delay logging (DONE)
`upsertSop` / `deleteSop` / `validateSopInput`, `CluSopEditDialog`, `CluDelayLogDialog`, 5 validation tests.

### PR6 — Polymorphic approvals (DONE)
- DB: read-only view `public.production_approvals_v` (security_invoker) UNIONing `heat_log_approvals` + `clu_heats` (status ≠ draft) under one normalized shape (`source`, `entity_id`, `status`, `submitted_at`, `decided_at`, `notes`). No data migration; existing finance.ts code untouched.
- Lib: `src/lib/production-approvals.ts` exposes `fetchProductionApprovals(pc, {source, status})` + `summariseApprovals` helper.
- UI: `PortalHeatApprovals` adds a "CLU Heats" card listing CLU rows from the view; Approve / Reject buttons call existing `transitionHeat` (which already updates `clu_heats.status` + appends to `metadata.transitions`). EAF behaviour unchanged.
- Tests: `src/test/production-approvals.test.ts` (6 cases) + existing CLU/finance suites still green.

#### Deviation from approved plan
The approved plan proposed a new `production_approvals` physical table + `heat_log_approvals` view-shim. That would have required INSTEAD-OF triggers to keep `submitHeatForApproval`/`decideHeatApproval` working on the shim. Per the "Simplicity first" + "Surgical changes only" rules, we shipped the simpler equivalent: a UNION view that delivers the unified queue without touching either source table or any existing call site. Consequence: there is no central writable approvals table, but every consumer the user actually has today reads through the same view, so the user-visible behaviour matches the plan goal. If/when a non-production entity (PR, sales order) needs approvals, we can extend the view or graduate to the table.

## Out of scope (deliberately dropped from upload)
- `react-markdown` import in component code
- Raw color classes → semantic tokens
- `alert()` calls → `useToast`
- Hardcoded `mnoToMnFactor = 1.29` → workspace setting
