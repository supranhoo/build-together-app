# CLU Production Module — Staged Port

## Status
**PR1 + PR2 + PR3 complete (2026-05-09)** — schema + RLS + pure calc + persistence lib + 19 passing tests + page scaffold + 21-step heat-entry sheet with status transitions (draft → pending_approval → approved/rejected → voided) wired into the page (New heat button + clickable rows).

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

### PR3 — Heat Entry lifecycle + Quality QC + Energy + Downtime
- 21-step left rail, step-specific forms, live Mn balance preview.
- Save as `draft` / `pending_approval`; integrates with `heat_log_approvals` via polymorphic `entity_type='clu_heat'`.
- `src/test/clu-production.test.ts` for persistence helpers.

### PR4 — AI Analysis tab
- Edge function `clu-heat-analysis` via Lovable AI Gateway (`google/gemini-2.5-pro`). No external API key.
- Persists last analysis on `clu_heats.metadata.last_ai_analysis`.
- Auto-Capture toggle is UI-only / demo (flagged in DOCUMENTATION.md).

## Out of scope (deliberately dropped from upload)
- `react-markdown` import in component code (use existing helpers / plain `<pre>` until PR4)
- Raw color classes → semantic tokens
- `alert()` calls → `useToast`
- Inline mock arrays → empty states + real queries
- Hardcoded `mnoToMnFactor = 1.29` → `production.formulas` workspace setting
