## Goal

In the FAD Production data-entry view (`/portal/production/fad`), the right-side sticky panel currently stacks **Live Mn Balance** on top of **Live Si Balance**, making the column long and forcing scrolling. Split them into two tab previews inside the same card so the operator sees one balance at a time without losing screen real estate.

## Approach

Smallest viable change — UI-only, in `src/pages/PortalProductionFAD.tsx` (lines ~1049–1165 only). No business logic, calc, or data changes. The `calc.balance` (Mn) and `calc.siBal` (Si) computations stay exactly as they are.

## Changes

1. Wrap the right-column sticky `<Card>` content in a `<Tabs>` with two triggers: **Mn Balance** and **Si Balance**.
2. Move the existing Mn block (Total Mn Input → Balance check) into `<TabsContent value="mn">`.
3. Move the existing Si block (Live Si Balance heading → Si Recovery) into `<TabsContent value="si">`, and promote the small "Live Si Balance" sub-heading away (the tab label already names it). Keep the `factor: 2.139` chip in the Si tab header.
4. Default tab = `mn`. Tab state is local component state (no URL persistence — preview-only toggle).
5. Keep the card title "Live Balance" with the FlaskConical icon; description becomes "Real-time recovery & loss calculation".

## Out of scope

- No changes to the data-entry form on the left.
- No changes to `ferro-alloys.ts` / `silicon-balance.ts` / `production-formulas.ts`.
- No new routes, no schema changes, no test changes (behavior is unchanged; existing balance unit tests still cover the math).
- No POLICY.md / DOCUMENTATION.md changes — this is a presentation-only reorganization, not a policy change.

## Files touched

- `src/pages/PortalProductionFAD.tsx` (single block, ~lines 1049–1165)
