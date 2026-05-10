# CLU Production Module — Staged Port

## Status
**PR1 + PR2 + PR3 + PR4 + PR5 complete (2026-05-10)** — schema/RLS/calc/persistence + page scaffold + 21-step heat-entry sheet with status transitions + AI analysis tab backed by `clu-heat-analysis` edge function (Lovable AI Gateway, `google/gemini-2.5-pro`), persisting `metadata.last_ai_analysis` + SOP master editor (admin) and delay log dialog wired into the dashboard.

## Goal

Bring CLU process management to `/portal/production/clu`, adapted to our stack (Supabase + RLS, useWorkspace, semantic tokens, Lovable AI Gateway). Source: 1825-line uploaded monolith using services we don't have (`geminiService`, `cluService`, `masterDataService`, `AppContext`) and raw Tailwind colors — full rewrite required.

## Staged Delivery

### PR1 — Schema + RLS + lib (DONE)
- Migration: 7 tables (`clu_sop_master`, `clu_heats`, `clu_blowing_data`, `clu_sampling`, `clu_additions`, `clu_output`, `clu_delays`) + RLS + `updated_at` triggers.
- `src/lib/clu-calc.ts` — pure `computeCluBalance` with parameterised `mnoToMnFactor`.
- `src/lib/clu-production.ts` — typed CRUD for all 7 tables.
- `src/test/clu-calc.test.ts` — 12 cases (happy path, zero-input, performance tag, factor override, multi-material).
- DOCUMENTATION.md + POLICY.md updated.

### PR2 — Page scaffold + read-only tabs (DONE)
- `src/pages/PortalProductionCLU.tsx` with Tabs (Dashboard, Planning, History, SOP Master).
- Profit-center guard via `useWorkspace`; empty states when no rows; no inline mocks.
- Route `/portal/production/clu` in `App.tsx`; conditional NavLink in `PortalShell.tsx` driven by `processProfile` containing "CLU".

### PR3 — Heat Entry lifecycle + transitions (DONE)
- `src/lib/clu-lifecycle.ts` defines the 21 named steps grouped into 9 phases (header / charge / blow / sample / tap / output / energy / delays / submit).
- `src/components/clu/CluHeatEntrySheet.tsx` renders a left step rail + right phase form (header, additions, blowing ticks, sampling, output + live Mn balance, energy, delays, submit review).
- `transitionHeat` enforces draft → pending_approval → approved/rejected → voided with reason validation; transitions are appended to `metadata.transitions` for audit. Approval/rejection/void buttons gated on `profile.role` (admin/super_admin).
- 7 new transition tests in `src/test/clu-production-actions.test.ts`.
- Approvals stay in CLU's own status field (decision recorded last 2026-05-09): integrating with `heat_log_approvals` would require a polymorphic refactor of finance/PortalHeatApprovals; deferred until plant-head signs off on a single queue.

### PR4 — AI Analysis tab (DONE)
- Edge function `supabase/functions/clu-heat-analysis/index.ts` calls Lovable AI Gateway (`google/gemini-2.5-pro`); JWT-validated, RLS-scoped reads & update, no service role.
- `runHeatAnalysis` helper in `src/lib/clu-production.ts` invokes via `supabase.functions.invoke`.
- AI Analysis tab in `PortalProductionCLU.tsx`: heat picker + Run analysis + summary panel; persists `metadata.last_ai_analysis` and shows "Last run" timestamp.
- 429 / 402 propagated as toast errors; rendered as plain markdown inside `<pre>` (no `react-markdown` dependency).

### PR5 — SOP master editor + Delay logging UI (DONE)
- `upsertSop` / `deleteSop` / `validateSopInput` added to `src/lib/clu-production.ts`. Validation rejects empty grade and inverted carbon ranges.
- `src/components/clu/CluSopEditDialog.tsx` — admin-only create/edit dialog (grade, carbon range, blowing/O₂/flux/temp targets, notes, active toggle).
- `src/components/clu/CluDelayLogDialog.tsx` — operator-facing delay capture (category, start/end, optional heat link, reason ≥3 chars). Server computes `duration_min`.
- `PortalProductionCLU.tsx`: "Add SOP" + per-row edit (admin only) on SOP tab; "Log delay" on dashboard's Recent Delays card.
- `src/test/clu-sop-validation.test.ts` — 5 cases for `validateSopInput`.

## Out of scope (deliberately dropped from upload)
- `react-markdown` import in component code (use existing helpers / plain `<pre>` until PR4)
- Raw color classes → semantic tokens
- `alert()` calls → `useToast`
- Inline mock arrays → empty states + real queries
- Hardcoded `mnoToMnFactor = 1.29` → `production.formulas` workspace setting
