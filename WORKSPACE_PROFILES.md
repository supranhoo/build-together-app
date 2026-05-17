# Workspace Profiles Specification

**Status:** Draft v1 · **Date:** 2026-05-17 · **Owner:** Architecture
**Supersedes:** the implicit "every PC = FAD" behavior.
**SSOT note:** This document is authoritative for Profit Center (PC) behavior. Code, schema, and POLICY.md must align with it.

---

## 0. Problem statement

Today every workspace (CPP, FAD, DRI, CLU, SMS) renders the FAD experience — furnace heat entry, ore/reductant/flux charge rows, Mn/Si recovery, ferro alloy cost sheet. This is wrong. Each PC is a distinct manufacturing process and must have its own modules, screens, master data, validations, KPIs, approvals, and reports.

The fix is a **Process Profile** attached to each Profit Center. The active workspace's profile drives everything the user sees and can do.

---

## 1. Comparison matrix

| Workspace | Business Purpose | Production Activities | Process Flow | Material Management | Sales Involvement | Material Movement | Data Capture & Reporting | Unique Functionality | Must NOT copy from FAD |
|---|---|---|---|---|---|---|---|---|---|
| **CPP** Captive Power Plant | Generate power and utilities for internal consumption | Power generation, boiler/turbine/generator ops, auxiliaries | Fuel intake → boiler → turbine → generator → grid/PC allocation; outage & maintenance overlay | Coal, water, chemicals, fuel oil, ash, turbine/boiler spares | None (internal allocation only) | Fuel receipts, internal power allocation to other PCs, ash dispatch | Generation log (MWh), fuel consumption, heat rate, PLF, auxiliary %, outage register, allocation report | Power allocation engine, outage tracker, heat-rate calc, PLF, ash by-product | Heat entry, charge mix, Mn/Si recovery, alloy chemistry, ferro cost sheet |
| **FAD** Ferro Alloy Division | Produce FeMn/SiMn ferro alloys via SAF heats | Furnace heats, charge mix, tapping, slag/dust handling | Charge → smelt → tap → cast → crush → bag → dispatch | Mn ore, reductant, flux, electrode paste, finished alloys, slag, dust | Yes — finished alloy sales | Raw inflow, internal consumption, FG dispatch, FG transfer to SMS | Heat log, chemistry, Mn/Si recovery, heat-wise cost sheet, furnace summary | Mn/Si recovery calc, electrode paste consumption, ferro cost sheet, slag credit | n/a (this IS FAD) |
| **DRI** Direct Reduced Iron | Produce sponge iron in rotary kilns | Kiln campaigns, ore reduction, sponge sizing, char handling | Ore + coal + dolomite → kiln → cooler → screening → sponge + char/dolochar | Iron ore, coal, dolomite, sponge iron, char, dolochar, accretion | Optional — sponge sale; primary internal transfer to SMS | Raw inflow, kiln consumption, sponge transfer-out to SMS, char dispatch | Kiln-shift log, feed rates, sponge output, metallization %, FeM %, coal rate, kiln availability, campaign register | Kiln campaign tracker, metallization & FeM tests, coal rate KPI, accretion log | Heat entry, ore/reductant/flux/paste charge layout, Mn/Si recovery, ferro cost sheet |
| **CLU** Conversion / Ladle / Refining Unit | Secondary refining between primary metal and downstream | Ladle/converter treatment batches, chemistry correction, blowing/treatment cycles | Receive metal → treatment station → additions → blow/stir → sample → correct → approve → transfer | Hot metal, additives (Al, CaSi, lime), oxygen, ladle consumables | None | Receive transfer from FAD/SMS, internal consumption, transfer-out post-approval | Batch/treatment log, additions, chemistry before/after, delay log, cycle time, approval status | Treatment cycle tracker, chemistry-correction recommendations, delay codes, batch acceptance gate | Furnace heat layout, ore/reductant/flux/paste charge, ferro alloy cost sheet, Mn recovery |
| **SMS** Steel Melting Shop | Melt steel, refine, cast billets/ingots | EAF/IF heats, ladle metallurgy, continuous/ingot casting | Charge (scrap+DRI+ferro alloy+flux) → melt → tap → LRF → cast → billet/ingot → yield/reject | Scrap, DRI, pig iron, ferro alloys, lime, dolomite, fluxes, billets, ingots, rejects | Yes — billet/ingot sale | Raw inflow, transfer-in from FAD (alloys) & DRI (sponge), internal consumption, FG dispatch | Steel heat log, charge mix, ladle log, cast log, chemistry, yield, rejection, dispatch | Caster log, billet/ingot yield, ladle metallurgy step, steel-grade chemistry rules | Ferro alloy cost sheet, Mn/Si recovery, FAD slag/dust recovery (use SMS-specific waste capture instead) |

