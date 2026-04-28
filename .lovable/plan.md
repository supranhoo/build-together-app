## Goal

On the **FAD Production Entry → Reductant** step, allow operators to manually type **FC %, VM %, Ash %, Moisture %** values from the shift's Quality Lab report. Item-Master values still prefill the row when a reductant is picked, but operators can overwrite them.

Ore, Flux, and Paste behaviour stays unchanged (Item-Master locked, as before).

---

## Why

Reductant chemistry (Coke / Coal / Char) varies meaningfully batch-to-batch — the QC Lab issues a fresh report each shift. Item-Master values are only nominal grade specs, not actual lot values. Locking the fields forced operators to either skip heats or get an admin to re-edit the Item Master per shift, which is wrong.

Ore and Flux specs are stable enough to keep locked.

---

## What changes (user-visible)

1. **Reductant table cells become editable inputs again** for Moisture %, FC %, VM %, Ash %.
2. **Prefill on material pick** — values are populated from the Item Master so operators only have to type the deltas the QC report shows.
3. **"QC override" badge** — when a value differs from the Item-Master baseline by more than 0.01 %, a small amber `QC` chip appears next to the cell with a tooltip showing the baseline.
4. **Save Draft / Submit no longer blocked** by missing reductant specs — operator-typed values count.
5. **Audit trail** — the saved heat record stores both the Item-Master baseline and the entered value per reductant row, so QC and audits can review deviations later.

Ore, Flux, Paste sections: **no change** — still locked to Item Master, still gated.

---

## Technical plan

### Files to edit
- `src/lib/fad-spec-resolver.ts` — drop `reductant` from `FAD_REQUIRED_SPECS` (becomes `[]`); keep the resolver returning `mnPct/moisturePct/fcPct/vmPct/ashPct` for prefill use. Ore and Flux stay required.
- `src/pages/PortalProductionFAD.tsx`
  - Restore `<Input type="number">` cells for the 4 reductant chemistry columns (`moisturePct`, `fcPct`, `vmPct`, `ashPct`); wire to existing `updateRow(setReductantRows, …)`.
  - On `onPickReductantMaterial`, also store baseline values in a new sibling field `baseline: { fcPct, vmPct, ashPct, moisturePct }` on the row (no schema change — purely client state).
  - Add a small `QC` badge component beside each cell when `Math.abs(current − baseline) > 0.01`.
  - Drop reductant rows from the `specErrors` memo so they no longer disable Save.
- `src/lib/production-entry-fad.ts` (`submitFadEntry`)
  - Persist the per-row baseline + entered value pair in the existing consumption payload's `notes` / metadata field (no DB migration; uses the JSON column already present on consumption rows).
  - Remove the reductant-required-spec validation it currently performs.

### Files to add
- `src/test/fad-reductant-manual-entry.test.ts` — covers:
  1. Prefill populates baseline + current from Item Master.
  2. Operator override is preserved through `submitFadEntry`.
  3. Override delta > 0.01 flags QC; <= 0.01 does not.
  4. Empty reductant cells no longer block submission (only Ore/Flux/Paste still gate).

### Files to update
- `DOCUMENTATION.md` — Production Entry → Reductant section: change "locked, Item-Master only" to "prefilled from Item Master, operator may override per QC Lab report; overrides are stored on the heat record".
- `POLICY.md` — supersede the 2026-04-28 lock-down clause for **reductants only**. Ore and Flux stay locked. Add a new clause: *"Reductant chemistry on a heat may deviate from Item-Master; the entered value is the system of record for that heat. Item-Master baseline is retained for audit."*

### What stays the same
- Ore Mn % / Moisture % — locked.
- Flux Moisture % — locked.
- Paste — qty only.
- All existing tests for Ore/Flux/Paste validation.
- DB schema — no migration.

---

## Risk & impact

| Area | Impact |
|---|---|
| Data | None — reuses existing JSON metadata column on consumption rows. |
| Workflow | Operator can now save heats QC-Lab-style; previously stuck behind admin Item-Master edits. |
| UI/UX | 4 cells per reductant row become editable; one new amber chip. |
| Regression | Low — change is scoped to reductant section; Ore/Flux/Paste paths untouched. New tests pin behaviour. |
| Mitigation | Override badge + persisted baseline give QC/audit full visibility into deviations. |

---

## Out of scope

- No QC Lab report import / upload (manual typing only, per current request).
- No change to Ore or Flux locking.
- No new role or permission — uses existing FAD entry permission.
