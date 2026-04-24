## Phase 10 — Pin Sharing & Admin Overrides

Defaults applied for all 4 decisions. Confirm to proceed.

### Decisions (defaults)

1. **Scope model**: Workspace-scoped only (`scope='shared'` belongs to a `profit_center_id`, no role targeting).
2. **Cap interaction**: Shared pins do **not** count against the 12-pin personal cap. Rendered in a separate section.
3. **Who can publish**: `super_admin` + workspace admin (via existing `can_manage_profit_center`). No new `permission_grants` rows.
4. **User hide**: Not allowed. Shared pins are mandatory; one source of truth.

### Schema Changes (`supabase/migrations/<phase10>.sql`)

- `kpi_pins.scope text NOT NULL DEFAULT 'personal'` with CHECK `scope IN ('personal','shared')`.
- `kpi_pins.created_by uuid` (records the admin who shared).
- `kpi_pins.user_id` becomes nullable; CHECK: `(scope='personal' AND user_id IS NOT NULL) OR (scope='shared' AND user_id IS NULL)`.
- Drop existing unique on `(user_id, profit_center_id, kpi_definition_id)` if present; replace with two partial uniques:
  - `UNIQUE (user_id, profit_center_id, kpi_definition_id) WHERE scope='personal'`
  - `UNIQUE (profit_center_id, kpi_definition_id) WHERE scope='shared'`
- Backfill: existing rows get `scope='personal'` (the DEFAULT covers it).
- Revise `enforce_kpi_pin_cap()` trigger to skip when `NEW.scope='shared'` and to count only `scope='personal'` rows.
- Revise RLS policies on `kpi_pins`:
  - SELECT: `(scope='personal' AND user_id=auth.uid() AND has_profit_center_access(...)) OR (scope='shared' AND has_profit_center_access(...))`
  - INSERT/UPDATE/DELETE for `scope='personal'`: existing `user_id=auth.uid()` rules.
  - INSERT/UPDATE/DELETE for `scope='shared'`: `has_role(super_admin) OR can_manage_profit_center(auth.uid(), profit_center_id)`.

### Code Changes

**`src/lib/reporting.ts`** — add helpers:
- `shareKpiPin({ profitCenterId, kpiDefinitionId })` — inserts `scope='shared'`, `user_id=null`, `created_by=auth.uid()`; writes `audit_logs` entry (`entity_type='kpi_pin'`, `action='share'`).
- `unshareKpiPin({ profitCenterId, kpiDefinitionId })` — deletes the shared row; writes audit `action='unshare'`.
- `canShareKpiPin(roles, profitCenterId, managedProfitCenterIds)` — pure helper for UI gating.
- `splitPinsByScope(pins)` — returns `{ personal, shared }`.
- `pinKpi`/`unpinKpi`/`reorderPins` unchanged externally; internally scoped to `scope='personal'`.

**`src/pages/PortalReports.tsx`**:
- KPI card menu gains "Share with workspace" / "Unshare" entries, visible only when `canShareKpiPin` returns true.
- Cap indicator counts personal pins only; tooltip notes team pins are separate.

**`src/pages/PortalOverview.tsx`**:
- Two sections: **Pinned by your team** (read-only, subtle "Team" badge) and **Your pins** (existing reorder + unpin controls).
- Team section omitted entirely when empty.

### Documentation & Policy (same response as code, per SSOT)

- `DOCUMENTATION.md`: new `kpi_pins.scope` + `created_by` semantics, partial unique indexes, share/unshare contracts, audit entry shapes, revised cap-trigger behavior. Bump Version History.
- `POLICY.md`: new **Shared Pin Governance** section covering: who can share (admin only), workspace scope, separate cap (shared pins not counted), no per-user hide, mandatory audit trail on share/unshare.

### Tests (`src/test/example.test.tsx`) — 5–7 new

- `canShareKpiPin` returns true for super_admin and workspace admin, false otherwise.
- `splitPinsByScope` partitions correctly (mixed, all-personal, all-shared, empty).
- `enforceMaxPins` ignores `scope='shared'` rows when counting against the 12 cap.
- `reorderPins` operates only on personal pins (shared pins untouched in result).
- Audit payload shape for `share` / `unshare` matches contract.

### Pre-Implementation Risk Recap

- **Highest risk**: rewritten `kpi_pins` SELECT policy. Mitigation = explicit policy tests via `read_query` post-migration plus unit tests on the helper-side split logic.
- **Second risk**: cap trigger silently changing semantics. Mitigation = trigger short-circuits on `scope='shared'`; `scope='personal'` path is identical to today.
- **Additive migration only** — no destructive ops; existing rows backfill to `'personal'`.

### Out of Scope (deferred)

- Per-user hide of shared pins.
- Role-targeted shared pins.
- Drag-and-drop reorder UI.
- Forecast hardening.
- Cross-workspace pin sharing.

### Files Touched

- New: `supabase/migrations/<phase10>.sql`
- Modified: `src/lib/reporting.ts`, `src/pages/PortalReports.tsx`, `src/pages/PortalOverview.tsx`, `DOCUMENTATION.md`, `POLICY.md`, `src/test/example.test.tsx`

**Approve to proceed?**