---

## 2. Workspace-by-workspace behavior

### 2.1 CPP — Captive Power Plant
- Landing: **Power Generation Dashboard** (MWh today, PLF, aux %, heat rate, outage hours).
- Primary entry screen: **Generation Log** (per shift, per unit: gross MWh, aux MWh, net MWh, fuel kg, steam params, outage minutes & code).
- Modules: Power Generation · Fuel & Consumables · Equipment Availability · Outages · Power Allocation · Utilities/Ash · Reports.
- No heat number. No furnace charge. No alloy chemistry.

### 2.2 FAD — Ferro Alloy Division
- Retains current behavior: Heat Entry, Charge Mix (ore/reductant/flux/paste), Tap, Metal/Slag/Dust, Chemistry, Mn/Si Recovery, Ferro Cost Sheet, Furnace Summary.
- This is the **reference profile** but is NOT the default for other PCs.

### 2.3 DRI — Direct Reduced Iron
- Landing: **Kiln Dashboard** (sponge MT today, metallization, FeM, coal rate, kiln availability).
- Primary entry: **Kiln Shift Log** (per kiln, per shift: feed iron ore, coal, dolomite; sponge output; char, dolochar; metallization %, FeM %; campaign day; downtime).
- Modules: Kiln Production · Raw Material Feed · Sponge & By-Products · Quality (metallization/FeM/sizing) · Campaign Register · Transfers (to SMS) · Reports.
- No heats. No Mn recovery. No ferro cost sheet.

### 2.4 CLU — Conversion / Ladle / Refining Unit
- Landing: **Treatment Queue** (pending, in-treatment, awaiting approval, completed today).
- Primary entry: **Treatment Batch** (source heat/ladle, treatment type, additions list, blow/stir times, sample IDs, chemistry before/after, delay events, cycle time).
- Modules: Treatment & Refining · Additions · Chemistry & Correction · Delay Log · Approvals · Transfers (out post-approval) · Reports.
- No furnace charge layout. No alloy cost sheet. No Mn recovery.

### 2.5 SMS — Steel Melting Shop
- Landing: **Melt Shop Dashboard** (heats today, liquid steel MT, billet/ingot MT, yield %, rejection %).
- Primary entry: **Steel Heat** (furnace, charge mix: scrap+DRI+pig iron+ferro alloy+flux; tap weight; ladle metallurgy step; chemistry; casting: caster, billet/ingot count, length, reject MT).
- Modules: Steel Heats · Ladle Metallurgy · Casting · Billets & Ingots · Quality (steel grade chemistry) · Dispatch · Reports.
- No ferro alloy cost sheet. No Mn/Si recovery (SMS uses **alloy addition** & **steel chemistry compliance** instead).

---

## 3. FAD-only functionality (must be gated)

These screens, fields, and calculations exist **only when active PC profile = `ferro_alloy`**:

1. Heat Entry with ore/reductant/flux/paste charge rows
2. Mn recovery, Si recovery, distribution ratio calculation
3. Electrode paste consumption logging
4. Ferro alloy cost sheet (heat-wise & period)
5. FAD slag credit & dust recovery accounting
6. Alloy chemistry sheet (Mn%, Si%, C%, P%, S% with FAD grade rules)
7. Furnace-wise FAD summary report (heat count, avg power/MT, recovery)
8. Charge mix templates with Mn-bearing ratio targets

---

## 4. Shared (cross-PC) functionality

Allowed to be common; behavior may still adapt by profile:

