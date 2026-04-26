# Finance & Costing — Phase C

Activates 4 of the remaining tabs: **Power Tariff** (admin) + **Power Analysis** (portal), **Selling Prices** (admin) + **Profitability** (portal), and **Period Close** (admin) + **Period Snapshots** (portal). All work is additive — no Phase A/B behavior changes.

---

## 1. Schema (one migration)

Three new tables, all RLS-secured with the same admin-write / workspace-read pattern used in Phase A.

### `power_tariff_slabs`
Time-Of-Day power tariff slabs with effective-date tracking.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `profit_center_id` | uuid | RLS scope |
| `slab_name` | text | e.g. "Off-peak", "Normal", "Peak" |
| `start_hour` | int (0-23) | inclusive |
| `end_hour` | int (1-24) | exclusive |
| `rate_per_mwh` | numeric | ₹/MWh |
| `season` | text nullable | "summer" / "monsoon" / null = all-year |
| `effective_from` | date | |
| `effective_to` | date nullable | |
| `is_active` | bool default true | |
| `notes`, `created_by`, `created_at`, `updated_at` | | standard |

Plus a separate row type for fixed/demand charges via `slab_name = 'demand_charge'` with `start_hour=0, end_hour=24` — keeps one table, one effective-date logic.

### `selling_prices`
Per-grade selling price, effective-dated. Manual entry now (per the user's earlier choice — no `sales_orders` dependency).

| column | type |
|---|---|
| `id` | uuid PK |
| `profit_center_id` | uuid |
| `grade` | text |
| `product` | text nullable |
| `price_per_mt` | numeric |
| `currency_code` | text default 'INR' |
| `effective_from` | date |
| `effective_to` | date nullable |
| `is_active` | bool |
| `notes`, `created_by`, `created_at`, `updated_at` | |

### Period close — reuse existing `cost_period_snapshots`
Already deployed in Phase A (immutable, no UPDATE policy). Phase C just writes to it from the new "Period Close" workflow. The `payload` jsonb stores:
```
{
  "summary": { grossCost, byproductCredit, netCost, productionMt, netCostPerMt },
  "variance": { idealCost, actualCost, priceVariance, usageVariance },
  "power":    { totalMwh, totalCost, kwhPerMt, byTodSlab: [...] },
  "byproducts": { totals by type },
  "profitability": { byGrade: [...] },
  "lockedRates": { /* hash of effective rates at lock time, for audit */ }
}
```

### RLS (mirrors Phase A)
- SELECT: `has_profit_center_access`
- INSERT/UPDATE/DELETE on `power_tariff_slabs` and `selling_prices`: admin only via `can_manage_profit_center`
- `cost_period_snapshots`: already correct (insert by admin, no update, super-admin delete)

---

## 2. Service layer (`src/lib/finance.ts` — additive)

New types + pure functions. No changes to existing exports.

### Types
```ts
PowerTariffSlab, SellingPrice
```

### Fetchers / mutations
```ts
fetchPowerTariffSlabs(pcId)
createPowerTariffSlab(input) / deactivatePowerTariffSlab(id)
fetchSellingPrices(pcId)
createSellingPrice(input) / deactivateSellingPrice(id)
createPeriodSnapshot({ pcId, periodStart, periodEnd, payload, notes })
```

### Pure logic
```ts
// TOD decomposition: split a heat's MWh across slabs by tap_time hour.
// For Phase C we use tap_time as the proxy for the hour — no separate
// half-hourly meter feed yet. Documented as such in DOCUMENTATION.md.
splitMwhByTodSlab(heats: HeatLog[], slabs: PowerTariffSlab[], onDate: string)
  -> { slabName -> { mwh, costRs } }

// Selling-price effective lookup (mirrors bomEffectiveOn)
sellingPriceOn(prices, grade, onDate) -> number | null

// Profitability per grade
profitabilityByGrade({
  netCostPerMt: { grade -> number },
  prices: SellingPrice[],
  onDate,
}) -> Array<{ grade, sellingPrice, netCost, marginPerMt, marginPct }>

// Snapshot builder — assembles the payload from already-computed
// summary/variance/power/byproducts/profitability objects. Pure function so
// it is unit-testable and the UI just calls fetchers + assembler + insert.
buildSnapshotPayload(input) -> SnapshotPayload
```

---

## 3. UI surfaces

### Admin (`/admin/finance`)
- **Power Tariff** tab (`AdminPowerTariff.tsx`) — table of slabs with grade-style append-only editor: slab name, hour range, rate, season, effective-from. Soft-deactivate. Validation: `start_hour < end_hour`, no overlap warning (warn, not block — matches the user's "warn but allow" rate-change preference from Phase A planning).
- **Selling Prices** tab (`AdminSellingPrices.tsx`) — same effective-dated editor pattern as Standard BOM: grade, product, price/MT, currency, effective-from. Append-only.
- **Period Close** tab (`AdminPeriodClose.tsx`) — month selector → "Compute Preview" runs all Phase A/B/C calculations for that month → shows the snapshot payload → "Lock Period" button writes to `cost_period_snapshots`. Locked periods cannot be unlocked from the UI (super-admin DB-level only). Audit log written via existing `audit_logs` insert.

### Portal (`/portal/finance`)
- **Power Analysis** tab (`PortalPowerAnalysis.tsx`) — KPI cards (kWh/MT, total ₹, % cost from power), TOD slab table (MWh × rate per slab), trend line of kWh/MT by day. Uses `splitMwhByTodSlab` against existing `heat_logs.tap_time` and `heat_logs.power_mwh`.
- **Profitability** tab (`PortalProfitability.tsx`) — per-grade table: Selling Price | Gross Cost/MT | By-product Credit/MT | Net Cost/MT | **Margin/MT** | **Margin %**. Filters by date range. Reuses Phase B variance scope.
- **Period Snapshots** tab (`PortalSnapshots.tsx`) — list of locked periods with payload viewer (read-only). Clicking a row opens a drawer with the full snapshot summary.

### Tab activation
In `AdminFinance.tsx` and `PortalFinance.tsx`:
- Mark `power_tariff`, `selling_prices`, `period_close` as `live: true` (admin)
- Mark `power`, `profitability`, `snapshots` as `live: true` (portal)
- Wire each to its new component
- Update phase badge to **"Phase C · power, profitability & period close live"**

---

## 4. Tests (`src/test/finance-phase-c.test.ts`)

Pure-logic only (consistent with Phase B test style):
1. `splitMwhByTodSlab` distributes a heat's MWh into the correct slab by hour.
2. Slab effective-date filter respects `effective_from`/`effective_to`.
3. Demand-charge slab (0–24) catches all hours.
4. `sellingPriceOn` picks the latest effective row.
5. `profitabilityByGrade` computes `marginPerMt = sellingPrice − netCost` and `marginPct = margin / sellingPrice`.
6. `profitabilityByGrade` returns `null`-safe entries when selling price is missing for a grade.
7. `buildSnapshotPayload` produces the documented JSON shape and includes `lockedRates` hash.
8. Snapshot payload is deterministic (same inputs → byte-identical JSON) — guards audit integrity.
9. Period close overlap guard: building a snapshot for an already-locked period throws.
10. Margin % handles zero selling price without div/0.

Plus extending `example.test.tsx` route audit with the 3 new admin pages + 3 new portal components.

---

## 5. Documentation & policy

- **DOCUMENTATION.md**: add Phase C section — schema, TOD computation note (tap_time proxy), snapshot JSON shape, period-close workflow.
- **POLICY.md**: append rules — *"Once a period is locked, its numbers are immutable. Back-dated rate changes do NOT alter locked periods. New snapshots must use a strictly later `period_start` than any existing locked snapshot for the same workspace."*
- **Version History**: add `Phase C – Power Tariff (TOD), Selling Prices, Profitability, Period Close`.

---

## 6. Risk & impact (per project policy)

- **Data**: 2 new tables + new rows in existing `cost_period_snapshots`. Zero migration of historical data. RLS mirrors proven Phase A pattern.
- **Workflow**: Period close is the only destructive-feeling action — it's INSERT-only into an immutable table, surfaced behind a confirm dialog with a 3-character minimum reason (matches `void_heat_log` pattern).
- **UI**: 6 new components, all rendered inside existing tab shells — no navigation changes.
- **Regression**: Phase A/B code paths and exports are untouched. Variance engine continues to read live rates; locked snapshots are a separate read path used only by `PortalSnapshots`.
- **Mitigation**: pure-function tests, deterministic snapshot serialization, append-only rate tables.

---

## 7. Files

**New**
- `src/pages/AdminPowerTariff.tsx`
- `src/pages/AdminSellingPrices.tsx`
- `src/pages/AdminPeriodClose.tsx`
- `src/pages/PortalPowerAnalysis.tsx`
- `src/pages/PortalProfitability.tsx`
- `src/pages/PortalSnapshots.tsx`
- `src/test/finance-phase-c.test.ts`
- `supabase/migrations/<ts>_finance_phase_c.sql`

**Edited (additive only)**
- `src/lib/finance.ts` — new types, fetchers, mutations, pure logic
- `src/pages/AdminFinance.tsx` — wire 3 tabs, update phase badge
- `src/pages/PortalFinance.tsx` — wire 3 tabs, update phase badge
- `src/test/example.test.tsx` — route audit
- `DOCUMENTATION.md`, `POLICY.md`, `.lovable/plan.md`

After approval I'll execute the migration first, then ship code + tests in one pass and report the green test count.
