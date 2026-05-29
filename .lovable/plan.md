## Goal

On `PortalProductionFAD.tsx`, the **Product Name** field is currently a free-text input defaulting to "Silico Manganese". Convert it to a **dropdown of finished-goods (FG) items** for the Ferro Alloys division, mapped through the existing **Picker Contexts** admin module so admins can control which items appear per workspace — no hardcoding.

## Scope (surgical)

UI + wiring only on the FAD entry header. No schema change. No business-logic change to costing, Mn balance, or save payload (still writes `product: productName` text to keep history compatible).

## Changes

1. **`src/pages/AdminPickerContexts.tsx`** — Add `fad.finished_good` to the known context-key catalogue (screen label: "FAD → Finished Good") so admins can configure it. Default seed: `material_type = "FG"`, `group_name = "Ferro Alloys"`, `allow_unmapped = false`.

2. **`src/pages/PortalProductionFAD.tsx`**
   - Load master items + picker contexts (already a pattern used elsewhere via `MaterialPicker`).
   - Replace the Product Name `<Input>` with `<MaterialPicker contextKey="fad.finished_good" />`.
   - On select: set `productName` to the item's name; if the item has a `typical_grade` / Mn% spec, prefill **Typical Grade** (only when user hasn't typed one).
   - Keep `productName` state and the existing `product: productName` save payload — no DB/schema change.
   - Fallback: if the resolved context returns 0 items, show a hint "No FG items mapped — ask Admin to configure Picker Context `fad.finished_good`" and keep a disabled select (do NOT silently revert to free text — that would defeat SSOT).

3. **Seed migration (data-only, optional but recommended)** — Insert one global `picker_contexts` row for `fad.finished_good` if none exists, scoped `profit_center_id IS NULL`, so every workspace works out of the box. No table changes.

4. **Tests** — Extend `src/test/picker-contexts.test.ts` with a case: given FG items tagged `type=FG, group=Ferro Alloys`, `filterMaterialsByContext` returns only those, and `groupMaterialsForPicker` buckets them under "FG › Ferro Alloys".

5. **Docs (atomic per Rule #5)**
   - `DOCUMENTATION.md`: document new context key `fad.finished_good` and the FAD header behaviour change.
   - `POLICY.md`: state that FAD Product Name MUST be selected from Item Master FG list filtered by the workspace's `fad.finished_good` picker context; free-text entry is removed.

## Out of scope

- Renaming the DB column or moving `product` to a FK (`finished_good_item_id`) — that's a larger migration, separate ticket.
- Other modules' Product/FG dropdowns (Sales, Dispatch, Quality FG) — same pattern can be applied later via their own context keys (`sales.fg`, `quality.fg`, etc.) but not in this change.

## Verification

- Admin → Master Data → Picker Contexts shows `fad.finished_good` and can edit filters.
- FAD entry page: Product Name dropdown lists only FG / Ferro Alloys items for the active workspace; selecting "Silico Manganese" populates the field and (if specced) Typical Grade.
- Existing saved heats render unchanged (text field is read from the same `product` column).
- `npm test` green including new picker-contexts case.