- Authentication & session
- Workspace selector & assignment
- User ↔ PC mapping (with per-PC role)
- RBAC framework (roles + permission grants)
- Admin shell, navigation chrome, theme
- Inventory **framework** (ledger engine, movement types) — data isolated per PC
- Approvals **framework** (pending_approvals, edge function executor) — workflows per PC
- Audit logs **framework** — every row carries `profit_center_id`
- Notifications
- Reports framework (template engine; templates differ per PC)
- Master data shells (Materials, Stock Locations, Equipment) — **records scoped per PC**
- Inter-PC transfer workflow (single shared mechanism)

---

## 5. Module recommendations per workspace

| Module | CPP | FAD | DRI | CLU | SMS |
|---|---|---|---|---|---|
| Production / Generation | Power Generation | Ferro Alloy Heats | Kiln Production | Treatment Batches | Steel Heats |
| Raw Material / Feed | Fuel & Consumables | Charge Mix | Kiln Feed | Additions | Charge Mix |
| Output | Net Generation + Allocation | Tapped Alloy + Slag/Dust | Sponge + Char/Dolochar | Treated Metal | Liquid Steel + Billet/Ingot |
| Quality | — | Alloy Chemistry & Recovery | Metallization/FeM | Chemistry Correction | Steel Grade Chemistry |
| Equipment | Boilers/Turbines/Generators | Furnaces | Kilns | Ladles/Converters | Furnaces/Ladles/Casters |
| Movement | Internal allocation | Internal + dispatch | Transfer to SMS | Transfer out | Internal + dispatch |
| Cost | Heat rate / cost per MWh | Heat-wise ferro cost sheet | Cost per MT sponge | Cost per batch | Cost per MT steel/billet |
| Sales | — | Yes | Optional | — | Yes |
| Approvals | Outage, generation loss, fuel adj. | Heat, cost sheet, chemistry | Kiln prod, quality, transfer | Chemistry correction, treatment | Heat, casting, rejection, dispatch |

---

## 6. Data model recommendations

### 6.1 New: `process_profile` on `profit_centers`
```
ALTER TABLE profit_centers
  ADD COLUMN process_profile TEXT NOT NULL
    DEFAULT 'ferro_alloy'
    CHECK (process_profile IN ('power','ferro_alloy','dri','refining','steel_melting'));
```
Backfill: FAD→`ferro_alloy`, CPP→`power`, DRI→`dri`, CLU→`refining`, SMS→`steel_melting`.

### 6.2 PC scoping rule (enforced everywhere)
Every operational/transactional table MUST have `profit_center_id UUID NOT NULL` with:
- RLS using `has_profit_center_access(auth.uid(), profit_center_id)`
- Indexed `(profit_center_id, …)` for hot queries
- Insert policies that pin `profit_center_id` to the active workspace server-side when possible

Tables already compliant: heat_logs, material_consumption, inventory_ledger, materials, stock_locations, furnaces, shifts, sales_*, purchase_*, maintenance_*, audit_logs, pc_transfers, approval_workflows.

### 6.3 Material Master isolation
- Keep `materials.profit_center_id NOT NULL` (already true).
- All material dropdowns filter by active PC. **No exceptions** outside the explicit inter-PC transfer dialog.
- Material **categories** become PC-profile-driven via a new lookup `material_category(profile, code, label)`:
  - power: fuel_solid, fuel_liquid, chemical, ash, spare
  - ferro_alloy: ore, reductant, flux, paste, alloy_fg, slag, dust
  - dri: iron_ore, coal, dolomite, sponge, char, dolochar, accretion
  - refining: metal_in, additive, gas, consumable
  - steel_melting: scrap, dri_in, pig_iron, ferro_alloy_in, flux, billet, ingot, reject

### 6.4 Stock Locations isolation
- Already PC-scoped. Enforce that the Stock Locations admin form pins `profit_center_id = activePC`.
- Seed PC-appropriate location archetypes per profile on PC creation.

### 6.5 Inventory ledger isolation
- All reads filter `profit_center_id = activePC` (already enforced by RLS).
- `current_stock()` already takes `_profit_center_id` — keep.
- Inter-PC movement uses **only** `request_pc_transfer` → `accept_pc_transfer` / `reject_pc_transfer` (existing functions). Never write directly across PCs.

