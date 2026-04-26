## Plant Head Dashboard — Unified Cross-Module Monitoring

A single command-center view that pulls live KPIs from **all 7 operational modules** (Production, Inventory, Procurement, Quality, Maintenance, Finance, Sales) and presents them as one cohesive dashboard — without any feel of module fragmentation. Built for plant heads who need an at-a-glance health pulse before drilling into any module.

### Goal
Replace the current module-card-grid section of `/portal` (PortalOverview) with a **Plant Health Command Deck** that shows status, trends, and alerts for the entire plant in one screen. User keeps existing pinned-KPI sections at top; new dashboard sits in the middle.

---

### Layout (top-to-bottom)

```text
┌─────────────────────────────────────────────────────────────┐
│  Workspace header (existing) — name, role, location          │
├─────────────────────────────────────────────────────────────┤
│  Pinned KPIs (existing — team + personal)                   │
├─────────────────────────────────────────────────────────────┤
│  PLANT HEALTH STRIP — 4 traffic-light status pills           │
│  Production · Quality · Inventory · Maintenance              │
├─────────────────────────────────────────────────────────────┤
│  KPI MOSAIC — 12 unified cards (3×4 grid), all modules       │
│  color-coded by domain accent (left border) but consistent   │
│  card visual language so it reads as one dashboard           │
├─────────────────────────────────────────────────────────────┤
│  TWO-COLUMN INSIGHTS                                         │
│  ┌──────────────────────┬──────────────────────┐            │
│  │ Live Alert Feed      │ Today's Activity     │            │
│  │ (cross-module)       │ (heats, GRNs, WOs,   │            │
│  │                      │  inspections, sales) │            │
│  └──────────────────────┴──────────────────────┘            │
├─────────────────────────────────────────────────────────────┤
│  Configured modules grid (existing — quick navigation)       │
└─────────────────────────────────────────────────────────────┘
```

---

### KPI Mosaic — 12 cards (today / MTD)

Each card: domain accent border-left, icon, label, big value, sub-context, click-to-jump to source module. Uniform card style — only the accent color hints at the source.

| # | KPI | Source | Accent |
|---|---|---|---|
| 1 | Production today (MT) | `heat_logs` | blue |
| 2 | kWh / MT | `production-rollups` | blue |
| 3 | FG Inspections passed % | `fg_inspections` | green |
| 4 | Open Quality Complaints | `quality_complaints` | green |
| 5 | Stock items below min | `inventory-min-max` | amber |
| 6 | Total stock value (₹) | `inventory_ledger` | amber |
| 7 | Open POs / pending GRN | `purchase_orders` | violet |
| 8 | Supplier on-time % | `supplier_evaluations` | violet |
| 9 | Equipment in breakdown | `maintenance_breakdowns` | red |
| 10 | PM due (7 days) | `pm_schedules` | red |
| 11 | MTD cost / MT (₹) | `ferro_cost_sheets` | indigo |
| 12 | Sales orders MTD (MT / ₹) | `sales_orders` | pink |

### Plant Health Strip — 4 status pills

Each pill computes a derived health based on module KPIs and shows `Healthy / Watch / Critical`:
- **Production** — kWh/MT vs target, voided heats ratio
- **Quality** — pass rate, open complaints
- **Inventory** — % items below min
- **Maintenance** — equipment in breakdown, PM overdue

Pure derivation rules in a new `src/lib/plant-health.ts` (testable, zero hardcoded thresholds — uses `kpi_definitions` targets where present, sensible defaults otherwise).

### Live Alert Feed (cross-module)

Merged stream sorted by recency (last 10):
- New breakdowns (severity ≥ major)
- Stock items dropping below reorder
- Failed FG inspections / complaints opened
- Cost alerts breached (`cost_alert_rules`)
- Overdue PM tasks

### Today's Activity

Compact counters: heats tapped, GRNs received, work orders opened/closed, inspections done, sales orders booked.

---

### Files

**New**
- `src/lib/plant-health.ts` — pure derivers: `derivePlantHealth(...)`, `aggregateCrossModuleKpis(...)`, `mergeAlertFeed(...)`. No I/O.
- `src/components/portal/PlantHeadDashboard.tsx` — the dashboard composition (health strip + mosaic + insights).
- `src/test/plant-health.test.ts` — unit tests for derivers (status thresholds, aggregation, merge ordering).

**Edited**
- `src/pages/PortalOverview.tsx` — mount `<PlantHeadDashboard />` between the existing pinned-KPI sections and the modules grid. No removal of existing functionality.
- `DOCUMENTATION.md` + `POLICY.md` — add "Plant Head Dashboard" section: data sources, derivation rules, RLS scope (workspace-scoped, identical to existing portal pages).

### Technical notes
- Reuses existing fetchers from each module library (`fetchHeatLogs`, `fetchLedger`, `fetchFgInspections`, `fetchComplaints`, `fetchPurchaseOrders`, `fetchSupplierEvaluations`, `fetchEquipment`, `fetchBreakdowns`, `fetchPMSchedules`, `fetchFerroCostSheets`, `fetchOrders`, `fetchMasterItems`). All RLS-scoped via `profit_center_id`.
- Concurrent `Promise.all` fetch on mount; loading skeletons per card.
- Card click navigates to the relevant module route (e.g. `/portal/maintenance`, `/portal/inventory/min-max`).
- Semantic tokens only (no raw hex). Domain accents map to existing palette: `blue/green/amber/violet/red/indigo/pink` border-l-4 — already proven in `MaintenanceDashboardTab`.
- Zero new tables, zero migrations, zero hardcoded business values. Honors `kpi_definitions` targets when available.
- Workspace guard already provided by `RequireWorkspace`.

### Risk & impact
- **Data**: read-only aggregation; no schema/RLS changes.
- **Workflow**: additive — existing `/portal` features remain untouched.
- **UI/UX**: one new section on `/portal`; consistent card language so it reads as one dashboard, not stitched modules.
- **Regression**: low. Each module's own dashboard remains unchanged.
- **Mitigation**: unit tests on pure derivers + per-fetch try/catch so a single module failure doesn't blank the whole dashboard.
