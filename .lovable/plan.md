## Problem

`heat_logs` has `UNIQUE (profit_center_id, furnace_id, heat_number)`. The FAD entry form always calls `createHeatLog` (INSERT). Once the operator clicks **Save Draft** the first time, every subsequent save of the same heat number — whether another draft save or the final **Submit to Plant Head** — fails with `Failed to create heat log` (the red toast in the screenshot).

`heat_metallurgy.upsertMetallurgy` already handles this correctly (update while `status='draft'`, block once `status='submitted'`). We need the same behaviour at the heat_log + consumption level.

## Goal

Operator can press **Save Draft** any number of times on the same heat. Each press overwrites the prior draft. Once **Submit to Plant Head** runs successfully, the heat is locked and any further save attempt is rejected with a clear message.

## Approach

### 1. `src/lib/production.ts` — add lookup + update helpers (no behaviour change to existing callers)

- `findHeatLogByNumber(profitCenterId, furnaceId, heatNumber)` → returns `{ id, isVoided } | null`.
- Extend `updateHeatLog` to also accept `furnaceId`, `shiftId`, `tapTime` (today it only updates a subset).

### 2. `src/lib/inventory.ts` — add `replaceHeatConsumption`

- Deletes existing rows in `material_consumption` for the given `heat_log_id`, then inserts the new payload.
- The existing ledger trigger on `material_consumption` already reverses the inventory ledger on row delete and writes new consumption on insert, so stock stays consistent.
- If no ledger-reversal trigger exists for deletes, we fall back to: fetch existing rows, call the existing reversal path used by the void-heat flow, then insert fresh rows. (We will confirm by reading the trigger before writing code.)

### 3. `src/lib/production-entry-fad.ts` — orchestrator becomes upsert-aware

New flow inside `submitFadEntry`:

```text
1. Look up existing heat_log by (pc, furnace, heat_number).
2. If found:
     a. Read its current metallurgy status.
        - status='submitted'  → throw FadEntryError("Heat already submitted to Plant Head", "heat_log")
     b. Update heat_log fields (tap_time, weight, power, notes, shift).
     c. replaceHeatConsumption(heat_log_id, rows).
   Else:
     a. createHeatLog (existing path).
     b. recordHeatConsumption (existing path).
3. upsertMetallurgy (already idempotent).
```

The orchestrator's public signature and return shape do not change.

### 4. UI feedback — `src/pages/PortalProductionFAD.tsx`

- No structural change; existing `handleSave("draft" | "submitted")` keeps working.
- Toast copy on re-save becomes: *"Draft updated — H-XXX · N consumption rows recorded."* when an existing draft was overwritten (orchestrator returns a new `mode: "created" | "updated"` flag).
- Submit-to-Plant-Head path unchanged. Once submitted, the next attempt surfaces the new "already submitted" error from the orchestrator.

### 5. Tests (`src/test/production-entry-fad.test.ts`)

Add three cases:

- Re-saving a draft updates the existing heat_log (no second INSERT), calls `replaceHeatConsumption`, and returns `mode: "updated"`.
- Re-saving after metallurgy `status='submitted'` throws `FadEntryError` at step `heat_log`.
- First-time save still calls `createHeatLog` + `recordHeatConsumption` (regression guard).

### 6. Docs & Policy (SSOT)

- `DOCUMENTATION.md` — add version-history entry under FAD entry: draft saves are now idempotent; lock is bound to metallurgy `status='submitted'`.
- `POLICY.md` — add rule: *"A heat in draft state may be re-saved any number of times by the operator. Locking occurs only when the operator submits to Plant Head; after that no further edits are allowed without an admin void."*

## Risk & Impact

- **Data:** No schema change. We rely on the existing unique constraint and the existing ledger triggers. Consumption rows are replaced atomically per heat — stock balances re-derive from the new rows.
- **Workflow:** Submit-to-Plant-Head is still the single locking event; void/reversal flows are untouched.
- **Regression:** Other writers of `heat_logs` (heat history page, void flow, migration) are not modified. Only the FAD entry orchestrator picks up the new upsert path.
- **Mitigation:** Unit tests above + manual verification that re-saving a draft does not duplicate ledger entries.

## Out of scope

- No change to the heat-history edit screen, void flow, or admin approvals.
- No change to the unique constraint itself.
