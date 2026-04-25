/**
 * Production rollup helpers.
 *
 * Pure derivations over the SSOT (`heat_logs` + `heat_metallurgy` +
 * `material_consumption`). Used by the PortalProduction KPI strip and
 * future report widgets. NO I/O, NO React — fully unit-testable.
 *
 * Per POLICY §19, all production KPIs MUST come from these tables. No
 * forked production_logs schema — see DOCUMENTATION.md "Production SSOT".
 */
import type { HeatLog } from "@/lib/production";
import type { HeatMetallurgy } from "@/lib/heat-metallurgy";
import { mnBalance, type MaterialSpecLookup } from "@/lib/ferro-alloys";

export interface ProductionKpis {
  /** Sum of weight_mt across non-voided heats. */
  totalProductionMt: number;
  /** Count of non-voided heats. */
  heatCount: number;
  /** Sum of power_mwh across non-voided heats. */
  totalPowerMwh: number;
  /** Avg kWh per MT (power_mwh × 1000 / weight_mt). null when no production. */
  avgKwhPerMt: number | null;
  /**
   * Production-weighted average recovery % across heats with metallurgy.
   * null when nothing measured yet.
   */
  avgRecoveryPct: number | null;
  /** Heats that have a metallurgy row attached. */
  heatsWithMetallurgy: number;
}

/**
 * Compute production KPIs from heat logs + their metallurgy rows.
 *
 * Voided heats are excluded entirely. Heats without metallurgy still count
 * toward production / power, but contribute nothing to recovery.
 */
export function computeProductionKpis(
  logs: HeatLog[],
  metallurgyByHeatId: Map<string, HeatMetallurgy>,
): ProductionKpis {
  let totalMt = 0;
  let totalMwh = 0;
  let heatCount = 0;
  let recoveryNum = 0; // sum of recovery × productionMt for the weighted avg
  let recoveryDen = 0; // sum of productionMt that contributed
  let heatsWithMet = 0;

  for (const log of logs) {
    if (log.isVoided) continue;
    heatCount += 1;
    const mt = log.weightMt ?? 0;
    const mwh = log.powerMwh ?? 0;
    totalMt += mt;
    totalMwh += mwh;

    const met = metallurgyByHeatId.get(log.id);
    if (met && mt > 0 && met.fgMnPct !== null && met.fgMnPct > 0) {
      heatsWithMet += 1;
      // Recovery here uses metal Mn / fg Mn assumption only when input Mn is
      // unknown at rollup time. Per-heat recovery comes from the live entry
      // screen which has consumption rows; for the dashboard we approximate
      // recovery as (metalMn / (metalMn + slagMn + dustMn)) × 100 — i.e.
      // share of Mn ending up in metal vs measured losses. This is a
      // dashboard-only approximation; the entry screen's mnBalance() is
      // authoritative.
      const balance = mnBalance({
        inputMn: 0, // unknown at rollup — fall through to the local calc below
        productionMt: mt,
        fgMnPct: met.fgMnPct,
        slagQty: met.slagQtyMt ?? 0,
        slagMnoPct: met.slagMnoPct ?? 0,
        dustQty: met.dustQtyMt ?? 0,
        dustMnPct: met.dustMnPct ?? 0,
      });
      const denom = balance.metalMn + balance.slagMn + balance.dustMn;
      if (denom > 0) {
        const approxRecovery = (balance.metalMn / denom) * 100;
        recoveryNum += approxRecovery * mt;
        recoveryDen += mt;
      }
    }
  }

  return {
    totalProductionMt: totalMt,
    heatCount,
    totalPowerMwh: totalMwh,
    avgKwhPerMt: totalMt > 0 ? (totalMwh * 1000) / totalMt : null,
    avgRecoveryPct: recoveryDen > 0 ? recoveryNum / recoveryDen : null,
    heatsWithMetallurgy: heatsWithMet,
  };
}

/**
 * Index a list of metallurgy rows by their `heatLogId` for O(1) lookup.
 */
export function indexMetallurgyByHeat(rows: HeatMetallurgy[]): Map<string, HeatMetallurgy> {
  const map = new Map<string, HeatMetallurgy>();
  for (const r of rows) map.set(r.heatLogId, r);
  return map;
}

/**
 * Energy deviation check vs. a configured kWh/MT target.
 * Returns the absolute % deviation, or null when target/actual are unusable.
 */
export function kwhDeviationPct(actualKwhPerMt: number | null, targetKwhPerMt: number | null | undefined): number | null {
  if (actualKwhPerMt === null || actualKwhPerMt === undefined) return null;
  if (!targetKwhPerMt || !Number.isFinite(targetKwhPerMt) || targetKwhPerMt <= 0) return null;
  return Math.abs((actualKwhPerMt - targetKwhPerMt) / targetKwhPerMt) * 100;
}