### 6.6 Module configuration per PC
- Existing `profit_center_modules` (or equivalent join) maps `(profit_center_id, app_module_key)` → enabled, label override, route override.
- Seed defaults from `process_profile` on PC creation; admin may override.

### 6.7 KPI configuration per PC
- `kpi_definitions.profit_center_id` already supports per-PC overrides (verified in `compute_kpi`).
- Seed a **profile KPI pack** per profile on PC creation:
  - power: gross_mwh, net_mwh, plf, aux_pct, heat_rate, outage_hours, fuel_kg_per_mwh
  - ferro_alloy: heat_count, mn_recovery, si_recovery, power_per_mt, cost_per_mt
  - dri: sponge_mt, metallization, fem_pct, coal_rate, kiln_availability
  - refining: cycle_time, delays_min, batch_acceptance, correction_success
  - steel_melting: heats, liquid_mt, billet_mt, yield_pct, rejection_pct, power_per_mt

### 6.8 Approval workflows per PC
- Already PC-scoped via `approval_workflows.profit_center_id` (Phase 1 shipped).
- Add `trigger_type` values: `outage`, `generation_loss`, `fuel_adjustment` (CPP); `kiln_production`, `sponge_quality` (DRI); `treatment_complete`, `chemistry_correction` (CLU); `casting`, `rejection`, `billet_dispatch` (SMS). FAD existing types retained.

### 6.9 Audit traceability
- `audit_logs` already carries `profit_center_id`. Ensure every new module trigger writes it. Audit UI filters by active PC by default, super_admin may switch to All.

---

## 7. Routing & UI recommendations

**Rule:** the URL stays stable; the renderer dispatches on `process_profile`.

```
/portal/production           → resolveProductionPage(profile)
  power         → PortalPowerGeneration
  ferro_alloy   → PortalProduction (existing FAD)
  dri          → PortalKilnProduction
  refining     → PortalTreatment
  steel_melting → PortalSteelHeats

/portal/quality              → resolveQualityPage(profile)
/portal/cost                 → resolveCostPage(profile)
/portal/equipment            → resolveEquipmentPage(profile)
```

Implementation:
1. Single dispatcher component per route that reads `useWorkspace().activeProfitCenter.processProfile` and renders the right page.
2. Navigation (`PortalShell`) renders nav items from a profile-driven config (`navConfig[profile]`), not a hardcoded list.
3. Equipment tab label is dynamic: Boilers/Turbines (CPP), Furnaces (FAD/SMS), Kilns (DRI), Ladles (CLU).
4. Hard 404 (not silent fallback) if a user deep-links to a screen not in the active profile — prevents leaking FAD UI into other PCs.

---

## 8. Validation rules per workspace

| Profile | Required fields per primary entry |
|---|---|
| power | unit, shift, gross_mwh ≥ 0, aux_mwh ≥ 0, net_mwh = gross - aux, fuel_kg > 0 when gross > 0, outage_min + run_min = shift_min |
| ferro_alloy | furnace, heat_no unique per PC, tap_time, weight_mt > 0, power_mwh > 0, charge mix totals > 0, chemistry sample present |
| dri | kiln, shift, ore_mt + coal_mt + dolomite_mt > 0, sponge_mt ≥ 0, metallization 0–100, fem_pct 0–100, campaign_day ≥ 1 |
| refining | source_ref required, treatment_type, started_at < ended_at, sample_before & sample_after IDs, approval before transfer |
| steel_melting | furnace, heat_no, charge mix (scrap+DRI+ferro+flux) > 0, tap_mt > 0, ladle step recorded, cast_mt + reject_mt ≤ tap_mt, chemistry sample |

Cross-cutting: every form pins `profit_center_id = activePC` server-side. Material & location pickers reject IDs from other PCs (already enforced by RLS but UI must not present them).

---

## 9. Reporting rules per workspace

Reports are **profile-scoped templates**. Template registry:

