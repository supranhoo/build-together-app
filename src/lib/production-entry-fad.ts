/**
 * FAD Production Entry orchestrator.
 *
 * Phase 1 (audit): rewritten on top of the `submit_fad_entry` PL/pgSQL RPC.
 * The RPC executes the entire save in ONE database transaction:
 *   1. INSERT or UPDATE heat_logs (respecting voided + submitted locks)
 *   2. Reverse + delete prior material_consumption (on re-save)
 *   3. INSERT new material_consumption rows (the BEFORE INSERT trigger
 *      writes the matching inventory_ledger entry, enforcing UOM = master)
 *   4. UPSERT heat_metallurgy (refusing to overwrite a 'submitted' row)
 *
 * If any step fails, Postgres rolls the whole transaction back. There is no
 * longer a window where heat_logs is written but consumption / metallurgy
 * are missing.
 *
 * The public TypeScript signature is unchanged — callers keep working.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ConsumptionInput } from "@/lib/inventory";
import type { HeatMetallurgyInput } from "@/lib/heat-metallurgy";

const client = supabase as unknown as {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

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
  constructor(
    message: string,
    public readonly step: "heat_log" | "consumption" | "metallurgy",
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "FadEntryError";
  }
}

/**
 * Phase 1.5: SQLSTATE-driven mapping.
 *
 * The RPC and trigger now raise dedicated custom SQLSTATE codes:
 *   FAD01 = heat_voided
 *   FAD02 = heat_submitted
 *   FAD03 = heat_number_required
 *   FAD04 = furnace_required
 *   FAD05 = shift_required
 *   FAD06 = forbidden
 *   FAD07 = unauthorized
 *   FAD08 = consumption UOM mismatch
 *   FAD09 = material missing master UOM
 *
 * We prefer `error.code` (stable across translations / phrasing changes) and
 * fall back to text matching for backward-compatibility with older DBs that
 * may still RAISE without an ERRCODE.
 */
type RpcError = { code?: string; message?: string } | string | null | undefined;

const SQLSTATE_MAP: Record<string, { message: string; step: FadEntryError["step"] }> = {
  FAD01: { message: "This heat was voided and cannot be re-saved", step: "heat_log" },
  FAD02: { message: "Heat already submitted to Plant Head and cannot be edited", step: "heat_log" },
  FAD03: { message: "Heat number is required", step: "heat_log" },
  FAD04: { message: "Furnace is required", step: "heat_log" },
  FAD05: { message: "Shift is required", step: "heat_log" },
  FAD06: { message: "You are not permitted to save heats in this workspace", step: "heat_log" },
  FAD07: { message: "You are not signed in", step: "heat_log" },
  FAD08: { message: "Consumption UOM must match the material master UOM", step: "consumption" },
  FAD09: { message: "Material has no master UOM configured", step: "consumption" },
};

function translateRpcError(err: RpcError): FadEntryError {
  const code = typeof err === "object" && err ? String(err.code ?? "").toUpperCase() : "";
  const raw = typeof err === "string" ? err : err?.message ?? "";

  // 1. SQLSTATE first (stable, version-tolerant).
  const mapped = SQLSTATE_MAP[code];
  if (mapped) return new FadEntryError(mapped.message, mapped.step);

  // 2. Legacy text fallback (only fires on older DBs without ERRCODE).
  const msg = (raw || "").toLowerCase();
  if (msg.includes("heat_voided")) return new FadEntryError(SQLSTATE_MAP.FAD01.message, "heat_log");
  if (msg.includes("heat_submitted")) return new FadEntryError(SQLSTATE_MAP.FAD02.message, "heat_log");
  if (msg.includes("heat_number_required")) return new FadEntryError(SQLSTATE_MAP.FAD03.message, "heat_log");
  if (msg.includes("furnace_required")) return new FadEntryError(SQLSTATE_MAP.FAD04.message, "heat_log");
  if (msg.includes("shift_required")) return new FadEntryError(SQLSTATE_MAP.FAD05.message, "heat_log");
  if (msg.includes("forbidden") || msg.includes("unauthorized")) {
    return new FadEntryError(SQLSTATE_MAP.FAD06.message, "heat_log");
  }
  if (msg.includes("consumption uom") || msg.includes("must match material master")) {
    return new FadEntryError(raw || SQLSTATE_MAP.FAD08.message, "consumption");
  }
  if (msg.includes("metallurgy")) return new FadEntryError(raw, "metallurgy");
  return new FadEntryError(raw || "FAD submit failed", "heat_log");
}

// Exported for tests.
export const __FAD_SQLSTATE_MAP = SQLSTATE_MAP;

export async function submitFadEntry(input: FadEntrySubmitInput): Promise<FadEntrySubmitResult> {
  // Client-side guards — keep early failure messages friendly. The RPC also
  // re-validates server-side so these are belt-and-braces only.
  if (!input.heatNumber.trim()) throw new FadEntryError("Heat number is required", "heat_log");
  if (!input.furnaceId) throw new FadEntryError("Furnace is required", "heat_log");
  if (!input.shiftId) throw new FadEntryError("Shift is required", "heat_log");
  if (
    input.consumption.some(
      (r) => !r.materialId || !r.stockLocationId || !(r.quantity > 0),
    )
  ) {
    throw new FadEntryError(
      "Every consumption row needs a material, location, and positive quantity",
      "consumption",
    );
  }

  const payload = {
    profitCenterId: input.profitCenterId,
    furnaceId: input.furnaceId,
    shiftId: input.shiftId,
    heatNumber: input.heatNumber.trim(),
    tapTime: input.tapTime,
    weightMt: input.weightMt,
    totalPowerMwh: input.totalPowerMwh,
    notes: input.notes,
    consumption: input.consumption.map((r) => ({
      materialId: r.materialId,
      stockLocationId: r.stockLocationId,
      quantity: r.quantity,
      uom: r.uom ?? "MT",
    })),
    metallurgy: input.metallurgy,
  };

  const { data, error } = await client.rpc("submit_fad_entry", { _payload: payload });
  if (error) throw translateRpcError(error.message || String(error));

  return {
    heatLogId: String(data?.heatLogId ?? ""),
    consumptionRowsWritten: Number(data?.consumptionRowsWritten ?? 0),
    mode: (data?.mode === "updated" ? "updated" : "created") as "created" | "updated",
  };
}
