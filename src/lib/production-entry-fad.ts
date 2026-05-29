/**
 * FAD Production Entry orchestrator.
 *
 * Performs the multi-step save for one heat from the FAD entry screen.
 *
 * Idempotent draft re-save:
 *   - First save  → INSERT heat_logs, INSERT material_consumption, UPSERT heat_metallurgy.
 *   - Re-save     → UPDATE heat_logs, replace material_consumption (RPC reverses prior
 *                   ledger entries then re-inserts), UPDATE heat_metallurgy.
 *   - Submitted   → the metallurgy `status='submitted'` lock blocks any further save.
 *
 * No transactional rollback today (Supabase JS does not expose multi-table
 * transactions). On failure mid-flight we surface which step failed and
 * leave previously-written rows in place so an operator can correct and
 * retry. Void / inventory-reversal flows exist for full cleanup.
 */
import { createHeatLog, findHeatLogByNumber, updateHeatLog } from "@/lib/production";
import { recordHeatConsumption, replaceHeatConsumption, type ConsumptionInput } from "@/lib/inventory";
import { upsertMetallurgy, fetchMetallurgy, type HeatMetallurgyInput } from "@/lib/heat-metallurgy";

export interface FadEntrySubmitInput {
  profitCenterId: string;
  createdBy: string;

  // Heat log
  furnaceId: string;
  shiftId: string;
  heatNumber: string;
  tapTime: string;
  weightMt: number | null;
  notes: string | null;

  // Aggregate power kept on heat_logs.power_mwh (sum of furnace + tapping + aux)
  totalPowerMwh: number | null;

  // Consumption rows already grouped & validated by the page
  consumption: ConsumptionInput[];

  // Metallurgy capture (1:1 with heat log)
  metallurgy: Omit<HeatMetallurgyInput, "heatLogId" | "profitCenterId" | "createdBy">;
}

export interface FadEntrySubmitResult {
  heatLogId: string;
  consumptionRowsWritten: number;
  mode: "created" | "updated";
}

export class FadEntryError extends Error {
  constructor(message: string, public readonly step: "heat_log" | "consumption" | "metallurgy", public readonly cause?: unknown) {
    super(message);
    this.name = "FadEntryError";
  }
}

export async function submitFadEntry(input: FadEntrySubmitInput): Promise<FadEntrySubmitResult> {
  if (!input.heatNumber.trim()) throw new FadEntryError("Heat number is required", "heat_log");
  if (!input.furnaceId) throw new FadEntryError("Furnace is required", "heat_log");
  if (!input.shiftId) throw new FadEntryError("Shift is required", "heat_log");
  if (input.consumption.some((r) => !r.materialId || !r.stockLocationId || r.quantity <= 0)) {
    throw new FadEntryError("Every consumption row needs a material, location, and positive quantity", "consumption");
  }

  // 1. Find existing heat (idempotent draft re-save).
  let existing: { id: string; isVoided: boolean } | null = null;
  try {
    existing = await findHeatLogByNumber(input.profitCenterId, input.furnaceId, input.heatNumber.trim());
  } catch (e) {
    throw new FadEntryError("Failed to look up heat log", "heat_log", e);
  }

  if (existing?.isVoided) {
    throw new FadEntryError(`Heat ${input.heatNumber} was voided and cannot be re-saved`, "heat_log");
  }

  // If a draft already exists, enforce the submission lock before we touch anything.
  if (existing) {
    try {
      const m = await fetchMetallurgy(existing.id);
      if (m?.status === "submitted") {
        throw new FadEntryError(
          `Heat ${input.heatNumber} is already submitted to Plant Head and cannot be edited`,
          "heat_log",
        );
      }
    } catch (e) {
      if (e instanceof FadEntryError) throw e;
      throw new FadEntryError("Failed to verify heat status", "heat_log", e);
    }
  }

  let heatLogId: string;
  let mode: "created" | "updated";
  try {
    if (existing) {
      await updateHeatLog(existing.id, {
        heatNumber: input.heatNumber.trim(),
        tapTime: input.tapTime,
        weightMt: input.weightMt,
        powerMwh: input.totalPowerMwh,
        notes: input.notes,
        shiftId: input.shiftId,
      });
      heatLogId = existing.id;
      mode = "updated";
    } else {
      heatLogId = await createHeatLog({
        profitCenterId: input.profitCenterId,
        furnaceId: input.furnaceId,
        shiftId: input.shiftId,
        heatNumber: input.heatNumber.trim(),
        tapTime: input.tapTime,
        weightMt: input.weightMt,
        powerMwh: input.totalPowerMwh,
        notes: input.notes,
        createdBy: input.createdBy,
      });
      mode = "created";
    }
  } catch (e) {
    throw new FadEntryError(existing ? "Failed to update heat log" : "Failed to create heat log", "heat_log", e);
  }

  try {
    if (mode === "updated") {
      await replaceHeatConsumption({ heatLogId, rows: input.consumption });
    } else if (input.consumption.length > 0) {
      await recordHeatConsumption({
        heatLogId,
        profitCenterId: input.profitCenterId,
        createdBy: input.createdBy,
        rows: input.consumption,
      });
    }
  } catch (e) {
    throw new FadEntryError("Heat saved, but consumption rows failed to record", "consumption", e);
  }

  try {
    await upsertMetallurgy({
      heatLogId,
      profitCenterId: input.profitCenterId,
      createdBy: input.createdBy,
      ...input.metallurgy,
    });
  } catch (e) {
    throw new FadEntryError("Heat & consumption saved, but metallurgy failed", "metallurgy", e);
  }

  return { heatLogId, consumptionRowsWritten: input.consumption.length, mode };
}
