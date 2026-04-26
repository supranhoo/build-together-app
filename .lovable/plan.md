
# Sales & Export Module — Build Plan

## Pushback first (must read)

The uploaded `Sales.tsx` (1,314 lines) is a single monolithic reference from another codebase. Building it verbatim violates several project rules:

1. **Hardcoded styling** — uses `bg-white`, `text-slate-900`, `bg-blue-600`, etc. This project mandates **semantic tokens only** (`bg-card`, `text-foreground`, `bg-primary`). The reference UI cannot be copy-pasted.
2. **No backend** — the reference has 11 entity types (customers, inquiries, offers, orders, allocations, dispatches, quality, shipments, invoices, payments, LCs) with **zero schema** in this project. Building all 11 in one round violates SSOT, RCA, and surgical-change rules and would produce massive untested code.
3. **Mock-heavy** — most tabs in the reference use inline hardcoded arrays. This project's rule: realistic mock data must come from real workspace-scoped tables with RLS.
4. **Domestic/Export toggle** — the reference uses a single `isExport` boolean discriminator on every entity. That's a viable approach and we'll keep it, but it must be a typed enum + index, not loose JSON.

**Recommendation**: build in 4 phases over 4 rounds. This plan covers **Phase A only**: the module shell + 3 most-foundational functional tabs (Customers, Inquiries, Orders) + the dashboard. Other tabs render scaffolds that say "Coming in Phase B/C" with deep-links where SSOT already exists (e.g., Quality → existing Quality module; Dispatch → existing dispatch_clearances).

If you want all 12 tabs built now, say so explicitly and I'll re-plan — but expect lower per-tab quality.

---

## Phase A scope (this round)

### 1. Module registration
- Insert `sales` into `app_modules` (key=`sales`, route_segment=`sales`, icon=`ShoppingCart`, sort after `quality`).
- Add `<Route path="sales" element={<PortalSales />} />` inside the portal shell in `src/App.tsx`.
- Mount the same component under `/admin/sales` (mirroring procurement/quality SSOT pattern).

### 2. Database schema (one migration)
Three core tables, workspace-scoped, RLS-first, append-only where appropriate:

```text
sales_customers
  id, profit_center_id, code (unique per pc), name, customer_type
  ('steel_mill'|'trader'|'foundry'|'distributor'|'other'),
  is_export bool, country (nullable), region (nullable),
  contact_email, contact_phone, payment_terms_days,
  credit_limit numeric, currency_code, gst_or_tax_id,
  is_active, created_by, created_at, updated_at

sales_inquiries
  id, profit_center_id, inquiry_no (auto), inquiry_date,
  customer_id (fk), is_export, product, grade, qty_mt,
  expected_price, currency_code, incoterms, port,
  status enum ('open'|'quoted'|'won'|'lost'|'cancelled'),
  notes, created_by, created_at, updated_at

sales_orders
  id, profit_center_id, so_number (auto), order_date,
  customer_id, inquiry_id (nullable fk), is_export,
  product, grade, qty_mt, price_per_mt, currency_code,
  fx_rate (nullable), incoterms, port_of_loading,
  port_of_discharge, status enum
  ('draft'|'confirmed'|'in_production'|'ready_for_dispatch'
   |'dispatched'|'sailed'|'delivered'|'invoiced'|'paid'|'cancelled'),
  total_value (generated), notes, created_by, created_at, updated_at
```

**RLS pattern** (mirrors `bunker_feed_tests`):
- SELECT: `has_profit_center_access(auth.uid(), profit_center_id)`
- INSERT: workspace access + `created_by = auth.uid()` + new permission `user_can_act(auth.uid(), 'sales', '<action>')`
- UPDATE: workspace access + permission (orders are mutable; inquiries mutable while not won/lost)
- DELETE: super_admin only

**New permission grants** seeded: `sales:create`, `sales:edit`, `sales:approve`, `sales:dispatch` for `super_admin`, `manager`, `employee` roles per existing pattern in `permission_grants`.

**Auto-numbering**: trigger `set_so_number()` and `set_inquiry_no()` per profit center (e.g., `SO-2026-00001`), like other modules.

### 3. Service layer — `src/lib/sales.ts`
Pure, deterministic helpers + Supabase calls:
- `fetchCustomers(pcId, { isExport? })`, `createCustomer`, `updateCustomer`, `deactivateCustomer`
- `fetchInquiries(pcId, filters)`, `createInquiry`, `updateInquiryStatus`
- `fetchOrders(pcId, filters)`, `createOrder`, `updateOrderStatus`, `convertInquiryToOrder`
- `aggregateSalesKpis(orders, invoices?)` — pure; returns `{ totalBookingMt, confirmedOrders, dispatchedMt, openInquiries, exportPctByValue, domesticPctByValue }`. Handles empty arrays without NaN.

All write functions write `audit_logs` rows via existing `createAuditLog`.

### 4. UI — page + components

