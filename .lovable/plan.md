## Goal

When a user picks a **Group** in Item Master, the Specs editor auto-populates with the right fields (Mn, Fe, etc. for ORE; FC, VM, Ash for Reductant; CaO for Fluxes / Paste). Field list stays Admin-controlled — no values are hardcoded in app code.

## Pushback / Decisions to confirm

1. **Group-only vs Type+Group+Subgroup.** The previous turn set up `spec_templates` keyed by `(Type + Group + Subgroup)` with a manual "Apply template" button. Your new spec is **Group-only + automatic**. Resolution proposed: keep the existing table shape (Type+Group+Subgroup is more flexible long-term) but treat your request as **"any template whose Group matches and whose Subgroup is blank applies automatically when Type is unset/any"**. Concretely the lookup becomes: exact (Type+Group+Subgroup) → (Type+Group, blank subgroup) → **(any Type, Group, blank subgroup)** → none. Seed rows for ORE/Reductant/Fluxes/Paste will be inserted with `type='RM'`, `subgroup=''` so they match the common case automatically. (Rule #10: still zero hardcoding — admin can edit/disable these seeded rows from the UI.)

2. **Auto vs manual apply.** Switching to fully automatic means: the moment Group changes, the spec rows are **replaced** with the matching template's fields, **preserving any values the operator already typed for the same key** (case-insensitive). The "Apply template" button is removed. Risk: if the operator typed extra free-form rows, they will be **kept appended** at the end (same merge logic that already exists in `applyTemplateToRows`). No data loss.

3. **Editing existing items.** When opening an existing item whose Group already has a template, we will NOT auto-overwrite on open (would surprise the user). Auto-apply fires only when the operator **changes** the Group field. On open, existing JSON loads as-is (unchanged from today's lazy migration).

## Scope (surgical)

### Data — seed only, no schema change
Insert four rows into `spec_templates` per active profit center, using a one-off migration that runs `INSERT … ON CONFLICT DO NOTHING`:

| Type | Group     | Subgroup | Fields |
|------|-----------|----------|--------|
| RM   | ORE       | ''       | Mn, Moisture, Fe, SiO₂, CaO, Al₂O₃, MgO, P, S — all numeric, %, range 0–100, required |
| RM   | Reductant | ''       | FC, Moisture, VM, Ash — all numeric, %, range 0–100, required |
| RM   | Fluxes    | ''       | CaO — numeric, %, 0–100, required |
| RM   | Paste     | ''       | CaO — numeric, %, 0–100, required |

Field metadata stays in `fields` JSONB (existing shape — no migration). Admin can edit/add/remove from `Master Data → Specifications` exactly as today.

### Code

**`src/lib/spec-templates.ts`**
- Extend `findTemplateForNature` with a third fallback: when `type` is empty/null, match `(group, subgroup='')` regardless of type. Keeps backward compatibility — the first two fallbacks fire first.

**`src/pages/AdminMasterItems.tsx`**
- Replace `<div>Group</div><Input>` with a `<Select>` populated from `groupOptions` (existing memoized list) + free-text fallback for new groups. Keeps current UX for items not yet templated.
- On Group change: compute `matchedTemplate` (already present); if found, call `applyTemplateToRows` and replace `form.specRows`. Skip if editing an existing item on first open (guard with a `didAutoApplyRef`).
- Remove the "Apply template" button + the "No template defined" hint banner. Replace with a small read-only line: *"Specs auto-loaded from Group template (admin can edit fields under Master Data → Specifications)."* shown only when a template matched.

**`POLICY.md` + `DOCUMENTATION.md`** (Rule #5 — atomic update)
- Update the spec-templates section: lookup precedence now includes "(any Type, Group, blank subgroup)"; mapping is now **automatic on Group change**, not manual; existing-item edit flow preserved.
- Add the four seeded templates to the policy reference list with a note that admin can edit/disable.

### Tests (Rule #11)

**`src/test/spec-templates.test.ts`** — extend:
- Lookup falls back to (any Type, Group, '') when Type is unset.
- Lookup still prefers exact (Type, Group, Subgroup) when present.
- `applyTemplateToRows` preserves operator values across auto-apply.

**New `src/test/master-items-auto-spec.test.tsx`** — render `AdminMasterItems` form, change Group select, assert spec rows are replaced with seeded ORE fields and operator-typed values for matching keys are preserved.

## Risk & Impact

- **Data**: seed inserts only; idempotent via unique key `(profit_center_id, type, group_name, subgroup)`. Zero impact on `materials.specs`. No RLS change (existing policies already cover `spec_templates`).
- **Workflow**: changing Group on an in-progress new item now resets specs → mitigated by the merge that preserves matching keys; the operator can also undo by switching back. Existing items only auto-apply when the operator actively changes Group.
- **UI**: one Input → Select swap, one banner removed. No layout shift.
- **Regression**: manual "Apply template" path goes away. Anyone relying on subgroup-specific templates is unaffected (those still take precedence). Admin → Specifications page is unchanged.

## Out of scope

- Per-tenant override of seeded values (admin edits the seeded rows directly — same UX as any other template).
- Backfilling existing items' `materials.specs` to match the new template (still **lazy**, per the prior decision).
- New `Specification_Master` / `Item_Specification_Map` tables — your message describes those as the conceptual model; we already realize the same model with `spec_templates` (master) + `materials.specs` JSONB (per-item map). Splitting into a separate map table would add a join with no functional gain right now and break every downstream reader. Flagging in case you want a separate table anyway — say the word and I'll plan the migration + reader rewrites separately.
