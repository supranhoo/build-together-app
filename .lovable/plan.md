
## Phase 6 — Drill-down, Scheduled Reports & Operational Polish

Build on Phase 5's KPI engine to give operators investigative power (click a KPI → see the rows behind the number) and give managers automated awareness (scheduled email summaries). Also closes the Phase 5 deferred items.

### Decisions Needed Before Build

1. **Drill-down scope** — clicking a KPI card opens a drawer showing the underlying rows (heat_logs, material_consumption, inventory_ledger). v1: read-only table with CSV export, or also inline edit/void links to the source record?
2. **Scheduled reports delivery** — daily/weekly email digest of selected KPIs per workspace via Resend (already a common Lovable integration), or in-app notification only?
3. **Recipients model** — workspace-scoped subscription (any member can subscribe themselves), or admin-managed distribution lists?
4. **Schedule granularity** — fixed presets (daily 7am, weekly Monday 7am workspace TZ), or full cron expression?

Default recommendation if you say "use defaults":
- Read-only drill-down drawer with CSV export (no inline edits — keeps audit trail clean)
- Email digest via Resend (requires `RESEND_API_KEY` secret)
- Self-subscription per user per KPI per workspace
- Fixed presets: daily 07:00 + weekly Monday 07:00 in workspace timezone

### Pre-Implementation Risk & Impact Report
- **Data Impact**: 2 new tables (`kpi_subscriptions`, `report_deliveries`). No changes to Phase 3/4/5 tables. Drill-down is read-only against existing data.
- **Workflow Impact**: New drawer UI on `/portal/reports`. New "Subscribe" toggle per KPI. New admin view of delivery history. New scheduled edge function.
- **UI/UX Impact**: KPI cards become clickable. New drawer component. New "Subscriptions" tab on reports page. New `/admin/report-deliveries` log.
- **Regression Risk**: Low. Drill-down is read-only. Email scheduling is isolated in an edge function — failures don't impact UI.
- **Mitigation**: Drill-down respects existing RLS (no new exposure). Email function failures logged to `report_deliveries` with status; retry logic capped at 3. Cron protected by `SUPABASE_SERVICE_ROLE_KEY` validation.

### Schema (workspace-scoped, RLS-enabled)

**`kpi_subscriptions`**
- `id`, `user_id`, `profit_center_id`, `kpi_definition_id`, `cadence` (`daily`|`weekly`), `is_active`, timestamps
- Unique: `(user_id, kpi_definition_id, cadence)`
- RLS: user manages own; admins view workspace-wide

**`report_deliveries`** (immutable log)
- `id`, `profit_center_id`, `user_id`, `kpi_definition_id`, `cadence`, `delivered_at`, `status` (`sent`|`failed`|`skipped`), `error_message`, `payload` (jsonb snapshot of values)
- RLS: user views own; admins view workspace-wide; INSERT only via service role

### DB Functions

- `compute_kpi_drilldown(_profit_center_id, _key, _from, _to)` — returns the raw rows from the formula's `source` table within the range, respecting RLS via `security invoker`. For ratio KPIs, returns rows from the numerator source.

### UI Slice

**Portal — `/portal/reports`** (extended)
- KPI cards become clickable → opens `<Sheet>` drawer with:
  - Header: KPI name, current value, applied filters
  - Tabs: "Rows" (paginated table with CSV export) | "Series" (existing chart, larger)
  - "Subscribe" toggle (daily / weekly checkboxes)
- New "My subscriptions" section listing active subscriptions with quick unsubscribe.

**Admin — `/admin/report-deliveries`** (new page)
- Table of recent deliveries for active workspace: when, KPI, recipient, status, error.
- Filter by date / status. Read-only.

### Edge Function

**`scheduled-report-digest`** — invoked by `pg_cron` at 07:00 UTC daily.
- For each `kpi_subscriptions` row matching today's cadence, compute KPI for the appropriate window (last 24h / last 7d), send email via Resend, write `report_deliveries` row.
- Idempotent: skips if a `sent` row already exists for today's cadence+sub.

### Implementation Steps → Verification

1. **Migration** — create `kpi_subscriptions`, `report_deliveries`, `compute_kpi_drilldown` SQL function, RLS policies, schedule pg_cron job.
   → Linter clean; cross-workspace RLS test; idempotency check.
2. **`src/lib/reporting.ts`** — extend with `fetchKpiDrilldown`, `subscribeToKpi`, `unsubscribeFromKpi`, `fetchMySubscriptions`.
   → Unit tests for subscription toggle logic and CSV row serialization.
3. **`PortalReports.tsx`** — add `<KpiDetailDrawer>` component, subscription toggles, "My subscriptions" section.
   → Tests for: drawer opens with correct rows, subscribe writes correct row, unsubscribe deletes.
4. **`AdminReportDeliveries.tsx`** — new admin page wired into nav.
   → Tests for filter + empty state.
5. **Edge function `scheduled-report-digest`** — Resend integration, idempotent dispatcher.
   → Test with `supabase--test_edge_functions`: simulate 1 sub, verify delivery row + outbound payload shape.
6. **Secret + connector** — add `RESEND_API_KEY` via `secrets--add_secret`. Verify domain in Resend dashboard (user action required).
7. **Docs + Policy + Tests**:
   - `DOCUMENTATION.md`: Phase 6 section, new tables, drilldown function, edge function contract.
   - `POLICY.md`: subscription governance (self-managed, admin-visible), delivery log retention (immutable, 90 days), email content scope.
   - `src/test/example.test.tsx`: extend with subscription helper, drilldown CSV, delivery log filter tests.
   → SSOT lockstep, all tests pass.

### Out of Scope (deferred)
- Inline edit/void from drilldown — Phase 7.
- PDF email attachments — deferred.
- Cross-workspace consolidated digests — Phase 7.
- Slack/Teams delivery — deferred.
- Custom dashboards — Phase 7.

### Files to be Created/Modified
- **New**: `supabase/migrations/<phase6>.sql`, `src/components/KpiDetailDrawer.tsx`, `src/pages/AdminReportDeliveries.tsx`, `supabase/functions/scheduled-report-digest/index.ts`
- **Modified**: `src/lib/reporting.ts`, `src/pages/PortalReports.tsx`, `src/components/AdminShell.tsx`, `src/App.tsx`, `DOCUMENTATION.md`, `POLICY.md`, `src/test/example.test.tsx`

**Please confirm the 4 decisions above (or say "use defaults") before I proceed. Note: if email delivery is approved, I'll need you to provide a `RESEND_API_KEY` and verify a sender domain in Resend.**
