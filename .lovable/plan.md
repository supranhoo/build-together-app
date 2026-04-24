## Phase 12 Wrap-Up — Verify, Test, Document

Phase 12 code (logic + UI) is already in place. Remaining work to make the phase complete and policy-compliant per the SSOT rule (no code change ships without docs + policy in the same response).

### Scope (small, surgical)

**1. Verification pass (read-only review)**
- Re-read `src/lib/reporting.ts` Phase 12 helpers to confirm:
  - `diffSharedPinSelection` is pure (no DB calls).
  - `bulkApplySharedPins` threads a single `batchId` (uuid) into every `shareKpiPin`/`unshareKpiPin` call and continues on per-pin failure (returns `errors[]`).
  - `applySharedPinDefaults` reads current shared pins, diffs against defaults, then delegates to `bulkApplySharedPins`.
  - `shareKpiPin`/`unshareKpiPin` accept optional `batchId` and write it into `audit_logs.change_summary` (Decision 4a — one audit row per pin, sharing a batch_id).
- Re-read `src/components/SharedPinBulkDialog.tsx`, `PortalReports.tsx`, `AdminKpis.tsx`, `AdminWorkspaces.tsx` to confirm:
  - Bulk dialog visibility gated by `canShareKpiPin`.
  - Defaults card on `/admin/kpis` reads/writes `profit_center_settings` with `setting_key='shared_pin_defaults'`.
  - `AdminWorkspaces` create dialog has an opt-in checkbox; defaults are never applied automatically (Policy clause).

**2. Tests** (`src/test/example.test.tsx`, target 4 new tests → 52 total passing)
- `diffSharedPinSelection` — three cases: empty current + non-empty desired (all toShare); identical sets (empty diff); partial overlap (correct partition + preserves order of `desiredKpiIds` for `toShare`).
- `bulkApplySharedPins` — happy path with mocked `shareKpiPin`/`unshareKpiPin` confirming a single `batchId` is passed to every call and the returned counts match.
- `applySharedPinDefaults` — happy path with mocked supabase: current shared = `[A,B]`, defaults = `[B,C]` → unshares `A`, shares `C`, leaves `B` alone.
- Run `npm test` and confirm 52/52 green.

**3. Documentation (atomic — same response as any code)**
- `DOCUMENTATION.md`: add Phase 12 section listing the three new helpers, the new dialog component, the two updated admin pages, and the **explicit non-changes** (no schema, no RLS, no new RPCs, no edge functions). Append Version History entry "Phase 12 — Shared-Pin Governance Polish".
- `POLICY.md`: extend the existing Phase 10 "Shared Pin Governance" section with two Phase 12 clauses:
  1. **Bulk audit granularity** — Bulk share/unshare MUST emit one `audit_logs` row per affected pin. All rows from a single bulk action MUST share a `batch_id` UUID inside `change_summary`. The bulk path MUST NOT consolidate audit entries into a single row.
  2. **Defaults are intent, not policy** — `shared_pin_defaults` stored in `profit_center_settings` MUST be applied only on explicit admin action (workspace create with the opt-in checkbox checked, or the explicit "Apply defaults" button on `/admin/kpis`). They MUST NOT be applied automatically on workspace updates, on user assignment, or retroactively.

**4. Plan file**
- Mark `.lovable/plan.md` Phase 12 as ✅ complete with a one-line completion note (date, test count, batch_id confirmation). No content rewrite.

### Pre-Implementation Risk & Impact

- **Data Impact**: None. Tests are isolated; docs are markdown.
- **Workflow Impact**: None for end users.
- **UI/UX Impact**: None.
- **Regression Risk**: Low. Verification step catches any drift between the written code and the agreed Phase 12 design before tests are added. If verification surfaces an issue (e.g. `batchId` not threaded through), I'll flag it and fix surgically before claiming the phase done.
- **Mitigation**: Test count is the gate — 52/52 must pass before docs are finalized.

### What This Plan Does NOT Do

- No new features. No new RPCs. No new tables. No RLS changes. No new pages.
- No retroactive change to existing call sites of `shareKpiPin`/`unshareKpiPin` — the `batchId` parameter remains optional and defaults to `undefined`.
- No anomaly detection (Phase 15), no confidence intervals (Phase 14), no Overview layout work (Phase 13). Those remain on the backlog.

Approve to proceed.
