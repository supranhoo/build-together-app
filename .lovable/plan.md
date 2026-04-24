
## Phase 9 — Closing the Phase 8 Gaps + Light Forecasting

Phase 8 shipped, but three deferred items from its plan and one from earlier phases remain. Phase 9 closes those, plus introduces minimal forecasting groundwork explicitly mentioned in the Phase 7 "out of scope" list.

### What's Still Open from Prior Phases

From Phase 8 closeout:
1. **Bulk-select inside `KpiDetailDrawer` rows table** — single-row void/reverse works; multi-select inside the drawer was deferred.
2. **Drag-and-drop reordering UI for pinned KPIs** — `reorderPins` helper exists in `src/lib/reporting.ts`, but no UI consumes it.
3. **Pin sharing between users** — explicitly deferred to Phase 9.

From Phase 7 out-of-scope list:
4. **Forecasting / anomaly detection** — listed as Phase 9 work.

### Decisions Needed Before Build

1. **Drawer bulk-select** — add the same checkbox + bulk-action-bar pattern (matching `PortalInventoryLedger` / `PortalProduction`), or skip and rely on the outer pages?
   - **(a)** Add bulk-select inside the drawer (consistent UX everywhere drilldown rows appear).
   - **(b)** Skip — outer pages already cover bulk; drawer stays single-row.
   - **Default: (a)** — UX consistency outweighs the small implementation cost; the drawer is the only place where you can act on rows filtered by a KPI's exact source query.

2. **Pin reorder UX** — drag-and-drop, or up/down arrows on each pin?
   - **(a)** Drag-and-drop using `@dnd-kit/core` (a new dependency, ~30KB).
   - **(b)** Up/down arrow buttons on each pinned card (zero new deps, fully accessible without keyboard tricks).
   - **Default: (b)** — accessibility-first, no new dep, the helper `reorderPins(pins, pinId, targetIndex)` already supports both. (a) can be added later if users ask.

