# Plan: Lock FAD spec fields to item-master values

## Problem (from screenshot + code audit)

On `Portal → Production → FAD`, the four consumption sections (Mn Ore, Reductant, Flux, Paste) show editable inputs for **Mn %, Moisture %, FC %, VM %, Ash %**. Two defects:

1. **Manual override allowed.** Operators can type any number, breaking the rule that item specs are the single source of truth for chemistry. Mn balance & recovery then disagree with QC and costing.
2. **Prefill is broken.** `onPickOreMaterial` reads spec keys `mnPct` / `moisturePct`, but items actually store `Mn` / `Moisture` (see `FIXED_SPEC_COLUMNS` and `getSpecValue` aliases). Result: picking SIN-001 leaves Mn=0, Moisture=0 — exactly what the screenshot shows — and the operator is forced to type values manually.

## Goal

When a material is selected in any FAD consumption row:
- Chemistry/proximate fields (Mn %, Moisture %, FC %, VM %, Ash %) are **prefilled from the item's stored specs** using the same alias-tolerant lookup the rest of the app uses.
- Those fields are **read-only** (display, not `<Input>`), with a small "from item spec" hint.
- If the picked item is missing a required spec, the row shows an inline error and the heat cannot be saved/submitted (Rule #4 / #6 — block, don't silently zero).
- Operator only enters **quantities** (and unit for reductant).

No schema changes. No new tables. Specs continue to live in `materials.specs`.

## Scope (surgical)

### `src/pages/PortalProductionFAD.tsx`
- Replace ad-hoc `specNum(item, "mnPct")` lookups with the canonical `getSpecValue` from `@/lib/spec-columns` (handles `Mn`, `mn`, `Manganese`, `mn_pct`, `Mn %`, etc.).
- In `onPickOreMaterial` / `onPickReductantMaterial` / `onPickFluxMaterial`: resolve specs once and store on the row; if any required spec is missing, leave it `null` (not 0) so we can flag it.
- Render the chemistry cells as plain text (e.g. `38.0 %`) instead of `<Input>`. Keep the trash + material picker + qty `<Input>` editable.
- Add a row-level validation: missing required spec → red badge "Spec missing — update item master" + disable Save/Submit.
- Update the `mnInputCalc` lookup map to feed values from the resolved row (no behavior change to `ferro-alloys.ts`).

### `src/lib/production-entry-fad.ts`
- Add a guard in `submitFadEntry` that rejects any consumption row whose source item is missing a required spec for its kind (`ore → Mn, Moisture`; `reductant → FC, VM, Ash, Moisture`; `flux → Moisture`). Throw `FadEntryError(..., "consumption")`. Defense-in-depth so the API can't be bypassed even if the UI guard regresses.

### Required-spec contract per kind
| Kind | Required specs | Optional |
|---|---|---|
| Ore | Mn, Moisture | Fe, SiO2, CaO, Al2O3, MgO, P, S, Size |
| Reductant | FC, VM, Ash, Moisture | S |
| Flux | Moisture | CaO, MgO, SiO2 |
| Paste | — (qty only) | — |

These keys match `FIXED_SPEC_COLUMNS` exactly, so any item already maintained in Item Master / Item Catalogue will just work.

### Tests (new — `src/test/production-fad-prefill.test.ts`)
1. `resolveItemSpecs(oreItem)` returns Mn/Moisture from canonical keys.
2. Same, with legacy alias keys (`mn_pct`, `moisture_pct`).
3. Missing required spec → returns null + flag.
4. `submitFadEntry` rejects ore row whose item has no Mn spec, with `step: "consumption"`.
5. Reductant row missing FC blocks submission.
6. Flux row missing Moisture blocks submission.
7. Paste row with only qty is accepted (no chemistry required).

Existing 469 tests keep passing — no public API changes to `ferro-alloys.ts`, `inventory.ts`, or `heat-metallurgy.ts`.

## Out of scope (deferred)
- The 4-tab Item Catalogue editor (PoC already shipped) is unchanged. This task only **enforces** that FAD reads from those specs.
- No migration of existing draft heats.
- No change to recovery formulas; only the inputs become trustworthy.

## Documentation & Policy (Rule #5 — same response)
- `DOCUMENTATION.md`: under "Production Entry – FAD", add subsection "Spec source of truth" describing prefill + read-only behavior + required-spec table + version-history bump.
- `POLICY.md`: add rule "FAD consumption chemistry MUST come from Item Master specs. Operators cannot override Mn %, Moisture %, FC %, VM %, Ash % at entry. Items missing required specs block heat submission."

## Risk & impact
- **Data**: none — read-only display change + a save guard. No DB migration.
- **Workflow**: operators who today type chemistry will now be blocked when items lack specs. Mitigation: error message tells them which item + which spec is missing; admins fix it once in Item Master and the heat saves.
- **Regression**: low. `ferro-alloys.ts` math unchanged; only the values fed to it change source (item spec vs row input). All existing FAD tests cover the math path.
- **UI**: minor — five inputs become text labels per row.
