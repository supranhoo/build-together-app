## Goal
Expose the existing day/night toggle on the `/login` screen so unauthenticated users can switch themes before signing in. No redesign — reuse the same `ThemeToggle` component already used in `PortalShell` and `AdminShell`.

## Scope
Single file change: `src/pages/Login.tsx`.

## Placement
Top-right of the right-hand sign-in panel, fixed-position so it remains visible on both:
- Desktop (right column with form)
- Mobile (full-width form with hero background blur)

Specifically: absolutely positioned inside the right `<section>` at `top-4 right-4` (above the card, z-20), matching the circular icon-button styling already defined in `ThemeToggle` (`h-11 w-11 rounded-full border border-border bg-panel`).

The dark hero (left column, lg+) is intentionally untouched — it's a branded image overlay and the toggle on the form side controls the global theme anyway.

## Technical changes
**`src/pages/Login.tsx`**
1. Add import: `import { ThemeToggle } from "@/components/ThemeToggle";`
2. Inside the right `<section className="relative flex flex-1 ...">`, add `<ThemeToggle className="absolute right-4 top-4 z-20" />` as the first child (before the mobile background div).

That's it. No new state, no new props, no CSS changes — `ThemeProvider` already wraps the app in `App.tsx`, so the toggle works on `/login` immediately.

## Risk & impact
- **Data**: None.
- **Workflow**: None — pure presentation.
- **UI/UX**: Adds one icon button on login. Matches existing visual language (same component as portal/admin headers).
- **Regression risk**: Negligible. Absolute positioning inside an already-`relative` section; no layout reflow of the card or hero.
- **Auth/RLS**: Unaffected.

## Tests & docs
- No new unit tests needed — `ThemeToggle` and `useTheme` are already covered by `src/test/use-theme.test.ts`. This change is a placement-only integration.
- **DOCUMENTATION.md / POLICY.md (Phase 15)**: Append one line noting the toggle is also surfaced on the login screen (per-device, pre-auth presentation only — no policy change).

## Out of scope
- No toggle on the dark hero panel.
- No changes to `ResetPassword.tsx` or `Index.tsx` (can be a follow-up if requested).
- No changes to theme logic, persistence, or defaults.