3. **Pin sharing scope** — what does "shared pin" mean?
   - **(a)** Workspace admins can publish a "shared pin set" that all workspace users see on their overview, in addition to their personal pins.
   - **(b)** Any user can mark one of their pins as "share with workspace" so others can subscribe.
   - **(c)** Skip pin sharing in Phase 9 — defer until users ask. Personal pins are already useful.
   - **Default: (c)** — skipping reduces scope and avoids governance ambiguity (whose pin set wins on conflicts? what's the cap when shared+personal combine?). Can revisit when there's user demand.

4. **Forecasting scope** — what's the minimum viable forecast?
   - **(a)** Simple linear trend on the last N days of a KPI's series, displayed as a dashed projection line on the existing chart in `KpiDetailDrawer`. No new tables, computed client-side.
   - **(b)** Server-side moving average + standard-deviation band, with anomaly badges on KPI cards when latest value is >2σ outside the rolling mean.
   - **(c)** Skip forecasting in Phase 9 — defer to a dedicated analytics phase with proper model evaluation.
   - **Default: (a)** — smallest possible vertical slice, zero schema changes, demonstrates value without committing to a model. (b) requires deciding window sizes, dealing with sparse data, and surfacing tunables to admins — all worth a dedicated phase.

Default recommendation if you say "use defaults": **1a, 2b, 3c, 4a**.

### Pre-Implementation Risk & Impact Report

Assuming defaults (1a, 2b, 3c, 4a):

- **Data Impact**: **None.** No schema changes, no new tables, no migrations. Reorder uses existing `kpi_pins.sort_order`. Forecast is client-side from existing series data.
- **Workflow Impact**:
  - Drawer rows table gains the same checkbox + bulk-action-bar pattern users already know from ledger/production pages.
  - Overview's pinned section gains up/down arrow buttons; reorder writes to existing `kpi_pins.sort_order`.
  - Drilldown chart gains an optional dashed projection line.
- **UI/UX Impact**:
  - `KpiDetailDrawer.tsx`: row checkboxes, bulk-action bar with shared-reason `AlertDialog`, and a "Show forecast" toggle on the chart panel.
  - `PortalOverview.tsx`: each pinned card gets two small icon buttons (↑, ↓), disabled at list boundaries.
- **Regression Risk**:
  - **Low** for drawer bulk-select — reuses existing `bulkVoidHeatLogs` / `bulkReverseInventoryLedger` RPCs. Permission gating reuses `userCanAct`.
  - **Low** for reorder — `reorderPins` is already unit-tested; only need to wire the optimistic update + persist call.
  - **Low** for forecast — pure client-side math on already-fetched series. If projection math fails, we hide the line instead of crashing the chart.
- **Mitigation**:
  - Tests for: drawer-bulk dispatch matches source type (heat_logs vs inventory_ledger), reorder persists correct `sort_order` for affected pins only, linear-trend helper returns `null` on series with <2 points.
  - Forecast disabled by default; user opts in via the toggle. No automatic visual change to existing charts.

### Implementation Steps → Verification

1. **`src/components/KpiDetailDrawer.tsx`**
   - Add row checkbox column (matches ledger/production pattern).
   - Add bulk-action bar above the table when ≥1 row selected: "Void N selected" or "Reverse N selected" depending on `drill.source`.
   - Reuse the existing `pending` / `reason` / `confirmAction` state machine; extend `PendingAction` with `bulk_void_heat_log` and `bulk_reverse_inventory` variants.
   → Tests: bulk dispatch picks the correct RPC per source; bar hidden when no permission.

2. **`src/lib/reporting.ts`**
   - Add `forecastLinear(series: KpiSeriesPoint[], horizonDays: number): KpiSeriesPoint[]` — pure helper, returns projected points or `[]` if series too short.
   → Tests: returns `[]` for empty/single-point series; correct slope on a known linear series; never produces NaN.

3. **`KpiDetailDrawer.tsx` chart panel**
   - Add a "Show forecast" toggle. When on, render projection points as a dashed line continuing the existing chart.
   - Use a 7-day horizon by default (matches the most common `7d` preset).
   → Tests: toggle off by default; toggled on, chart receives extra series with `dashed` style flag.

4. **`src/pages/PortalOverview.tsx`**
   - Each pinned card gains ↑/↓ icon buttons (disabled at boundaries).
   - On click: optimistically reorder local state via `reorderPins`, then persist new `sort_order` for the two swapped pins (single Supabase upsert with both rows).
   - On error: revert local state and show a toast.
   → Tests: optimistic state matches `reorderPins` output; revert on simulated failure.

5. **Docs + Policy + Tests** (SSOT lockstep — non-negotiable per project rules):
   - `DOCUMENTATION.md`: add Phase 9 section covering drawer bulk-select, pin reorder UX, client-side forecast helper. Note explicitly that forecast is **display-only** and **not persisted**.
   - `POLICY.md`: extend Pinned KPIs Governance with reorder semantics (personal preference, no admin override, no audit log — order is UX state, not regulated data). Add a Forecast Display Policy: forecasts are advisory, never used in compliance reporting, never written back to `kpi_definitions` or audited.
   - `src/test/example.test.tsx`: tests for `forecastLinear` (empty, single-point, linear, sparse), drawer bulk dispatch shape, and `reorderPins` persist ordering for adjacent swap.
   → Run full test suite to green.

### Out of Scope (deferred to future phases)

- **Pin sharing** (Phase 8 deferral; user can request a dedicated phase if needed — see decision 3c above).
- **Drag-and-drop reorder** (decision 2b chooses arrows; can be revisited).
- **Server-side anomaly detection** (decision 4b deferred to a dedicated analytics phase with proper model evaluation).
- **Configurable forecast horizon / model selection** — Phase 10 if forecasting proves valuable.
- **Forecast accuracy tracking** — would require persistence; deferred.

### Files to be Created/Modified

- **New**: none.
- **Modified**: `src/lib/reporting.ts`, `src/components/KpiDetailDrawer.tsx`, `src/pages/PortalOverview.tsx`, `DOCUMENTATION.md`, `POLICY.md`, `src/test/example.test.tsx`.

### Pushback / Watch-Outs

- **Forecast is a slippery slope.** A dashed line is harmless, but the moment users start making decisions on it, they'll ask for confidence intervals, model selection, and accuracy reports. The Phase 9 forecast is intentionally minimal and labeled as advisory. If you want anything more, we should plan a proper analytics phase rather than incrementally bolting features onto a linear-trend toy.
- **Pin sharing was deliberately skipped** (decision 3c). If you'd rather ship sharing now and skip forecasting, swap the scope: pick **3a or 3b** and **4c**. Don't try to do both in one phase — the governance work for shared pins (admin overrides, conflict resolution, cap interactions) is meaningful and shouldn't be rushed alongside forecasting.

**Please confirm the 4 decisions above (or say "use defaults") before I proceed.**
