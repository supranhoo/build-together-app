
# Costing Module — Gap Analysis & Addition Plan

## What exists today (audit)

**Engine (`src/lib/costing.ts`)** — 4 pure functions:
- `latestRateOn` — picks effective `cost_rates` row by date
- `materialCost` — Σ(qty × rate)
- `conversionCost` — power × rate + fixed × days (flat, single tariff)
- `buildCostBreakdown` — total, cost/MT, cost/Mn, single variance vs target

**UI (`src/pages/PortalCosting.tsx`)** — single page, single tab:
- Date + furnace filter
- 8 KPI cards (actual cost only)
- Heat-level table (heat #, tap time, weight, power)
- Excel export (Summary + Heats sheets)

**Admin** — `AdminCostRates.tsx` (rate master, append-only), 4 settings keys (`costing.power_rate_per_mwh`, `costing.fixed_cost_per_day`, `costing.target_cost_per_mt`, `costing.target_grade_mn_pct`)

**Schema** — `cost_rates`, `material_consumption`, `heat_logs`, `heat_metallurgy` (slag/dust/FG Mn%), `fx_rates`, `currencies` already present.

---

## Critical gaps (what's missing for a real ferro-alloys cost system)

| # | Gap | Business impact |
|---|---|---|
| 1 | **No Standard Cost / BOM** — only ACTUAL is computed | Cannot answer "what *should* this heat have cost?" — no benchmark |
| 2 | **No variance decomposition** — single number, no price/usage split | Can't tell purchasing vs operations who caused the over-spend |
| 3 | **No by-product credits** — slag and dust thrown away in costing | Net cost/MT overstated by ₹3–8K typical |
| 4 | **No recovery costing** — Mn lost to slag (heat_metallurgy.slag_mno_pct) ignored | Hidden ₹/MT loss invisible to operators |
| 5 | **Flat power rate** — no TOD/slab tariff, no kWh-per-MT trend | Ferro plants live and die by power — biggest single cost |
| 6 | **No period close / snapshot** — recompute on every load, history can shift if rates back-dated | Audit failure: April cost can change in May |
| 7 | **No furnace-level cost matrix** — single roll-up only | Can't compare F1 vs F2 efficiency |
| 8 | **No grade/product split** — all heats lumped together | Si-Mn vs Fe-Mn margins invisible |
| 9 | **No selling price / profitability** — costs only, no margin | Can't drive grade-mix decisions |
| 10 | **No FX handling on imported ore** — `fx_rates` table exists but unused in costing | Imported Mn ore (USD) marked at stale INR rate |
| 11 | **No budget vs actual** — no monthly target to track against | No early warning on cost drift |
| 12 | **No alerts** — silent until month-end | Bad heat caught next month, not next shift |

---

## Phase plan (4 phases, additive — no breaking change to existing engine)

### Phase A — Foundation: Module shell + 4 schema tables
- Register `finance` module in `app_modules` (so it shows in Module Configuration sidebar like `quality` was)
- Create 9-tab `AdminFinance` + `PortalFinance` shells (replace single-page PortalCosting as the legacy "Cost Sheet" tab inside)
- Migrations for 4 new tables:
  - `standard_cost_bom` — BOM per (grade, material) with std_qty_per_mt + std_rate
  - `cost_period_snapshots` — immutable monthly freeze (jsonb payload + locked_at + locked_by)
  - `cost_alert_rules` — threshold rules per workspace (kpi, op, value)
  - `byproduct_credits` — slag/dust/fines sold rates by period
- All RLS via existing `has_profit_center_access` / `can_manage_profit_center` helpers

### Phase B — Standard Cost & Variance Engine
- `AdminFinance > Standard BOM` tab — editor for std recipe per grade
- `PortalFinance > Cost Sheet` upgraded to **IDEAL vs ACTUAL vs VAR** matrix (per furnace, per heat)
- Extend `src/lib/costing.ts` (additive, keep existing exports) with:
  - `priceVariance(actualRate, stdRate, actualQty)` — purchasing variance
  - `usageVariance(actualQty, stdQty, stdRate)` — operations variance
  - `recoveryLoss(slagQty, slagMnPct, mnRate)` — Mn lost to slag in ₹
  - `byproductCredit(slagQty, slagRate, dustQty, dustRate)`
  - `costPerMtNet(grossCost, byproductCredit, productionMt)`
- Unit tests in `src/test/finance-phase-b.test.ts`

### Phase C — Power, Profitability & Period Close
- `PortalFinance > Power Analysis` tab — kWh/MT trend, TOD slab decomposition, demand-charge tracking
- `PortalFinance > Profitability` tab — selling price (from `profit_center_settings.finance.selling_price.<grade>`) − net cost = margin per MT per grade
- `PortalFinance > Period Close` tab — admin-only: lock a month, write `cost_period_snapshots` row with full breakdown JSON; subsequent reads of that period serve from snapshot, not live
- Tariff slabs added to settings: `finance.power_tariff.slabs` JSON
- Unit tests in `src/test/finance-phase-c.test.ts`

### Phase D — Alerts, FX & Dashboard
- `AdminFinance > Cost Alerts` tab — threshold rules (e.g. cost/MT > ₹95K, kWh/MT > 3800)
- `PortalFinance > Dashboard` tab — 12-card overview, MTD vs budget, top-3 variance drivers, alert feed
- FX integration: imported materials priced via `fx_rates` on consumption date (extend `latestRateOn` with optional currency conversion, no breaking change)
- `PortalFinance > Reports` tab — period-over-period Excel export with all sheets (Summary, Heats, BOM Variance, By-products, Power, Profitability)
- Unit tests in `src/test/finance-phase-d.test.ts`

---

## Tab map (final)

```text
AdminFinance                   PortalFinance
────────────────               ────────────────
1. Rate & Cost Pool*           1. Dashboard
2. Standard BOM (new)          2. Cost Sheet (IDEAL|ACT|VAR)
3. By-product Credits (new)    3. Power Analysis
4. Power Tariff Slabs (new)    4. Profitability
5. Selling Prices (new)        5. By-products
6. Cost Alerts (new)           6. Variance Analysis
7. Budget Targets (new)        7. Period Snapshots
8. Period Close (new)          8. Reports
9. FX & Currency (new)         9. Cost Sheet (legacy)*

* = wraps existing pages, no rewrite
```

---

## Architectural rules followed

- **Zero hardcoding** — BOM, tariff slabs, selling prices, alert thresholds all in DB / settings
- **SSOT** — DOCUMENTATION.md + POLICY.md updated each phase
- **Surgical** — existing `costing.ts` exports preserved; new functions added, none renamed
- **RLS-first** — all new tables use existing helper functions
- **Snapshots = immutable** — once locked, period numbers cannot change even if rates are back-dated
- **Test-driven** — one test file per phase, happy + failure cases

---

## Questions before Phase A

1. **Module naming** — call it `Finance & Costing` or just `Costing`? (affects sidebar label and route segment)
2. **Rate change policy** — when a rate is back-dated to a closed period, should the system (a) reject, (b) warn but allow, or (c) require an admin override? This affects snapshot integrity.
3. **Selling price source** — manual setting per grade now, or wait for a future `sales_orders` table?
4. **Budget granularity** — monthly cost/MT target only, or also per-cost-element (material / power / fixed) targets?

