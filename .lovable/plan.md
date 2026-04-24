
## Phase 8 — Operational Polish: Inventory Reversals UI, Bulk Actions & Custom Dashboards

Phase 7 closeout is complete (docs + policy + tests in lockstep). The `reverse_inventory_ledger` RPC exists but has no UI surface, and bulk void/reverse + custom dashboards were explicitly deferred from Phase 7. Phase 8 closes those gaps.

### Decisions Needed Before Build

1. **Inventory reversal UI surface** — where should the "Reverse" row action live?
   - **(a)** `PortalInventoryLedger` row action menu (matches the heat-log void pattern in `KpiDetailDrawer`).
   - **(b)** Both the ledger page AND the KPI drilldown drawer (when drilldown source is `inventory_ledger`).
   - **Default: (b)** — consistency with heat log void, which is reachable from both production page and drilldown.

2. **Bulk actions scope** — which operations should support multi-select?
   - **(a)** Void heat logs only.
   - **(b)** Void heat logs + reverse inventory ledger entries.
   - **(c)** Skip bulk for now; ship single-row only.
   - **Default: (b)** — both share the same permission/reason pattern, marginal extra cost.

3. **Bulk reason model** — one shared reason for the whole batch, or per-row reason?
   - **(a)** One reason applied to all selected rows (faster, matches typical "month-end correction" use case).
   - **(b)** Per-row reason (slower, more auditable).
   - **Default: (a)** — single reason; the audit log still records each row individually with that reason, plus a `batch_id` to group them.

4. **Custom dashboards scope** — full drag-and-drop widget builder, or pinned-KPI list per user?
   - **(a)** Pinned KPI list: each user picks 1–N KPIs to surface on `/portal/overview`, ordered by pin order.
   - **(b)** Full drag-and-drop dashboard with grid layout, multiple widget types (KPI card, chart, table).
   - **Default: (a)** — pinned list. Delivers 80% of the value at 20% of the cost; (b) is a multi-week effort better suited to a dedicated phase.

Default recommendation if you say "use defaults": **1b, 2b, 3a, 4a**.

### Pre-Implementation Risk & Impact Report

- **Data Impact**:
  - 1 new table: `kpi_pins` (`user_id`, `profit_center_id`, `kpi_definition_id`, `sort_order`, timestamps; unique on user+pc+kpi).
  - 1 new column on `audit_logs`: `batch_id uuid` (nullable) — groups bulk operations.
  - No changes to `heat_logs`, `inventory_ledger`, `kpi_definitions`, or `permission_grants`.
- **Workflow Impact**:
  - Inventory ledger gains a row action menu (currently has none).
  - Bulk select adds checkbox columns to ledger + heat-log tables and drilldown rows.
  - Overview page gains a "Pinned KPIs" section above existing widgets.
- **UI/UX Impact**:
  - New checkbox column + bulk action bar on `PortalInventoryLedger` and `KpiDetailDrawer` rows.
  - New "Reverse" item in row action menu.
  - New "Pin to overview" toggle on `PortalReports` KPI cards.
  - `PortalOverview` gains pinned-KPI rendering (uses existing `computeKpi` — zero new compute path).
- **Regression Risk**:
  - Medium for bulk actions — atomicity matters. Mitigation: implement bulk void/reverse as a single SECURITY DEFINER SQL function (`bulk_void_heat_logs`, `bulk_reverse_inventory_ledger`) wrapped in a transaction with a shared `batch_id`. All rows succeed or all roll back.
  - Low for pinning — it's read-only display logic.
- **Mitigation**:
  - Permission still gated by existing `permission_grants` rows (`heat_log/void`, `inventory/void`); no new resources.
  - Tests for: partial-failure rollback, batch_id grouping, pin-list ordering, max-pin enforcement (cap at 12 to keep overview responsive).

### Schema Changes (workspace-scoped, RLS-enabled)

**`kpi_pins`** (new table)
- `id uuid pk`, `user_id uuid not null`, `profit_center_id uuid not null`, `kpi_definition_id uuid not null`, `sort_order int not null default 0`, `created_at`, `updated_at`
- Unique: `(user_id, profit_center_id, kpi_definition_id)`
- RLS: user manages own pins only; visible only to themselves (no admin override — pins are personal preference, not configuration).

**`audit_logs`** — additive column
- `batch_id uuid` (nullable) — populated by bulk RPCs to group related rows.

### DB Functions

