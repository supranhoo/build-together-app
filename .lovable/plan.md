# Navigation Smoothness — UX & Architecture Plan

You're not wrong. After login the app technically routes correctly, but several real navigation gaps make it *feel* trapped. This plan fixes every gap I found, surgically — no redesign, no new features.

---

## 1. Problems found (evidence-based)

I read `PortalShell.tsx`, `AdminShell.tsx`, `PortalInventory.tsx`, `PortalOverview.tsx`, `ModulePlaceholder.tsx`, `ProfitCenterSelector.tsx`, and the route map in `App.tsx`. Concrete issues:

| # | Where | Issue | User impact |
|---|-------|-------|-------------|
| 1 | `PortalShell` mobile (<lg) | Sidebar is `hidden lg:flex`. The header has a `Menu` button but it only flips `sidebarOpen` state — the sidebar element itself stays `hidden` on mobile, so **nothing opens**. | On tablet/phone there is **no way to navigate** between Overview / Production / Inventory / Reports / Admin. |
| 2 | `PortalShell` desktop collapsed | When collapsed to `w-24`, icons render but **have no tooltips/labels**. Active state highlight still works, but discoverability drops. | Users can't tell what each icon does. |
| 3 | `AdminShell` | No collapse at all; the only way back is the single "Return to portal" button in the header. There is **no link from Portal sidebar back to last admin page** and vice-versa beyond a single button. | Admins bounce. |
| 4 | `AdminShell` mobile | Sidebar stacks above content (`lg:grid`) which is fine, but it's **never collapsible**, so on phone the nav consumes the whole first screen before any content. | Mobile admin is unusable. |
| 5 | Header breadcrumb in `PortalShell` | Shows `currentLabel › workspace name` — that's not a breadcrumb, it's a label + context tag. **Sub-routes like `/portal/inventory/receipts` show "Workspace"** (fallback) because `navItems` only matches top-level routes. | Users on a sub-page don't know where they are or how to go up. |
| 6 | `PortalInventory` sub-routes | `/portal/inventory/receipts` and `/portal/inventory/ledger` exist, but the only entry points are two buttons on the inventory landing card. There are **no tabs** to switch between Stock / Receipts / Ledger; users must go Back → click another button. | Sub-section feels disconnected. |
| 7 | `PortalOverview` | "Configured module" cards are display-only — they look clickable but **aren't links**. The two CTA buttons ("Open workspace brief", "Review configured modules") do nothing. | Dead ends on the landing page. |
| 8 | `ProfitCenterSelector` | After picking a workspace, the "Continue to workspace" button uses `defaultModule?.routeSegment` but **doesn't honor the user's last-visited page** (stored nowhere). | Re-entry friction. |
| 9 | `Switch workspace` button | Hidden on mobile (`hidden md:inline-flex`). | No way to switch workspace on a phone. |
| 10 | Keyboard / a11y | Sidebar links lack `aria-current`, collapsed icons lack `aria-label`/tooltip, the mobile menu button has no `aria-expanded`. | Screen-reader and keyboard users blocked. |

---

## 2. What we will change (surgical, minimum-diff)

All work is **UI plumbing only**. No schema, no RLS, no business logic, no policy change. So §5 SSOT only requires a short note in `DOCUMENTATION.md` under a new "Navigation shell" subsection. `POLICY.md` is untouched (no business rule changes).

### A. `PortalShell.tsx` — fix mobile + collapsed UX
1. **Mobile drawer:** wrap the existing `<aside>` in a Sheet (`@/components/ui/sheet`) for `<lg` screens; the header `Menu` button becomes the Sheet trigger. Desktop behavior (collapse to `w-24`) is unchanged.
2. **Tooltips on collapsed icons:** wrap each collapsed nav icon in `Tooltip` (`@/components/ui/tooltip`) showing the label on hover/focus. Add `aria-label={item.label}`.
3. **Real breadcrumb:** replace the current `currentLabel › workspace` line with `Breadcrumb` from `@/components/ui/breadcrumb`, built from `location.pathname` segments. Each segment links upward. Workspace name moves to a small chip on the right of the header (still visible, no longer pretending to be a crumb).
4. **`aria-current="page"`** on the active `NavLink` (via the existing `activeClassName` mechanism — add the attribute in `NavLink.tsx`).
5. **`Switch workspace`** button: drop the `hidden md:inline-flex`; on small screens render as icon-only with `aria-label`.
6. **Remove the dead "Search" input** OR mark it `disabled` with placeholder "Search (coming soon)" — currently it's a misleading affordance. Recommend disable, since removing changes layout more than needed.

### B. `AdminShell.tsx` — same treatment, scoped
1. Add the same Sheet-based mobile drawer for `<lg` screens (admin nav is long — 13 items — so this matters most here).
2. Add `Breadcrumb` to the header (Admin › section name).
3. Add `aria-current` via `NavLink`.
4. Keep the "Return to portal" button as-is (it works), but add a matching **"Open admin"** entry already exists in `PortalShell` under `isAdmin`, so bidirectional navigation is preserved.

### C. `PortalInventory.tsx` — add a tab strip for sub-routes
Replace the "View ledger / New receipt" button pair on the landing view with a persistent `Tabs` strip rendered **inside `PortalInventory` regardless of `isNested`**:
- Stock on hand → `/portal/inventory`
- Receipts → `/portal/inventory/receipts`
- Ledger → `/portal/inventory/ledger`

Active tab is driven by `location.pathname`. The "Back" buttons in `PortalInventoryReceipts` / `PortalInventoryLedger` become redundant and are removed (cleanup §3 — these were introduced by the same module so removal is in-scope).