```
src/pages/PortalSales.tsx                 (shell, header with Domestic/Export toggle, tabs)
src/components/sales/
  DashboardTab.tsx          (live — KPI cards + recent orders + market mix)
  CustomersTab.tsx          (live — list, create dialog, deactivate)
  InquiriesTab.tsx          (live — list, create dialog, status update)
  OrdersTab.tsx             (live — list, create from scratch or from inquiry, status update)
  ProductionAllocationTab.tsx  (scaffold + deep-link to /portal/production)
  DispatchTab.tsx              (scaffold + deep-link to /portal/quality?tab=dispatch)
  QualityTab.tsx               (scaffold + deep-link to /portal/quality)
  ShipmentTab.tsx              (scaffold — Phase B; reuses import_shipments pattern)
  InvoicesTab.tsx              (scaffold — Phase C)
  BankingLcTab.tsx             (scaffold — Phase D, hidden when toggle = Domestic)
  ReportsTab.tsx               (scaffold — Phase D)
```

Conventions (non-negotiable):
- Use `Tabs`/`TabsList`/`TabsTrigger` from shadcn (matches Procurement/Quality), **not** the reference's hand-rolled tab buttons.
- Replace every `bg-white`, `text-slate-*`, `bg-blue-600`, `text-blue-700` etc. with semantic tokens (`bg-card`, `text-card-foreground`, `text-muted-foreground`, `bg-primary`, `text-primary`, `border-border`).
- Replace inline `Modal` from the reference with shadcn `Dialog`.
- All data fetched via `src/lib/sales.ts`; no `supabase.from(...)` calls inside components.
- Domestic/Export toggle stored in component state, passed as `isExport` filter to service calls.
- `useWorkspace().activeProfitCenter` gates everything; show "Select a workspace first" card when null (mirrors `AdminSellingPrices`).

### 5. Tests — `src/test/sales-phase-a.test.ts`
Pure logic only:
- `aggregateSalesKpis` — happy path, empty array (no NaN), mixed export/domestic split, single-record edge case.
- `convertInquiryToOrder` — shape mapping (status transition, currency carry-over, qty preserved).
- Customer code uniqueness validation helper.
Target: ≥6 passing tests.

### 6. Documentation & policy sync (same response)
- Append "Sales & Export — Phase A" section to `DOCUMENTATION.md` (data model, RLS matrix, status state-machine, phase scope).
- Append matching policy block to `POLICY.md`: who can create/approve/dispatch, audit requirements, FX/currency policy (record fx_rate at order confirmation; freeze on invoice — Phase C).
- Append entry to `.lovable/plan.md` Version History.

---

## Pre-implementation risk report

- **Data Impact**: 3 new tables, 1 enum, 4 new permission grants, 1 new module row. No changes to existing tables.
- **Workflow Impact**: New "sales_clerk" workflow surfaces; permissions default to `manager`+`super_admin` create/edit. `employee` read-only until you say otherwise.
- **UI Impact**: New top-level Portal tab "Sales". Domestic/Export toggle in module header. No changes to other modules.
- **Regression Risk**: Low — all additive. Quality and Dispatch tabs are deep-links so we don't fork existing flows.
- **Mitigation**: All schema gated by RLS using existing helpers (`has_profit_center_access`, `can_manage_profit_center`, `user_can_act`). Append-only audit log for every status transition. Tests cover pure logic; UI smoke-checked via TS compile + existing test suite.

---

## What is explicitly NOT in Phase A (pushback)

- Container stuffing tracker, vessel booking UI, BL document checklist (Phase B, needs `sales_shipments` + `sales_documents` tables).
- Commercial invoicing & payment receipts (Phase C, needs `sales_invoices`, `sales_payments`).
- LC tracking, FX forwards, document negotiation (Phase D, needs `sales_letters_of_credit`, `fx_forward_contracts` — would partially overlap existing `fx_rates` so we'll reuse).
- Reports/Insights tab with management KPI matrix (Phase D — depends on invoices+payments existing).
- Inline-editable rows, drag-drop, bulk import — none of those are in the reference either.

---

## Open questions (decide before I run the migration)

1. **Customer code generation**: auto (`CUST-2026-00001`) or manual entry? Reference uses manual `CUST-001`. I'll default to **auto** unless you say manual.
2. **Soft vs hard delete**: orders should be soft-cancelled (status=`cancelled`), customers soft-deactivated (`is_active=false`). Confirm.
3. **Multi-currency on domestic**: domestic orders default `currency_code='INR'`, export defaults `'USD'`. Toggle controls this. OK?
4. **Inquiry → Order conversion**: lock the inquiry (status=`won`) when converted, or allow multiple orders from one inquiry? I'll default to **single conversion locks the inquiry** unless you say otherwise.

Reply "go" + answers to the four questions (or just "go, defaults") and I'll implement Phase A end-to-end in one batch (migration + service + 4 live tabs + 8 scaffolds + tests + docs).