- `bulk_void_heat_logs(_ids uuid[], _reason text)` — SECURITY DEFINER. Generates one `batch_id`, iterates through `_ids`, calls existing `void_heat_log` per id, all in one transaction. Returns `{ batch_id, succeeded: int, failed: int, errors: jsonb[] }`. Permission check reuses existing `can_void_heat_log` per row (any failure rolls back the entire batch — no partial application).
- `bulk_reverse_inventory_ledger(_ids uuid[], _reason text)` — SECURITY DEFINER. Same pattern, wraps `reverse_inventory_ledger`.
- No new compute functions for pins — pins reuse `compute_kpi`.

### UI Slice

**Portal — `/portal/inventory/ledger`**
- Row action menu (new) with "Reverse" item, gated by `userCanAct(userId, 'inventory', 'void')`.
- Checkbox column + bulk action bar appearing when ≥1 row selected: "Reverse N selected" → AlertDialog with single reason field.

**Portal — `/portal/production`**
- Same checkbox + bulk action bar pattern for "Void N selected".

**KpiDetailDrawer**
- Existing row action menu gains "Reverse" when source is `inventory_ledger`.
- Bulk select inside the drawer rows table (matches outer pages).

**Portal — `/portal/reports`**
- KPI cards gain a small pin/unpin icon (top-right). Cap at 12 pins per user per workspace; further attempts show a toast.

**Portal — `/portal/overview`**
- New "Pinned KPIs" section at top: renders pinned KPIs as compact cards using existing `computeKpi` for the default `today` window. Empty state: "Pin KPIs from the Reports page to see them here."

### Implementation Steps → Verification

1. **Migration** — create `kpi_pins`, add `batch_id` to `audit_logs`, create `bulk_void_heat_logs` + `bulk_reverse_inventory_ledger`, RLS policies for `kpi_pins`.
   → `supabase--linter` clean. Test: bulk RPC rolls back on permission failure mid-batch.

2. **`src/lib/reporting.ts`** — add `fetchKpiPins`, `pinKpi`, `unpinKpi`, `reorderPins`, `bulkVoidHeatLogs`, `bulkReverseInventoryLedger`.
   → Unit tests for client-side pin reorder helper, max-pin cap enforcement.

3. **`src/lib/inventory.ts`** — add `reverseInventoryLedger` re-export from reporting (or move to inventory module if cleaner; verify by reading the file first to avoid duplication).
   → No new test (thin wrapper), but keep import path consistent.

4. **`PortalInventoryLedger.tsx`** — add row action menu, checkbox column, bulk action bar, AlertDialog for reason.
   → Tests: action menu hidden without permission; bulk bar appears only when rows selected.

5. **`PortalProduction.tsx`** — same checkbox + bulk action bar pattern for void.
   → Tests mirror inventory ledger.

6. **`KpiDetailDrawer.tsx`** — extend existing action menu with "Reverse" branch when source = `inventory_ledger`; add bulk-select inside drawer.
   → Tests: correct RPC dispatched per source type.

7. **`PortalReports.tsx`** — add pin/unpin icon on KPI cards; show pin count + cap warning.
   → Tests: pin cap enforced; unpin removes from list.

8. **`PortalOverview.tsx`** — render pinned KPIs section at top using `computeKpi`.
   → Tests: empty state renders; pinned KPIs render in `sort_order`.

9. **Docs + Policy + Tests** (SSOT lockstep):
   - `DOCUMENTATION.md`: Phase 8 section, new `kpi_pins` table, `batch_id` column, bulk RPC contract, new UI surfaces.
   - `POLICY.md`: extend Void & Reversal Governance with bulk semantics (atomic batch, shared reason, batch_id audit grouping); add Pinned KPIs Governance (personal preference, no admin override, capped at 12).
   - `src/test/example.test.tsx`: add tests for `reorderPins`, `enforceMaxPins`, bulk-batch shape.
   → Run full test suite to green.

### Out of Scope (deferred)
- Drag-and-drop dashboard grid — Phase 9 if requested.
- Multi-widget types beyond KPI cards — Phase 9.
- Bulk reason per-row — only ship if user explicitly picks decision 3b.
- Pin sharing between users — Phase 9.
- Email digest of pinned KPIs — Phase 9.

### Files to be Created/Modified
- **New**: `supabase/migrations/<phase8>.sql`
- **Modified**: `src/lib/reporting.ts`, `src/pages/PortalInventoryLedger.tsx`, `src/pages/PortalProduction.tsx`, `src/components/KpiDetailDrawer.tsx`, `src/pages/PortalReports.tsx`, `src/pages/PortalOverview.tsx`, `DOCUMENTATION.md`, `POLICY.md`, `src/test/example.test.tsx`

**Please confirm the 4 decisions above (or say "use defaults") before I proceed.**