### D. `PortalOverview.tsx` — make the module cards navigable
1. Wrap each "Configured module" card in a `Link` to `/portal/${module.routeSegment}`; add hover state.
2. Wire the two CTA buttons:
   - "Open workspace brief" → scroll to / focus the "Current workspace" card (no new page).
   - "Review configured modules" → scrolls to the modules grid.
   (No new routes, no new features — they just stop being dead.)

### E. `NavLink.tsx` — pass `aria-current`
Add `aria-current={isActive ? "page" : undefined}` inside the className callback wrapper. One-line addition.

### F. `ProfitCenterSelector.tsx` — last-visited memory (optional, small)
Add a `lastPortalPath` key to `workspace-storage.ts` (purely client preference, no backend). On selecting a workspace, "Continue to workspace" navigates to that stored path if present and still valid (i.e. starts with `/portal/`), otherwise falls back to `defaultModule`. **This is the only file outside §A–E that gets a behavior change**; flag it as optional if you want the diff even smaller.

---

## 3. Out of scope (explicit pushback)

- **No new sidebar library** (no shadcn `Sidebar` migration). The current `aside`+`NavLink` works; swapping it would be a refactor unrelated to the request.
- **No global command palette** (Cmd-K). Tempting, but speculative per §2 Simplicity.
- **No new routes**, no new modules, no new pages.
- **No Supabase/RLS changes**, no audit-log changes.
- **No redesign** of header, colors, or typography.

---

## 4. Risk & impact report (per §9)

- **Data impact:** none.
- **Workflow impact:** none — same routes, same permissions. `RequireAdmin` / `RequireWorkspace` guards untouched.
- **UI/UX impact:** strictly additive — adds tooltips, drawer, breadcrumb, tabs. Existing desktop layout pixel-equivalent except inventory page (button row → tab strip).
- **Regression risk:**
  - Sheet adds a portal'd element — ensure `z-index` ≥ existing sticky header (`z-20`). Mitigation: use Sheet defaults (z-50).
  - Breadcrumb must handle deep paths (`/portal/inventory/receipts`); add a small label map for known segments to avoid raw slugs like "inventory" → "Inventory" capitalization.
  - `aria-current` change in `NavLink` is consumed by every page — verify Admin and Portal nav still highlight correctly (visual regression only).
- **Mitigation / tests:** see §6.

---

## 5. Files touched (estimate)

| File | Change |
|---|---|
| `src/components/PortalShell.tsx` | Mobile Sheet, tooltips, Breadcrumb, disabled search, mobile-friendly Switch workspace |
| `src/components/AdminShell.tsx` | Mobile Sheet, Breadcrumb |
| `src/components/NavLink.tsx` | `aria-current` |
| `src/components/Breadcrumbs.tsx` *(new)* | Small helper that turns `pathname` + a label map into `Breadcrumb` markup. Shared by both shells. |
| `src/pages/PortalInventory.tsx` | Tabs strip; tabs render in both nested and root view |
| `src/pages/PortalInventoryReceipts.tsx` | Remove now-redundant "Back" buttons |
| `src/pages/PortalInventoryLedger.tsx` | Remove now-redundant "Back" button |
| `src/pages/PortalOverview.tsx` | Wrap module cards in `Link`; wire two CTA buttons to scroll handlers |
| `src/lib/workspace-storage.ts` | *(optional §F)* add `lastPortalPath` getter/setter |
| `src/pages/ProfitCenterSelector.tsx` | *(optional §F)* honor `lastPortalPath` |
| `src/hooks/use-workspace.tsx` *(maybe)* | *(optional §F)* write `lastPortalPath` on route change — actually cleaner to do this from `PortalShell` via a `useEffect` watching `location.pathname` |
| `DOCUMENTATION.md` | New "Navigation shell" subsection describing the breadcrumb helper and sub-route tabs convention |
| `src/test/example.test.tsx` | New tests (see §6) |

No `POLICY.md` change (no business rule moved).

---

## 6. Tests (per §11)

Add unit tests in `src/test/example.test.tsx`:
1. **Breadcrumbs helper** — given `/portal/inventory/receipts`, returns `[{label:"Portal",href:"/portal"},{label:"Inventory",href:"/portal/inventory"},{label:"Receipts"}]` with the last one un-linked.
2. **Breadcrumbs helper** — unknown segment falls back to humanized slug.
3. **`lastPortalPath`** *(if §F included)* — only persists paths starting with `/portal/`; rejects others.
4. **`NavLink`** — renders `aria-current="page"` when active, omits when not (uses `MemoryRouter`).

Manual QA checklist (will run in default mode):
- Resize to 375px: portal sidebar opens via Sheet on Menu tap; admin sidebar same.
- Collapse desktop sidebar: hover an icon, label tooltip appears.
- Visit `/portal/inventory/ledger`: breadcrumb shows `Portal › Inventory › Ledger`, ledger tab is active.
- Click "Production" card on Overview: navigates to `/portal/production`.
- Admin user: Portal sidebar shows "Admin"; Admin header shows "Return to portal"; both work.

---

## 7. Order of execution

1. `NavLink.tsx` `aria-current` + `Breadcrumbs.tsx` helper + tests.
2. `PortalShell.tsx` (Sheet + tooltips + Breadcrumb + disabled search + mobile Switch workspace).
3. `AdminShell.tsx` (Sheet + Breadcrumb).
4. `PortalInventory.tsx` Tabs + cleanup of "Back" buttons in the two children.
5. `PortalOverview.tsx` clickable cards + CTA scroll wiring.
6. *(optional)* §F `lastPortalPath`.
7. `DOCUMENTATION.md` update + tests pass.

Each step is independently revertable. Total expected diff: ~250 lines added, ~30 removed, no file deletions.

---

**Approve to proceed in default mode**, or tell me which of §A–F to drop / which optional items (§F, the search-input change) you'd rather keep as-is.
