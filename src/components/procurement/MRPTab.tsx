/**
 * MRP (Material Requirements Planning) tab — Phase C.
 *
 * Computes shortages from:
 *  - Materials master (min/reorder/max levels — managed in Admin → Materials)
 *  - On-hand quantities (sum of inventory_ledger per workspace)
 *  - On-order quantities (open PO lines: ordered − received)
 *
 * UI is read-only. "Create PR" deep-links to the PR tab with the material
 * pre-selected — we do NOT inline-create PRs here to keep the PR workflow as
 * the SSOT for requisition data.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Calculator, RefreshCw } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import { fetchMasterItems, type MasterItem } from "@/lib/master-data";
import { fetchLedger, computeStockBalances } from "@/lib/inventory";
import {
  computeShortages,
  fetchOpenPoLinesForMrp,
  type ShortageRow,
} from "@/lib/procurement";

export function MRPTab() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const [items, setItems] = useState<MasterItem[]>([]);
  const [shortages, setShortages] = useState<ShortageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");

  const load = async () => {
    if (!activeProfitCenter) return;
    setLoading(true);
    try {
      const [masterItems, ledger, openPo] = await Promise.all([
        fetchMasterItems(activeProfitCenter.id),
        fetchLedger(activeProfitCenter.id),
        fetchOpenPoLinesForMrp(activeProfitCenter.id),
      ]);

      const balances = computeStockBalances(ledger);
      const onHand = new Map<string, number>();
      for (const b of balances) {
        onHand.set(b.materialId, (onHand.get(b.materialId) ?? 0) + b.quantity);
      }

      const rows = computeShortages(
        masterItems.map((m) => ({
          id: m.id,
          code: m.code,
          name: m.name,
          uom: m.uom,
          minLevel: m.minLevel,
          maxLevel: m.maxLevel,
          reorderLevel: m.reorderLevel,
          isActive: m.isActive,
        })),
        onHand,
        openPo.map,
      );

      setItems(masterItems);
      setShortages(rows);
    } catch (e) {
      toast({
        title: "Failed to compute MRP",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfitCenter?.id]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return shortages;
    return shortages.filter(
      (r) => r.materialCode.toLowerCase().includes(q) || r.materialName.toLowerCase().includes(q),
    );
  }, [shortages, filter]);

  const belowMin = shortages.filter((s) => s.status === "below_min").length;
  const reorder = shortages.filter((s) => s.status === "reorder").length;
  const unconfigured = items.filter(
    (m) => m.isActive && m.minLevel === null && m.reorderLevel === null,
  ).length;

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardHeader><CardTitle>MRP</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">Select a workspace first.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            MRP — Shortage Planner
          </CardTitle>
          <CardDescription>
            Shortages computed from on-hand stock + open PO quantities against material thresholds.
          </CardDescription>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recompute
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
            <div className="text-xs text-muted-foreground">Below MIN</div>
            <div className="flex items-center gap-2 text-lg font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4" /> {belowMin}
            </div>
          </div>
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="text-xs text-muted-foreground">Below Reorder</div>
            <div className="text-lg font-semibold text-amber-700 dark:text-amber-300">{reorder}</div>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Unconfigured items (skipped)</div>
            <div className="text-lg font-semibold">{unconfigured}</div>
          </div>
        </div>

        <Input
          placeholder="Filter by code or name…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">On Hand</TableHead>
              <TableHead className="text-right">On Order</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead className="text-right">MIN</TableHead>
              <TableHead className="text-right">Reorder</TableHead>
              <TableHead className="text-right">Suggest Qty</TableHead>
              <TableHead>UoM</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.materialId}>
                <TableCell className="font-medium">
                  <div>{r.materialCode}</div>
                  <div className="text-xs text-muted-foreground">{r.materialName}</div>
                </TableCell>
                <TableCell>
                  {r.status === "below_min" ? (
                    <Badge className="bg-destructive/10 text-destructive border-0">Below MIN</Badge>
                  ) : (
                    <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-0">Reorder</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">{r.onHand.toLocaleString()}</TableCell>
                <TableCell className="text-right">{r.onOrder.toLocaleString()}</TableCell>
                <TableCell className="text-right font-medium">{r.available.toLocaleString()}</TableCell>
                <TableCell className="text-right text-muted-foreground">{r.minLevel ?? "—"}</TableCell>
                <TableCell className="text-right text-muted-foreground">{r.reorderLevel ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold">{r.shortage.toLocaleString()}</TableCell>
                <TableCell className="text-muted-foreground">{r.uom}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  {shortages.length === 0
                    ? "No shortages — all configured materials are above their reorder level."
                    : "No matches for current filter."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
