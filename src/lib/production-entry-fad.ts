/**
 * FAD Production Entry orchestrator.
 *
 * Performs the multi-step save for one heat from the FAD entry screen:
 *
 *   1. createHeatLog   → row in `heat_logs`            (audit via trigger)
 *   2. recordHeatConsumption → rows in `material_consumption`
 *      (each row creates an `inventory_ledger` consumption via DB trigger)
 *   3. upsertMetallurgy → row in `heat_metallurgy`
 *
 * No transactional rollback today (Supabase JS does not expose multi-table
 * transactions). On failure mid-flight we surface which step failed and
 * leave previously-written rows in place so an operator can correct and
 * retry. Heat-log void / inventory reversal flows already exist for cleanup.
 */
import { createHeatLog } from "@/lib/production";
import { recordHeatConsumption, type ConsumptionInput } from "@/lib/inventory";
import { upsertMetallurgy, type HeatMetallurgyInput } from "@/lib/heat-metallurgy";

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

  let heatLogId: string;
  try {
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
  } catch (e) {
    throw new FadEntryError("Failed to create heat log", "heat_log", e);
  }

  if (input.consumption.length > 0) {
    try {
      await recordHeatConsumption({
        heatLogId,
        profitCenterId: input.profitCenterId,
        createdBy: input.createdBy,
        rows: input.consumption,
      });
    } catch (e) {
      throw new FadEntryError("Heat saved, but consumption rows failed to record", "consumption", e);
    }
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

  return { heatLogId, consumptionRowsWritten: input.consumption.length };
}
