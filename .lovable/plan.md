
## Reconcile Architecture Doc with Implemented Model

Doc-only change. No code, schema, or behavior changes. The goal is to make the SteelFlow ERP Architecture Document accurately describe what is actually built, so future phases plan against reality instead of drift.

### Scope
- Update the architecture document to match the implemented model.
- Update `DOCUMENTATION.md` and `POLICY.md` Version History entries to record this reconciliation.
- No changes to `src/`, migrations, or tests.

### Files Touched
- `DOCUMENTATION.md` — add a "Architecture Reconciliation" section + version history entry.
- `POLICY.md` — add a policy log entry confirming the doc reconciliation (no rule changes).
- The architecture document itself (the one shared in chat) — provide a corrected version inline in the response so you can replace your source-of-truth copy.

> Note: the architecture document is not currently a file in the repo. I will deliver the reconciled version in the response. If you want it committed as `ARCHITECTURE.md`, say so and I will add that file in the same change.

### Reconciliations to Apply

| # | Section in Doc | Current (Incorrect) | Replace With (Implemented) |
|---|---|---|---|
| 1 | 3.1 RBAC | `roles` table with IDs r0–r3 | `user_roles` table with `app_role` enum: `super_admin`, `admin`, `manager`, `operator`, `analyst`, `user` |
| 2 | 3.2 ABAC | Generic RLS reference | Name the actual helpers: `has_profit_center_access`, `can_manage_profit_center`, `has_role`, `has_elevated_role`, `can_view_profile` |
| 3 | 4.1 Schema — `module_mappings` | Single table | Split into `app_modules` (catalog) + `profit_center_modules` (per-workspace overrides) |
| 4 | 4.1 Schema — `system_settings` | Global JSONB | `profit_center_settings` (workspace-scoped, JSONB `setting_value`) |
| 5 | 4.1 Schema — additions | Missing | Add `user_profit_centers` (assignments) and `audit_logs` (immutable) |
| 6 | 4.1 Schema — not yet built | Listed as live | Mark `heat_logs`, `material_consumption`, `inventory_ledger`, `furnaces` as **planned (Phase 3+)**, not implemented |
| 7 | 5.2 Module Onboarding | "Sync Modules" button via `pcMappingService` | Replace with the real flow: per-workspace module overrides edited in `/admin/modules`, falling back to active configurable `app_modules` when no override exists |
| 8 | 6 API & Integration | Lists Realtime + Storage as in use | Mark Supabase Realtime and Storage as **not currently wired** |
| 9 | 7 NFR — `ON UPDATE CASCADE` | Stated as enforced | Correct: FKs exist on config tables (`profit_center_modules`, `profit_center_settings`, `user_profit_centers`, `audit_logs`) but no CASCADE on PC rename is declared. Integrity is enforced via RLS + app logic |
| 10 | 7 NFR — case-insensitive module matching | Stated as enforced | Remove. Module keys are stored verbatim |
| 11 | 8 Deployment | Cloud Run via AI Studio | Lovable Cloud (managed Supabase + auto-deploy). `.env` is auto-managed |
| 12 | 9 Risks — `admin@steelflow.com` | Hardcoded primary architect | Remove. Super-admin is purely role-based via `user_roles` |
| 13 | 9 Risks — audit logs are placeholder | Stated as gap | Resolved: real `audit_logs` table + paginated admin viewer (`/admin/audit`) with 20-row chunks and load-more |
| 14 | 9 Risks — Delete PC confirmation | Listed | Keep as open item; PC delete is not exposed in admin UI yet |
| 15 | New section: **Implementation Status** | Missing | Add the phase status table (Phase 1 ✅, Phase 2 ✅, Phase 3–7 ❌) so the doc reflects build state |
| 16 | New section: **Route Map** | Missing | Document actual routes: `/`, `/login`, `/reset-password`, `/profit-centers`, `/portal`, `/portal/:moduleSlug`, `/admin`, `/admin/workspaces`, `/admin/modules`, `/admin/access`, `/admin/settings`, `/admin/audit` |

### What Stays Unchanged
- Section 1 (System Overview vision), Section 2.1 (logical UI flow shape), Section 5.1 (Production Entry workflow as a *future* spec) — these remain as forward-looking design intent and will be marked as such, not as implemented behavior.

### Verification
- Every claim in the reconciled doc maps to either:
  - an implemented file/table/route that exists today, or
  - an explicit "Planned (Phase N)" marker.
- `DOCUMENTATION.md` and `POLICY.md` version history entries dated 2026-04-24 record the reconciliation.
- No source files under `src/`, no migrations, no tests change.

### Out of Scope
- No new tables, no FK additions, no CASCADE migrations.
- No Realtime/Storage wiring.
- No PC delete UI.
- No `ARCHITECTURE.md` file commit unless you confirm you want one.
