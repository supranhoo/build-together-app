import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import {
  computeStockBalances,
  fetchLedger,
  type InventoryLedgerEntry,
} from "@/lib/inventory";
import {
  fetchMasterItems,
  fetchPlanningPolicy,
  fetchProductionPlan,
  type MasterItem,
  type PlanningPolicyRecord,
  type ProductionPlanRecord,
} from "@/lib/master-data";
import { fetchStandardBom } from "@/lib/finance";
import {
  classifyStockStatus,
  computeThresholdsFromPlan,
  type ComputedThreshold,
  type StockStatus,
  type StockThreshold,
} from "@/lib/inventory-min-max";
import { Link } from "react-router-dom";

function statusBadge(s: StockStatus) {
  switch (s) {
    case "below_min": return <Badge variant="destructive">Below min</Badge>;
    case "reorder": return <Badge variant="secondary">Reorder</Badge>;
    case "over_max": return <Badge variant="outline">Over max</Badge>;
    case "ok": return <Badge variant="outline">OK</Badge>;
    case "unconfigured":
    default: return <Badge variant="outline" className="opacity-60">No thresholds</Badge>;
  }
}

function sourceBadge(src: ComputedThreshold["source"]) {
  if (src === "plan") return <Badge variant="secondary">Plan + BOM</Badge>;
  if (src === "manual") return <Badge variant="outline">Manual override</Badge>;
  return <Badge variant="outline" className="opacity-60">Unconfigured</Badge>;
}

export default function PortalInventoryMinMax() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const [items, setItems] = useState<MasterItem[]>([]);
  const [ledger, setLedger] = useState<InventoryLedgerEntry[]>([]);
  const [plan, setPlan] = useState<ProductionPlanRecord[]>([]);
  const [policy, setPolicy] = useState<PlanningPolicyRecord[]>([]);
  const [bom, setBom] = useState<Array<{ materialId: string; grade: string; stdQtyPerMt: number; isActive: boolean }>>([]);

  const reload = async () => {
    if (!activeProfitCenter) return;
    try {
      const [m, le, pl, po, bo] = await Promise.all([
        fetchMasterItems(activeProfitCenter.id),
        fetchLedger(activeProfitCenter.id),
        fetchProductionPlan(activeProfitCenter.id).catch(() => [] as ProductionPlanRecord[]),
        fetchPlanningPolicy(activeProfitCenter.id).catch(() => [] as PlanningPolicyRecord[]),
        fetchStandardBom(activeProfitCenter.id).catch(() => []),
      ]);
      setItems(m); setLedger(le); setPlan(pl); setPolicy(po);
      setBom(
        bo.map((r: any) => ({
          materialId: r.materialId,
          grade: r.grade,
          stdQtyPerMt: Number(r.stdQtyPerMt),
          isActive: Boolean(r.isActive ?? true),
        })),
      );
    } catch (e) {
      toast({ title: "Failed to load", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id]);

  const balances = useMemo(() => computeStockBalances(ledger), [ledger]);
  const totalForItem = (id: string) =>
    balances.filter((b) => b.materialId === id).reduce((s, b) => s + b.quantity, 0);

  /**
   * Manual fallback map preserves the historical per-item edits stored on
   * `materials.min_level / max_level / reorder_level`. They take effect only
   * when no plan + BOM combination produces a derived value.
   */
  const manualFallback = useMemo(() => {
    const m = new Map<string, StockThreshold>();
    items.forEach((it) =>
      m.set(it.id, { minLevel: it.minLevel, reorderLevel: it.reorderLevel, maxLevel: it.maxLevel }),
    );
    return m;
  }, [items]);

  const computed = useMemo(
    () => computeThresholdsFromPlan(
      plan.map((p) => ({ periodMonth: p.periodMonth, grade: p.grade, plannedMt: p.plannedMt, isActive: p.isActive })),
      bom,
      policy.map((p) => ({ materialId: p.materialId, minCoverDays: p.minCoverDays, reorderCoverDays: p.reorderCoverDays, maxCoverDays: p.maxCoverDays })),
      manualFallback,
    ),
    [plan, bom, policy, manualFallback],
  );

  const thresholdByMat = useMemo(() => {
    const m = new Map<string, ComputedThreshold>();
    computed.forEach((c) => m.set(c.materialId, c));
    return m;
  }, [computed]);

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader>
        <CardTitle>Min / Max stock thresholds</CardTitle>
        <p className="text-sm text-muted-foreground">
          Thresholds are derived automatically from the active production plan,
          the Standard BOM, and the workspace cover-day policy (default 7 / 14 / 30 days).
          Manual values on the Item Master are used only as a fallback when no plan exists.
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead className="text-right">Daily use</TableHead>
              <TableHead className="text-right">Min</TableHead>
              <TableHead className="text-right">Reorder</TableHead>
              <TableHead className="text-right">Max</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const qty = totalForItem(item.id);
              const t = thresholdByMat.get(item.id) ?? {
                materialId: item.id,
                source: "unconfigured" as const,
                dailyConsumption: 0,
                minLevel: null, reorderLevel: null, maxLevel: null,
              };
              const status = classifyStockStatus(qty, t);
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.code} — {item.name} ({item.uom})</TableCell>
                  <TableCell className="text-right">{qty.toFixed(3)}</TableCell>
                  <TableCell className="text-right">{t.dailyConsumption ? t.dailyConsumption.toFixed(3) : "—"}</TableCell>
                  <TableCell className="text-right">{t.minLevel ?? "—"}</TableCell>
                  <TableCell className="text-right">{t.reorderLevel ?? "—"}</TableCell>
                  <TableCell className="text-right">{t.maxLevel ?? "—"}</TableCell>
                  <TableCell>{sourceBadge(t.source)}</TableCell>
                  <TableCell>{statusBadge(status)}</TableCell>
                </TableRow>
              );
            })}
            {items.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-muted-foreground">No items configured.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
