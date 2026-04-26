## Goal

Restyle the **Sales & Export → Dashboard** tab and page header to match the uploaded reference exactly. Pure presentation change. No backend / schema / service-layer changes. All math continues to flow through `aggregateSalesKpis` in `src/lib/sales.ts`.

## Visual Spec (from screenshot)

**Header row** (`PortalSales.tsx`)
- Title: "Sales & Export Management"
- Subtitle: "End-to-end sales cycle and dispatch tracking"
- Right side: Domestic / Export pill toggle (already exists, restyle), then a primary blue **"+ New Inquiry"** button.

**Tabs row** — rename + reorder to match the screenshot exactly:
`Dashboard · Customers · Inquiries · Offers · Orders · Production Allocation · Dispatch · Quality Unit · Logistics & Shipping · Billing & Docs · Banking & LC · Insights`
- "Offers" is a new scaffold tab (Phase B placeholder, no DB).
- Banking & LC stays Export-only.
- Tabs use a clean white card-like underline style (active = white pill with shadow + blue text/icon).

**Dashboard tab** — 3 stacked sections:

1. **Five colored KPI cards** (left-border accent + matching icon tint):
   | Card | Border | Source |
   |---|---|---|
   | Total Inquiries | blue | `kpis.openInquiries + kpis.quotedInquiries` (all non-closed) |
   | Active Offers | indigo | `kpis.quotedInquiries` (re-labelled "Pending {view} approval") |
   | Confirmed Orders | green | `kpis.confirmedOrders` |
   | Available Stock | amber | placeholder `0 MT` "Ready for release" (no stock join in Phase A) |
   | Dispatched Qty | purple | `kpis.dispatchedMt` |

   Each card: white bg, 4px left border in accent color, small icon top-right in muted gray, big bold number, small caption underneath.

2. **Three info panels in one row**:
   - **FX Exposure & LC Limits** (Export view) / **Domestic Receivables Snapshot** (Domestic view).
     Two grey rounded rows: "LC Value Pending" + "FX Realisation Rate (Avg)" — Phase A shows static placeholder values (`$ 0` / `₹ 0 / USD`) with a "Live in Phase D" muted caption. No new fetches.
   - **Market Presence** — keep existing `MixBar` for Domestic / Export %, plus a "TOP EXPORT MARKETS" chip row with three placeholder chips (Europe / Japan / SE Asia) gated behind `isExport`. Chips are hard-coded labels for now (Phase B will compute from customer country).
   - **Shipping Pipeline** — three grey rows (Container Booking / Stuffing Underway / Sailed In Transit) each showing `0 Units` placeholder with a "Phase B" caption. No new fetches.

3. **Recent Export Activity / Recent Domestic Activity** card — keep current table but update columns to match screenshot: `OrderRef · Customer · Port / Dest · Price (FX) · Qty (MT) · Status`. Use existing `orders` slice. Empty state text: "No recent activity".

## Files Touched

- `src/pages/PortalSales.tsx` — header restyle, "+ New Inquiry" button (opens existing inquiry create dialog inside `InquiriesTab` via a small lifted-state callback OR simply switches to inquiries tab — see Open Question 1), insert "Offers" tab as a `PhaseScaffold` between Inquiries and Orders, rename labels to match screenshot.
- `src/components/sales/DashboardTab.tsx` — replace KPI grid with colored-border cards, replace 2-col panels with 3-col panel row (FX/LC, Market Presence, Shipping Pipeline), update Recent Activity column headers and title to switch on `isExport`.

No new files, no new dependencies, no migration. `src/lib/sales.ts` and tests untouched.

## Pre-Implementation Risk Report

- **Data Impact**: none — pure UI.
- **Workflow Impact**: tab order changes; URL hash / persisted tab state (none in current code) unaffected. New "Offers" tab is a placeholder.
- **UI/UX Impact**: matches user-provided reference; uses existing semantic Tailwind tokens (`bg-card`, `text-foreground`, `border-border`) for theme compatibility; accent border colors use Tailwind palette utilities (`border-l-blue-500`, `border-l-emerald-500`, etc.) since these are decorative chrome, not brand tokens.
- **Regression Risk**: low — `aggregateSalesKpis` contract unchanged, `src/test/sales-phase-a.test.ts` continues to pass.
- **Mitigation**: visual change only; existing tests cover the math.

## Open Questions

1. **"+ New Inquiry" button behavior**: should it (a) just switch to the Inquiries tab and rely on the user clicking the existing "New Inquiry" there, or (b) open the InquiriesTab create-dialog directly via a lifted `openCreateOnMount` prop? Default if you don't reply: **(a) switch tab** — simplest, no prop drilling.
2. **Top Export Markets chips**: hard-coded `Europe / Japan / SE Asia` placeholders for Phase A, or compute from customer `country` field now? Default: **hard-coded with a "Phase B" tooltip** — keeps Phase A scope tight.
3. **Available Stock card** — pull from `inventory_ledger` for finished goods now, or leave as `0 MT` placeholder? Default: **placeholder** — finished-goods stock isn't modelled in Sales schema yet, deferring to Phase B.
