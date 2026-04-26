/**
 * Procurement Dashboard tab — Phase D.
 *
 * Read-only KPI roll-up across the procurement module. Pulls from the same
 * services that power each functional tab (no duplicate aggregation in the DB
 * — keeps SSOT). The pure aggregation lives in `buildDashboardKpis` and is
 * unit-tested.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  FileText,
  RefreshCw,
  ShieldAlert,
  Ship,
  ShoppingCart,
  TrendingUp,
  Users,
} from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import { fetchMasterItems } from "@/lib/master-data";
import { fetchLedger, computeStockBalances } from "@/lib/inventory";
import { AccentKpiCard } from "@/components/ui/accent-kpi-card";
import {
  buildDashboardKpis,
  computeShortages,
  fetchImportShipments,
  fetchOpenPoLinesForMrp,
  fetchPurchaseOrders,
  fetchPurchaseRequisitions,
  fetchRiskEvents,
  fetchSupplierEvaluations,
  fetchSuppliers,
  type ProcurementDashboardKpis,
} from "@/lib/procurement";

export function DashboardTab() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const [kpis, setKpis] = useState<ProcurementDashboardKpis | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!activeProfitCenter) return;
    setLoading(true);
    try {
      const [
        prs, pos, shipments, suppliers, masterItems, ledger, openPo, risks, evaluations,
      ] = await Promise.all([
        fetchPurchaseRequisitions(activeProfitCenter.id),
        fetchPurchaseOrders(activeProfitCenter.id),
        fetchImportShipments(activeProfitCenter.id),
        fetchSuppliers(activeProfitCenter.id),
        fetchMasterItems(activeProfitCenter.id),
        fetchLedger(activeProfitCenter.id),
        fetchOpenPoLinesForMrp(activeProfitCenter.id),
        fetchRiskEvents(activeProfitCenter.id),
        fetchSupplierEvaluations(activeProfitCenter.id),
      ]);

      const balances = computeStockBalances(ledger);
      const onHand = new Map<string, number>();
      for (const b of balances) onHand.set(b.materialId, (onHand.get(b.materialId) ?? 0) + b.quantity);

      const shortages = computeShortages(
        masterItems.map((m) => ({
          id: m.id, code: m.code, name: m.name, uom: m.uom,
          minLevel: m.minLevel, maxLevel: m.maxLevel, reorderLevel: m.reorderLevel,
          isActive: m.isActive,
        })),
        onHand,
        openPo.map,
      );

      setKpis(buildDashboardKpis({ prs, pos, shipments, suppliers, shortages, risks, evaluations }));
    } catch (e) {
      toast({ title: "Failed to load dashboard", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfitCenter?.id]);

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardHeader><CardTitle>Dashboard</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">Select a workspace first.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Procurement Dashboard — {activeProfitCenter.name}</CardTitle>
            <CardDescription>
              Live roll-up across PRs, POs, shipments, MRP shortages, supplier scores and risk events.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {loading || !kpis ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              <AccentKpiCard
                module="procurement" icon={FileText}
                title="Open PRs" value={String(kpis.prsOpen)}
                sub={`${kpis.prsAwaitingApproval} awaiting approval`}
              />
              <AccentKpiCard
                module="procurement" icon={ShoppingCart}
                title="Open POs" value={String(kpis.posOpen)}
                sub={
                  Object.keys(kpis.posValueOpen).length === 0
                    ? "No open value"
                    : Object.entries(kpis.posValueOpen)
                        .map(([cur, val]) => `${cur} ${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}`)
                        .join(" · ")
                }
              />
              <AccentKpiCard
                module="procurement" icon={Ship}
                title="Shipments In Transit" value={String(kpis.shipmentsInTransit)}
                sub={`${kpis.shipmentsCustoms} in customs`}
              />
              <AccentKpiCard
                module="procurement" icon={Users}
                title="Active Suppliers" value={String(kpis.suppliersActive)}
              />
              <AccentKpiCard
                module="procurement" icon={AlertTriangle}
                title="Shortages: Below Min" value={String(kpis.shortagesBelowMin)}
                sub={`${kpis.shortagesReorder} at reorder`}
              />
              <AccentKpiCard
                module="procurement" icon={ShieldAlert}
                title="Open Risks" value={String(kpis.risksOpen)}
                sub={`${kpis.risksCritical} critical`}
              />
              <AccentKpiCard
                module="procurement" icon={TrendingUp}
                title="Avg Supplier Score"
                value={kpis.avgSupplierScore === null ? "—" : kpis.avgSupplierScore.toFixed(1)}
                sub="Latest evaluation per supplier"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About this dashboard</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="ml-5 list-disc space-y-1">
            <li>Counts are computed from the same services that power each tab — no duplicate aggregation tables.</li>
            <li>Shortages use min/reorder/max levels from the materials master and on-order from open POs.</li>
            <li>Avg supplier score uses the most recent evaluation per supplier in the active workspace.</li>
            <li>Open PO value is grouped by currency (no FX consolidation here — see Reports for landed-cost rollup).</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
