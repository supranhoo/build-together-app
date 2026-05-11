## PR6 — Polymorphic Approvals (override deferral)

### Goal
Unify EAF heat approvals (`heat_log_approvals`) and CLU heat approvals (`clu_heats.status` + `metadata.transitions`) into a single queue that operates over arbitrary production entities, with `/portal/heat-approvals` becoming the one queue plant-head reviews.

### Pre-implementation Impact Report

**Data**
- New table `production_approvals` (polymorphic: `entity_type`, `entity_id`, `profit_center_id`, `status`, submit/decide actor+ts, notes, optional `payload jsonb` for entity snapshot at submit-time).
- Backfill: copy every row of `heat_log_approvals` into `production_approvals` with `entity_type='heat_log'` (preserves history & FKs to `ferro_cost_sheets` via `heat_log_id` — the cost-sheet table is untouched).
- Backfill CLU: for each `clu_heats` not in `draft`, create a matching `production_approvals` row mirroring its current status + last transition reason.
- `heat_log_approvals` is **kept** as a deprecated read-only view over `production_approvals` filtered by `entity_type='heat_log'` so the existing finance code keeps working until call sites are migrated. Drop in a follow-up PR.

**Workflow / RLS**
- SELECT: any user with PC access (same as today).
- INSERT (submit): user with PC access + `user_can_act('heat_log','create')` for `entity_type='heat_log'`; reuse the same gate for `entity_type='clu_heat'` (no new permission grant — operator role already covers both).
- UPDATE (decide): `super_admin` OR `can_manage_profit_center` — identical to today.
- DELETE: super_admin only.
- CLU status field stays as the operator-facing lifecycle (draft → pending_approval → approved/rejected → voided) but on transition to `pending_approval` the row is mirrored to `production_approvals`; admin decide via the unified queue writes back to `clu_heats.status` through a `SECURITY DEFINER` trigger / RPC `decide_production_approval(id, status, notes)`.

**UI**
- `PortalHeatApprovals` gains a tabbed/segmented filter for "Source: All | EAF heats | CLU heats". Rows render with a small badge showing source. Non-CLU users in PCs without CLU profile see only EAF (handled by `processProfile` from `useWorkspace`).
- CLU page's per-row Submit/Approve/Reject buttons are kept (operators want fast in-context actions), but they now hit the same RPC; admin approval can also happen from the unified queue.

**Regression risk**
- `fetchHeatApprovals` callers (PortalHeatApprovals, finance dashboard? grep first) — they continue to read the view, so behaviour is unchanged in PR6. Only the *queue page* gets the polymorphic filter.
- `ferro_cost_sheets` gating: today it reads `heat_log_approvals.status='approved'`. Migrating to the view preserves that.
- CLU `transitionHeat` audit trail in `metadata.transitions` is preserved AND additionally written to `production_approvals`; double-bookkeeping is fine for one release.

**Mitigation**
- Migration is reversible: view drop + table rename if rollback needed.
- New unit tests: 6 cases for the RPC + 4 cases for the unified fetcher.
- Existing tests (`clu-production-actions.test.ts`, finance approval tests) must still pass unchanged — the view shim guarantees this.

### Steps

1. **Migration** — create `production_approvals` table, RLS, trigger; rename old table → `heat_log_approvals_legacy`; create `heat_log_approvals` view; backfill from legacy + clu_heats; create `decide_production_approval` RPC + `submit_production_approval` RPC.
2. **Lib** — `src/lib/production-approvals.ts` (typed CRUD + RPC wrappers, `entity_type` union). Keep `finance.ts` helpers unchanged in this PR (they read the view).
3. **CLU integration** — `transitionHeat` calls `submit_production_approval` on `submit`, calls `decide_production_approval` on approve/reject. `clu_heats.status` is still updated by the RPC server-side.
4. **UI** — extend `PortalHeatApprovals` with source filter + CLU rows. Keep all EAF behaviour.
5. **Tests** — `src/test/production-approvals.test.ts` (6 RPC cases) + extend `clu-production-actions.test.ts` to assert mirror row exists.
6. **Docs** — POLICY.md (single approvals queue, gating rules), DOCUMENTATION.md (new table + RPC contracts), `.lovable/plan.md` (mark PR6 done, note legacy table cleanup as PR6.1).

### Out of scope (deliberate)
- Dropping `heat_log_approvals_legacy` and migrating finance.ts off the view → PR6.1.
- Approvals for non-production entities (PRs, sales orders) — schema supports it but no UI yet.
- Bulk approve/reject — separate UX decision.

Reply **approve** to ship, or tell me what to adjust.
