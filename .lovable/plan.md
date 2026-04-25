# Production Entry – FAD (separate module)

Build the uploaded `ProductionEntryFAD.tsx` as a **new, standalone route** at `/portal/production-fad`. The existing `/portal/production` dialog stays untouched.

## What the user gets

A new sidebar/menu item **"Production Entry – FAD"** opening a full-page screen with the exact layout from the upload:

- **Header**: title + active profit center badge.
- **Top tab bar** (4 tabs): Data Entry & Preview · Heat-wise Results · Furnace Summary · Monthly Summary.
- **Data Entry & Preview** (2-col grid):
  - Left (2/3): Heat Details card → Power card → 4-step inner tab (Mn Ore · Reductant · Fluxes/Paste · Output) with the exact tables and inline formulas (dry qty, Mn input, FC input, etc.).
  - Right (1/3): sticky **Live Mn Balance** card showing Mn in/out, recovery %, slag/dust loss %, FC/MT, fuel mix bar, paste Kg/MT, balance check %, plus **Save Draft** and **Submit to Plant Head** buttons.
- **Heat-wise / Furnace / Monthly** tabs: read-only roll-ups computed from the data we just stored.

UI styling, spacing, colors, badges, alert thresholds (red <70 % recovery, amber moisture, etc.) match the upload exactly.

## Data model — no schema changes

Reuse existing tables (zero migrations):

- `heat_logs` — one row per heat (heat_number, furnace, shift, tap_time, weight_mt, power_mwh, notes).
- `material_consumption` (+ auto `inventory_ledger` via existing trigger) — one row per Mn-ore / reductant / flux / paste line.
- `heat_metallurgy` — product, grade, tapping/batch no, FG Mn %, slag qty/MnO %, dust qty/Mn %, power split, status (`draft` / `submitted`).
- `materials` — used to populate Mn-ore, reductant, flux, paste pickers + default Mn %, FC %, moisture from `specs` JSON.
- `furnaces`, `shifts` — pickers (no SAF-1/SAF-2 hardcoding).
- `profit_center_settings.setting_key = 'production.alerts'` — recovery / FC-per-MT / moisture / slag-MnO thresholds (already wired via `fetchProductionAlertThresholds`).
- `profit_center_settings.setting_key = 'production.formulas'` *(new key, no schema change — JSON in existing settings table)* — overrides for `metalMn`, `slagMn`, `dustMn`, `mnRecovery`, `slagLoss`, `dustLoss`, `diffusionLoss`, `mnoToMnFactor`, `fgMnDefault`, `slagMnoDefault`, `dustMnDefault`. Falls back to authoritative defaults from `src/lib/ferro-alloys.ts`.

## Routing & nav

- `src/App.tsx` — add `<Route path="production-fad" element={<PortalProductionFAD />} />` under the `/portal` shell.
- Sidebar: add "Production Entry – FAD" item next to "Production".

## New / modified files

**New**
- `src/pages/PortalProductionFAD.tsx` — the page (mirrors uploaded structure but uses `useWorkspace`, `useAuth`, shadcn imports, Supabase services).
- `src/lib/production-formulas.ts` — fetch + evaluate workspace formula overrides; default values come from `ferro-alloys.ts` (no hardcoded business numbers in the page).
- `src/lib/production-entry-fad.ts` — orchestrates one atomic submit:
  1. `createHeatLog(...)`
  2. for each Mn-ore / reductant / flux / paste line → `recordHeatConsumption(...)` (writes `material_consumption` + ledger via trigger)
  3. `upsertMetallurgy(...)` with status `draft` or `submitted`
  4. on partial failure: surface error, do not silently swallow.
- `src/test/production-entry-fad.test.ts` — unit tests for the orchestrator + Mn balance & FC-per-MT calculations against the existing `mnBalance` helper.

**Modified**
- `src/App.tsx` — register route.
- `src/components/PortalShell.tsx` (or wherever portal nav lives) — add menu entry.
- `DOCUMENTATION.md` + `POLICY.md` — Phase 18 entry: new route, formula-override key, draft → submitted workflow, audit via existing `heat_log_events` trigger.

**Untouched**
- `src/pages/PortalProduction.tsx` and the dialog flow (per user instruction "do not add in production").

## Behavior details

- **Heat number**: auto-suggest `H-YYYYMMDD-NN` from same-day count for selected furnace; user can edit; duplicates blocked client-side and by future server check.
- **Material pickers**: pulled from `materials` filtered by `group_name` mapped in workspace settings (`production.material_groups` JSON: `{ ore: ['Mn Ore'], reductant: ['Reductant'], flux: ['Flux'], paste: ['Paste'] }`). Falls back to category text match.
- **Live calculations**: use existing `mnBalance` from `src/lib/ferro-alloys.ts` so numbers match the rest of the app.
- **Submit to Plant Head** = `heat_metallurgy.status = 'submitted'` (immutable per existing RLS).
- **Save Draft** = `status = 'draft'` (editable per existing RLS).
- **Heat-wise / Furnace / Monthly tabs** inside this page query `heat_logs` + `heat_metallurgy` + `material_consumption` for the active workspace and aggregate client-side, mirroring the upload's columns. Excel export via existing `exportRows`.
- **Real-time**: Supabase channel on `heat_logs` & `heat_metallurgy` filtered by `profit_center_id` to refresh the right-hand reports tabs.
- **Audit trail**: already covered by `log_heat_log_event` trigger; metallurgy status changes go to `audit_logs` from the orchestrator.

## Risk & impact

- **Data**: no schema changes. New rows only. SSOT preserved (inventory still flows through `material_consumption` → ledger).
- **Workflow**: parallel to existing dialog. Both flows write to the same tables, so Heat-wise / Furnace / Monthly views in *both* pages stay consistent.
- **UI**: net-new page; existing `/portal/production` UI unchanged.
- **Regression**: low — orchestrator is additive; failures during multi-row insert surfaced with clear toast; partial-write cleanup left to a follow-up only if user requests transactional rollback.

## Out of scope (call out, don't build)

- Server-side duplicate-heat enforcement (currently client-side + DB unique would need migration).
- Approval workflow beyond `draft` → `submitted` (e.g., reviewer signoff, rejection reasons).
- Mobile-specific layout polish beyond the responsive grid the upload already uses.
