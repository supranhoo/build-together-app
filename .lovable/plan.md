
# Master Data Configuration — Pushback + Scoped Plan

Per project rules (Simplicity First, Surgical Changes, Pushback Protocol), I'm halting the literal request and proposing a compliant alternative. Please read before approving.

## Why I'm pushing back

The request asks for 12 new master-data modules in a single build. Several **already exist** in this codebase and would be duplicated, breaking SSOT — the very principle the request is asking us to enforce.

Existing infrastructure that would be duplicated:

| Requested module | Already exists as |
|---|---|
| Furnace / Machine Master | `AdminFurnaces` + `furnaces` table |
| Location & Warehouse | `AdminStockLocations` + `stock_locations` table |
| Master KPIs | `AdminKpis` + `kpi_definitions` table |
| Stock Config (min/max/reorder) | partially via `profit_center_settings` |
| Validation Rules | `permission_grants` already governs configurable rules |

Building parallel "Item Master", "Furnace Master", "Location Master" tables alongside `materials`, `furnaces`, `stock_locations` would:
- Break SSOT (two truths for the same entity)
- Break existing Production / Inventory / KPI flows that read from current tables
- Violate "Zero-Hardcoding" by hardcoding a second master schema

Also: the prompt references "exactly matching the provided UI / screenshot" but **no screenshot is attached** to this conversation. I cannot match a UI I cannot see.

## What I propose instead

Treat the request as: **"extend the existing master data layer to cover the missing concepts, and group them under one Master Data tab."** This delivers the same business outcome (centralized SSOT) without duplication.

### Proposed scope — Phase 1 only (this approval)

Add **only the genuinely missing concepts**, reusing every existing table:

1. **Extend `materials`** with the columns the prompt actually needs that don't exist yet:
   - `type` enum: `RM | FG | WIP | Consumable` (today only `category` text exists)
   - `group_name`, `subgroup` (text)
   - `std_cost` numeric
   - `specs` jsonb (Mn/Fe/Si/Moisture/Ash etc. — free-form per item)
   - `min_level`, `max_level`, `reorder_level` numeric
   - Keep existing `code`, `name`, `uom`, `is_active`, `profit_center_id` — no rename, no breakage to Inventory/Production.

2. **New table `material_groups`** (workspace-scoped) for the Group & Hierarchy tab (parent + subgroup). RLS mirrors `materials`.

3. **New table `uom_conversions`** (workspace-scoped): `from_uom`, `to_uom`, `factor`. RLS mirrors `materials`.

4. **New table `cost_rates`** (workspace-scoped, date-effective): `material_id`, `rate`, `effective_from`, `effective_to`, `cost_type` (`fixed` | `variable`). RLS mirrors `materials`. Append-only updates via new rows; no in-place rate edits.

5. **Extend `furnaces`** with `machine_type` (`FAD | CLU | DRI`) and `power_rating_kw`. No new table.

6. **New "Master Data" tab in `/admin/settings`** that hosts sub-tabs:
   - Items (extended `materials` editor)
   - Groups (new `material_groups`)
   - Furnaces / Machines (link to existing `AdminFurnaces`, no duplication)
   - Cost Rates (new `cost_rates`)
   - UOM Conversions (new `uom_conversions`)
   - Locations (link to existing `AdminStockLocations`)
   - KPIs (link to existing `AdminKpis`)

   Sub-tabs that "link" mean we reuse the existing tab keys — no second copy.

### Explicitly **out of scope** for this phase (will require separate approvals)

- **Grade Master** — needs business rules I don't have (which grades, what determines a grade boundary, how it ties to heat logs). Will scope after Phase 1.
- **Process Mapping (RM → Process → FG)** — this is workflow modeling, not master data. Belongs in Phase 8 ("Advanced admin and process workflow builder" — already on the roadmap).
- **Validation Rules engine** — `permission_grants` already covers role-based rules. A second rules engine needs a written policy first.
- **Excel import / template download / bulk export** — non-trivial; deserves its own phase with file-size, validation, and audit rules.
- **Specification Master as a separate tab** — `specs jsonb` on `materials` covers this without a second table. A separate tab adds no value.

### Surgical principles I'll follow

- Zero changes to existing Production / Inventory / KPI read paths. New columns are nullable with safe defaults.
- All new tables use `profit_center_id` + RLS identical to `materials` / `furnaces`.
- All admin writes append `audit_logs` rows.
- No hardcoded enums in code — `type`, `cost_type`, `machine_type` live as DB enums, exposed to UI via the existing pattern.
- Tests: unit tests for each new lib function + a regression test that existing `AdminMaterials` and `AdminFurnaces` still render after the schema extension.

## What I need from you before building

Please confirm or amend:

1. **Approve the scoped Phase 1 above** (extend, don't duplicate), OR insist on building all 12 modules as parallel tables (I will build it but want the SSOT-duplication risk acknowledged in writing).
2. **Share the UI screenshot** if exact visual match matters. Without it I'll follow the existing `AdminMaterials` / `AdminFurnaces` table-and-form pattern already in the app.
3. **Confirm Grade Master, Process Mapping, Validation Rules, and Excel import are deferred** to later phases.
4. **Item ID format** — auto-UUID (current pattern) or a human-readable code like `RM-0001` per type? The latter requires a sequence per workspace per type.

Once you answer these, I'll switch to build mode and ship Phase 1 in one migration + one new tab with sub-tabs, no churn to existing modules.
