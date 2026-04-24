
## Phase 4 — Inventory & Material Flows

Build the inventory foundation that links raw materials to heat production, enabling material consumption tracking per heat and triple-entry inventory ledger.

### Decisions Needed Before Build

I need 4 quick answers before locking the plan:

1. **Material catalog scope** — global (shared across all workspaces) or workspace-scoped (each PC defines its own materials)?
2. **Unit of measure** — fixed list (kg, MT, litre, piece) or admin-configurable per material?
3. **Stock locations** — single stock per workspace, or multiple bins/yards per workspace (e.g. "Raw Yard A", "Furnace Bay")?
4. **Negative stock** — block consumption that would drive stock negative, or allow with warning (real-world plants often back-date receipts)?

Default recommendations if you say "just pick sensible defaults":
- Workspace-scoped materials (matches existing PC isolation)
- Fixed UOM list seeded as configurable `profit_center_settings` (so admins can extend without code)
- Multiple stock locations per workspace (real plants need this; cost is one extra table)
- Allow negative stock with warning + audit flag (operational reality)

### Pre-Implementation Risk & Impact Report
- **Data Impact**: 4 new tables (`materials`, `stock_locations`, `inventory_ledger`, `material_consumption`). Workspace-scoped, RLS-enabled. No changes to Phase 3 tables.
- **Workflow Impact**: Operators get a "Consumption" step on the heat log entry form. Admins gain Materials + Stock Locations admin pages.
- **UI/UX Impact**: New admin pages `/admin/materials`, `/admin/stock-locations`. Heat log entry form gains optional consumption rows. New portal page `/portal/inventory` for stock view + receipts.
- **Regression Risk**: Low. All additive. Heat log entry form gets new optional section; existing heat logs stay valid.
- **Mitigation**: Consumption is optional on heat log v1 (so existing operators aren't blocked). RLS tested for cross-workspace isolation. Negative-stock guard is a configurable rule via `permission_grants` (`inventory`/`consume_negative`).

### Schema (workspace-scoped, RLS-enabled)

**`materials`** — catalog of raw materials per workspace
- `id`, `profit_center_id` (FK), `code`, `name`, `category` (raw/consumable/finished), `uom`, `is_active`, timestamps
- Unique: `(profit_center_id, code)`

**`stock_locations`** — physical/logical bins per workspace
- `id`, `profit_center_id` (FK), `code`, `name`, `is_active`, timestamps
- Unique: `(profit_center_id, code)`

**`inventory_ledger`** — immutable triple-entry style movements
- `id`, `profit_center_id`, `material_id`, `stock_location_id`, `movement_type` (`receipt`/`consumption`/`adjustment`/`transfer_in`/`transfer_out`), `quantity` (signed), `unit_cost` (nullable), `reference_type` (e.g. `heat_log`/`manual`), `reference_id` (nullable), `notes`, `created_by`, `created_at`
- Insert-only (no update/delete); reversals are new rows

**`material_consumption`** — link table between heat logs and ledger
- `id`, `heat_log_id` (FK), `material_id`, `stock_location_id`, `quantity`, `inventory_ledger_id` (FK to the consumption row), `created_at`
- Trigger creates the matching `inventory_ledger` row on insert

**DB function** `current_stock(_profit_center_id, _material_id, _stock_location_id) returns numeric` — sums `inventory_ledger.quantity`. Single source of truth for "what's in stock right now".

**Permission grants seeded** for resource `inventory`:
- `operator` + `consume` → `{"type":"always"}`
- `operator` + `receipt` → `{"type":"never"}`
- `manager` + `receipt` → `{"type":"always"}`
- `admin`/`super_admin` + `adjustment` → `{"type":"always"}`

### UI Slice

**Admin (new pages, registered in AdminShell nav)**
- `/admin/materials` — CRUD materials for active workspace
- `/admin/stock-locations` — CRUD stock locations

**Portal (new module `inventory`, seeded in `app_modules`, hidden until enabled per workspace)**
- `/portal/inventory` — current stock table (material × location), filterable
- `/portal/inventory/receipts` — receipt entry form (manager+)
- `/portal/inventory/ledger` — read-only ledger view, filterable by material/date/type

**Portal Production (extension, not new page)**
- Heat log entry form gains an optional "Consumption" section: add rows of `(material, location, quantity)`. On save, creates `material_consumption` rows which trigger ledger entries.

### Implementation Steps → Verification

1. **Migration** — create 4 tables, RLS, `current_stock` function, consumption→ledger trigger, seed `app_modules.inventory` row, seed inventory `permission_grants`.
   → Linter clean; cross-workspace RLS test passes.
2. **`src/lib/inventory.ts`** — typed fetchers/mutations for materials, stock locations, ledger, consumption, current stock.
   → Unit tests for each helper.
3. **Admin pages** — `AdminMaterials.tsx`, `AdminStockLocations.tsx`. Each save writes `audit_logs`.
   → Tests for save + audit write.
4. **Portal Inventory module** — list, receipts form, ledger view.
   → Tests for stock calculation + receipt flow.
5. **Heat log entry extension** — optional consumption rows in `PortalProduction.tsx`.
   → Tests: heat log saves with 0/1/many consumption rows; ledger gets corresponding rows.
6. **Wire navigation** — Materials + Stock Locations in `AdminShell` nav (admin-only); Inventory module in portal sidebar via existing `/admin/modules` enablement.
   → Nav renders only for permitted roles.
7. **Docs + Policy + Tests**:
   - `DOCUMENTATION.md`: Phase 4 section, new tables, new routes.
   - `POLICY.md`: inventory governance — receipts require manager+, adjustments require admin+, ledger immutable, negative stock allowed with audit flag.
   - `src/test/example.test.tsx`: extend with inventory + consumption tests.
   → SSOT lockstep, all tests pass.

### Out of Scope (deferred)
- Material valuation methods (FIFO/weighted-avg) — Phase 5/6.
- Mn recovery / yield formulas computed from consumption — Phase 5.
- Vendor/supplier master + purchase orders — Phase 6.
- Multi-workspace transfers — Phase 7.
- CSV bulk import.

### Files to be Created/Modified
- **New**: `supabase/migrations/<phase4>.sql`, `src/lib/inventory.ts`, `src/pages/AdminMaterials.tsx`, `src/pages/AdminStockLocations.tsx`, `src/pages/PortalInventory.tsx`, `src/pages/PortalInventoryReceipts.tsx`, `src/pages/PortalInventoryLedger.tsx`
- **Modified**: `src/App.tsx` (routes), `src/components/AdminShell.tsx` (nav), `src/pages/PortalProduction.tsx` (consumption section), `src/pages/ModulePlaceholder.tsx` (inventory route), `DOCUMENTATION.md`, `POLICY.md`, `src/test/example.test.tsx`

**Please confirm answers to the 4 questions above (or say "use defaults") before I proceed.**
