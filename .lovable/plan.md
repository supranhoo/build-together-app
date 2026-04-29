## Goal

Three quality-of-life changes to the **New item** dialog (Master Data → Items):

1. **Auto-generate Item Code** — operators no longer type a code.
2. **Replace `<datalist>` (popup list) with a real Select dropdown** for Group and Subgroup so it matches the rest of the app's dropdown style.
3. **Prefill Name with the Subgroup value** — typing extra characters appends to complete the full item name.

---

## Assumptions & Pushback

- **Auto code format**: I'll use `<TYPE>-<GROUP>-<NNNN>` (e.g. `RM-ORE-0001`), zero-padded sequential per (profit_center, type, group). Sequence derived client-side from existing `materials.code` values for that PC + type + group at dialog open. Code remains **editable** (operator can override) — the field becomes a suggestion, not a lock. Edit mode keeps the existing code unchanged. *If you want a different format (e.g. include subgroup, or a global running number), say so before I build.*
- **Group/Subgroup as Select**: Free-text fallback is dropped. New groups/subgroups must be created under *Master Data → Group & Hierarchy* first. This is a behavior change — current users can type new values inline. Per Zero-Hardcoding rule (§10) this is actually more correct (admin-controlled master data). *Confirm you're OK losing inline create.*
- **Name prefill**: When Subgroup is chosen and the Name field is either empty OR still equals the previous subgroup value (i.e. operator hasn't customized it), Name is replaced with the new Subgroup. Operator's manual edits are preserved.

---

## Pre-Implementation Risk & Impact

| Area | Impact |
|---|---|
| Data | None — no schema change. `materials.code` still stored as-is. |
| Workflow | Operators stop typing codes; admins must pre-create groups/subgroups. |
| UI/UX | Dialog uses consistent `<Select>` styling; matches Type/UOM dropdowns. |
| Regression | CSV bulk upload still accepts user-supplied codes (unchanged). Edit flow preserves existing codes. |
| Mitigation | Unit tests for code generator; tests for name-prefill heuristic. |

---

## Changes

### 1. `src/lib/master-items-code.ts` (new)
Pure helper:
```ts
export function nextItemCode(
  existing: Pick<MasterItem,"code"|"type"|"groupName">[],
  type: MaterialType, group: string
): string
```
Scans existing codes matching the `<TYPE>-<GROUP>-` prefix, finds max numeric suffix, returns `+1` zero-padded to 4 digits. Falls back to `0001` if none.

### 2. `src/pages/AdminMasterItems.tsx`
- Remove `<Input>` for Code in **new** mode; show read-only display of generated code. Keep editable input in **edit** mode.
- Replace `<GroupSubgroupPicker>` with two `<Select>` dropdowns (shadcn Select, same as Type/UOM):
  - Group options = `groups.map(g => g.parentGroup)` (deduped, active only).
  - Subgroup options = `groups.filter(g => g.parentGroup === form.groupName).map(g => g.subgroup)` (non-null, deduped).
- In `handleGroupChange`: also recompute and set `form.code` (auto), and clear subgroup.
- In `handleSubgroupChange`: also recompute `form.code`, and prefill `form.name` if name is empty or equals previous subgroup.
- In `handleTypeChange`: recompute `form.code`.

### 3. `src/test/master-items-code.test.ts` (new)
- `nextItemCode` returns `RM-ORE-0001` when no existing codes.
- Increments past `RM-ORE-0007` → `RM-ORE-0008`.
- Ignores codes from other types/groups.
- Handles non-numeric/legacy codes gracefully (skips them).

### 4. `src/test/master-items-name-prefill.test.ts` (new)
Pure helper extracted into the new file or co-located:
```ts
export function nextItemName(currentName: string, prevSubgroup: string, nextSubgroup: string): string
```
Tests:
- Empty name + subgroup "Mn-Ore" → "Mn-Ore".
- Name equals prevSubgroup → replaced with new subgroup.
- Name customized ("Mn-Ore HG") → preserved.

### 5. Documentation
- **DOCUMENTATION.md** — note auto-code generator, Select-based pickers, name prefill heuristic.
- **POLICY.md** — record: "Item codes are auto-generated as `<TYPE>-<GROUP>-<NNNN>`; admins may override on edit. Group/Subgroup must exist in Master Data → Group & Hierarchy before creating items (no inline create)."

---

## Out of Scope

- Changing the code format pattern (configurable prefixes, custom counters).
- Removing `GroupSubgroupPicker` from other call sites — only the New Item dialog switches to Select. The picker file stays for any other usages (I'll grep & confirm during build; if AdminMasterItems is the only consumer I'll delete it).
- CSV import format — unchanged.
