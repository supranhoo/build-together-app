
## Phase 7 Closeout — SSOT Sync & Verification

The Phase 7 implementation is complete in code, but three governance items from the original Phase 7 plan are still pending. Per the project's Single Source of Truth rule, these MUST land before we move on.

### What's missing

1. **`DOCUMENTATION.md`** — no Phase 7 section yet describing:
   - New `heat_logs` columns (`is_voided`, `void_reason`, `voided_at`, `voided_by`)
   - New SQL functions (`compute_kpi_consolidated`, `void_heat_log`, `reverse_inventory_ledger`, `can_void_heat_log`)
   - Voided-row exclusion in `_compute_kpi_aggregate` / `_compute_kpi_series`
   - Consolidated reporting toggle on `/portal/reports`
   - New `permission_grants` resources (`heat_log/void`, `inventory/void`)

2. **`POLICY.md`** — no Void Governance section yet covering:
   - Void permission gated only via `permission_grants` (no hardcoding)
   - Reason mandatory on every void / reversal
   - Voided heat logs excluded from KPI aggregations but retained for audit
   - Inventory reversals are additive ledger entries — ledger remains immutable
   - Cross-workspace consolidation reuses existing RLS (no new exposure)

3. **Test verification** — the new Phase 7 tests (`sumPerWorkspace`, voided-row exclusion path, reversal-net-zero shape) were added but the suite has not been re-run after the migration changes. Need a clean `npm test` pass.

### Plan → Verification

1. **Update `DOCUMENTATION.md`**
   - Add "Phase 7 — Cross-Workspace Consolidation & Operational Editing" section after the Phase 6 block.
   - Add new columns/functions/routes to the relevant schema and route tables.
   - Bump version history entry: `2026-04-24 — Phase 7 …`.
   → Verification: section present, references match migration `20260424082420_…`.

2. **Update `POLICY.md`**
   - Append `## Void & Reversal Governance` section.
   - Add Phase 7 entry to `## Policy Change Log`.
   → Verification: every Phase 7 capability has a matching policy rule.

3. **Run the test suite**
   - `npm test --silent`
   - Confirm all tests pass (expected ≥ 27 with the new `sumPerWorkspace` / consolidated / void test).
   → Verification: green output, no skipped Phase 7 tests.

4. **If any test fails**: fix at the source (mock data, helper, or test assertion) — no skips, no band-aids — and re-run until green.

### Risk & Impact
- **Data Impact**: None. Documentation + policy + test run only.
- **Workflow Impact**: None.
- **UI/UX Impact**: None.
- **Regression Risk**: Zero. No code paths touched outside docs and (potentially) tests.

### Files to be Modified
- `DOCUMENTATION.md`
- `POLICY.md`
- `src/test/example.test.tsx` (only if a test fails and needs fixing)

### Out of Scope (deferred to future phases as previously agreed)
- Surfacing inventory ledger reversals from the `PortalInventoryLedger` UI (RPC exists but no row action yet).
- Bulk void / bulk reverse — Phase 8.
- Custom dashboards — Phase 8.

**Approve to proceed?**
