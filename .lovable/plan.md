
Assumptions:
- “Implement pagination and a load-more button” applies only to the admin audit screen at `/admin/audit`.
- The safest minimal change is to paginate audit logs in 20-row chunks and fetch additional chunks on demand, rather than redesigning the whole admin data-loading model.
- The current audit table should remain immutable and read-only; this request is a browsing enhancement only.

Pre-Implementation Risk & Impact Report:
- Data Impact: No schema or RLS changes are required if the existing audit table and policies already support ordered reads. Only query shape and client state need to change.
- Workflow Impact: Admins and super admins will be able to browse older audit records without changing how audit entries are created.
- UI/UX Impact: The audit screen gains paging controls plus a “Load more” action. The table layout remains unchanged.
- Regression Risk: Low to medium. Main risks are duplicate rows, skipped rows, broken state when switching workspaces, or stale pagination after refresh.
- Mitigation Plan: Use deterministic ordering by `created_at desc`, fetch fixed-size slices, reset pagination when workspace scope changes, and add tests for initial page, next/previous page behavior, and load-more growth.

Architectural Pushback / Simplicity Choice:
- I do not recommend adding total-count-based numbered pagination for the full dataset right now. That would add avoidable query/count complexity for a read-only admin screen.
- The simpler scalable solution is:
  1. fetch audit logs in pages of 20
  2. show pagination across the records already loaded
  3. expose a “Load more” button to append the next 20 from the backend
- This keeps the change surgical, avoids hardcoding totals, and still lets you browse beyond the initial set.

Implementation Plan:

1. Update audit log querying to support chunked reads
   - Extend `src/lib/workspace.ts` audit fetching with paged parameters such as `limit` and `offset` (or equivalent range-based slicing).
   - Return enough metadata for the UI to know whether more rows are available.
   - Keep ordering stable and descending by creation time.
   - Verification: the query can fetch the first 20 rows, then the next 20 without overlap.

2. Keep workspace/admin architecture aligned with a minimal change
   - Update `src/hooks/use-workspace.tsx` so the initial admin audit load uses 20 rows instead of the current larger slice.
   - Avoid turning the global workspace context into a full audit pagination manager unless needed.
   - Preserve the existing `auditLogs` context value as the first loaded page so other admin behavior does not change.
   - Verification: current admin pages still load, and the audit page starts with only the first chunk.

3. Add local pagination state to the audit screen
   - Update `src/pages/AdminAudit.tsx` to manage:
     - currently loaded audit rows
     - current visible page
     - page size for display
     - loading state for “Load more”
     - has-more state
   - Seed the page with `useWorkspace().auditLogs`, then append more rows on demand from the audit query helper.
   - Reset local paging state whenever the active workspace changes.
   - Verification: page state stays consistent when changing workspaces or re-entering the screen.

4. Add visible pagination controls plus load-more behavior
   - Use the existing `src/components/ui/pagination.tsx` components for previous/next navigation.
   - Show only the current page slice in the table.
   - Add a “Load more” button below the table to fetch the next backend chunk when the user reaches the end of loaded data or wants more history.
   - Disable controls appropriately during fetches and when no more rows exist.
   - Verification:
     - Previous/Next changes the visible page
     - Load More appends older records
     - No duplicate rows appear
     - Empty state still renders correctly

5. Keep SSOT documents in lockstep
   - Update `DOCUMENTATION.md` to state that admin audit review now loads records incrementally in 20-row chunks and supports pagination plus on-demand loading.
   - Update `POLICY.md` to clarify that audit history remains immutable while admins can browse historical records through paged read access.
   - Append version-history / policy-log entries for this change.
   - Verification: code behavior, technical docs, and policy all describe the same audit browsing model.

6. Add regression tests with realistic audit data
   - Extend `src/test/example.test.tsx` with realistic multiple audit entries.
   - Add tests for:
     - initial audit page renders the first chunk only
     - next/previous pagination changes what is visible
     - load-more appends additional audit entries
     - empty state still appears when no logs exist
   - Keep test data policy-aligned and immutable.
   - Verification: tests cover happy path and no-data path for the audit browser.

Technical Details:
- Preferred page size: 20 records per backend fetch and 20 per visible page.
- Keep the change scoped to:
  - `src/lib/workspace.ts`
  - `src/hooks/use-workspace.tsx`
  - `src/pages/AdminAudit.tsx`
  - `src/test/example.test.tsx`
  - `DOCUMENTATION.md`
  - `POLICY.md`
- No database migration is required unless the existing audit query proves insufficient, which it likely is not.

Step → Verification:
1. Paged audit query helper → fetches non-overlapping 20-row chunks
2. Initial admin load updated → audit page starts at 20 rows
3. Admin audit UI updated → prev/next and load-more behave correctly
4. Docs/policy updated → SSOT stays aligned
5. Tests updated → audit browsing regression coverage passes
