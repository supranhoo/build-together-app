# Goal

Bring CLU process management to our app at `/portal/production/clu`, adapted to our stack (Supabase + RLS, useWorkspace, semantic tokens, Lovable AI Gateway). The uploaded file is a 1825-line monolith with mocks, raw Tailwind colors, and three external services we don't have (`geminiService`, `cluService`, `masterDataService` / `productionService`, `AppContext`). It cannot be dropped in as-is.

# Pre-Implementation Risk & Impact Report

**Data impact** — 7 new tables (`clu_heats`, `clu_blowing_data`, `clu_sampling`, `clu_additions`, `clu_output`, `clu_delays`, `clu_sop_master`) all `profit_center_id`-scoped. No changes to existing `heat_logs` / `material_consumption`. CLU heats are intentionally separate from the FAD `heat_logs` model because the lifecycle (21 process steps, blowing curves, sampling) doesn't fit the existing schema.

**Workflow impact** — New page only; no existing route changes. CLU PCs gain the new page; FAD PCs see the same nav entry but it's gated to PCs whose code/type indicates CLU (mirrors how FAD page is wired today).

**UI/UX impact** — Reuses `PortalShell`, semantic tokens, our shadcn components. The uploaded file's hardcoded `#5b51d8`, `bg-indigo-50`, `text-orange-600` etc. are rewritten to design tokens — no raw colors land in the codebase.

**Regression risk** — Low. New tables, new page, new lib file, new edge function. Only existing files touched: `App.tsx` (one route), `PortalShell.tsx` (one NavLink), `DOCUMENTATION.md` and `POLICY.md`. Migration is additive only.

**Mitigation** — RLS on every new table (mirrors `heat_logs` pattern using `has_profit_center_access` / `user_can_act`). Unit tests for the calc layer (Mn balance, recovery %, performance tag). Mock data is realistic, policy-aligned, never hardcoded inside components.

# Staged Delivery (4 PRs, each independently reviewable)

**PR 1 — Schema + RLS + lib (no UI)**
- Migration: 7 tables + RLS policies + `updated_at` triggers + an audit trigger on `clu_heats`.
- `src/lib/clu-production.ts`: types, mappers, CRUD (`fetchHeats`, `upsertHeat`, `addBlowingTick`, `addSampling`, `addAddition`, `saveOutput`, `logDelay`, `fetchSopMaster`).
- `src/lib/clu-calc.ts`: pure functions for Mn balance, recoveries, performance tag (extracted from the uploaded `useMemo`). Uses `mnoToMnFactor` from existing `production.formulas` setting — **no hardcoded 1.29**.
- Tests: `src/test/clu-calc.test.ts` (happy path + zero-input + over-100% balance edge cases).

**PR 2 — Page scaffold + tabs (Dashboard, Planning, History, SOP Master)**
- `src/pages/PortalProductionCLU.tsx` skeleton with `Tabs`, header, profit-center guard via `useWorkspace`.
- Read-only tabs first, fed by `clu-production.ts`. No mock data inside the component — empty states when no rows.
- Route in `App.tsx`, NavLink in `PortalShell.tsx`.

**PR 3 — Heat Entry (21-step lifecycle) + Quality QC + Energy + Downtime tabs**
- Left rail = lifecycle steps, middle = step-specific form, right = live Mn/Si balance preview (reuses the FAD balance pattern we already have).
- Step forms write to `clu_heats` / `clu_blowing_data` / `clu_sampling` / `clu_additions` / `clu_output` / `clu_delays`.
- Save as `draft` or `pending_approval` (matches existing heat-log status vocabulary).
- Tests: `src/test/clu-production.test.ts` for the persistence helpers (mocked supabase client, mirrors `master-data.test.ts` style).

**PR 4 — AI Analysis tab via Lovable AI Gateway**
- New edge function `clu-heat-analysis` calling `google/gemini-2.5-pro` through the Lovable AI Gateway (no external API key needed). Replaces the uploaded `geminiService` call.
- Tab streams a markdown response and persists the last analysis on the heat row (`metadata.last_ai_analysis`).
- Auto-Capture toggle is included as UI-only state for now (the simulated sensor stream stays mock until you wire real telemetry); flagged clearly in DOCUMENTATION.md as "demo-only".

# Things from the uploaded file I am explicitly dropping

- `react-markdown` import in component code → render via the existing markdown helper or plain `<pre>` until PR4.
- Raw color classes (`text-orange-600`, `#5b51d8`, etc.) → semantic tokens (`text-primary`, `bg-accent`, etc.) defined in `index.css`.
- `alert()` calls → existing `useToast`.
- Inline mock arrays (`recoveryTrend`, `bestHeat`, `carbonTrendData`) → fed from real queries in PR2/3; show empty-state if no data.
- The hardcoded `mnoToMnFactor = 1.29` fallback → read from `production.formulas` setting we already have.

# Documentation & Policy (every PR)

Each PR updates `DOCUMENTATION.md` (new module, table list, RLS summary, version history entry) and `POLICY.md` (CLU heat lifecycle states, who can save draft vs request approval, AI analysis usage policy).

# Open question before PR1

Should CLU heats integrate with the existing **`heat_logs` approvals workflow** (so plant-head approval flows through one queue), or stay in their own approvals queue? My recommendation: **integrate** — write a row in `heat_log_approvals` referencing the CLU heat by polymorphic `entity_type='clu_heat'`. Confirm or override before I write PR1.