| Profile | Standard reports |
|---|---|
| power | Daily Generation, Fuel Consumption, Heat Rate Trend, Outage Register, PC Allocation Statement, Aux Consumption |
| ferro_alloy | Heat-wise Cost Sheet, Mn/Si Recovery Trend, Furnace Summary, Chemistry Compliance, FG Stock, Dispatch |
| dri | Kiln-wise Production, Sponge Yield, Metallization Trend, Coal Rate, Campaign Report, Char/Dolochar Generation, Transfer to SMS |
| refining | Treatment Batch Log, Delay Pareto, Chemistry Correction Effectiveness, Cycle Time Trend, Approval Aging |
| steel_melting | Heat-wise Production, Charge Mix Analysis, Yield Report, Rejection Pareto, Billet/Ingot Stock, Dispatch, Power per MT Steel |

Scheduled deliveries (`scheduled-report-digest`) must filter recipients by PC assignment and skip recipients without access.

---

## 10. Acceptance criteria

A1. When **CPP** is the active workspace, the user sees Power Generation as the production landing; FAD heat entry, charge mix, Mn/Si recovery, alloy chemistry, and ferro cost sheet routes return 404 or are absent from navigation.
A2. When **FAD** is active, all current FAD screens remain functional and unchanged.
A3. When **DRI** is active, Kiln Production is the production landing; metallization & FeM are recorded; FAD cost sheet and ferro recovery are absent.
A4. When **CLU** is active, Treatment Queue and Treatment Batch are the primary screens; chemistry correction & approval gate exist; FAD furnace layout is absent.
A5. When **SMS** is active, Steel Heat, Ladle, Casting are visible; ferro cost sheet is absent.
A6. Material dropdowns on every form list only `materials.profit_center_id = activePC`.
A7. Stock location dropdowns on every form list only `stock_locations.profit_center_id = activePC`.
A8. Inventory ledger queries return only `inventory_ledger.profit_center_id = activePC`. Sum of stock per (material, location) cannot include any other PC's rows.
A9. Inter-PC movement of any material creates exactly one `transfer_pc_out` row in the source PC and exactly one `transfer_pc_in` row in the destination PC, linked by a `pc_transfers` record.
A10. KPI cards on each portal dashboard render the profile's KPI pack; no PC shows FAD-only KPIs unless its profile is `ferro_alloy`.
A11. Each PC's Approvals tab lists only workflows whose `profit_center_id` matches it (plus globals); approval triggers offered in the editor are filtered by profile.
A12. Audit Log default view is filtered to active PC; super_admin may switch to All PCs.
A13. A user assigned only to DRI cannot read FAD/CPP/CLU/SMS data even via direct API calls (RLS rejection).
A14. A user may hold different roles in different PCs (e.g., Operator in DRI, Viewer in CPP) and the role at runtime matches the active PC.
A15. Scheduled reports include only the PCs the recipient is assigned to.

---

## 11. Implementation phases

**Phase A — Foundation (schema + dispatch)**
1. Migration: add `process_profile` to `profit_centers`; backfill the 5 known PCs.
2. Extend `useWorkspace()` to expose `processProfile`.
3. Profile-driven nav config in `PortalShell`.
4. Route dispatchers for `/portal/production`, `/portal/quality`, `/portal/cost`, `/portal/equipment`.
5. Material category lookup seeded per profile.

**Phase B — Non-FAD production screens**
1. CPP: PortalPowerGeneration (Generation Log, Allocation, Outages).
2. DRI: PortalKilnProduction (Kiln Shift Log, Campaign Register, Transfer to SMS).
3. CLU: PortalTreatment (Treatment Queue, Treatment Batch, Chemistry Correction).
4. SMS: PortalSteelHeats (Steel Heat, Ladle, Casting, Billet/Ingot).

**Phase C — Master data, KPIs, reports**
1. Seed profile-specific material categories & stock location archetypes on PC creation.
2. Seed profile KPI packs.
3. Seed profile report templates.
4. Extend approval workflow trigger types per profile.

**Phase D — Hardening**
1. Acceptance test suite (one file per acceptance criterion in §10).
2. Negative tests for cross-PC data leakage.
3. Migration playbook for existing data (FAD inventory must stay in FAD; SMS-bound inventory transferred via `request_pc_transfer`).

---

## 12. Out of scope (this spec)

- Specific UI visual design for each new screen (handled per-phase by design directions).
- Integration with third-party SCADA/historian for CPP — assumed manual entry MVP.
- Multi-tenant isolation beyond PC (project remains single-tenant).
