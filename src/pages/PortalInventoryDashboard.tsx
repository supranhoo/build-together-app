import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Boxes, Package, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import {
  computeStockBalances,
  fetchLedger,
  fetchStockLocations,
  type InventoryLedgerEntry,
  type StockLocation,
} from "@/lib/inventory";
import { fetchMasterItems, fetchCostRates, type MasterItem, type CostRate } from "@/lib/master-data";
import { classifyStockStatus } from "@/lib/inventory-min-max";
import { latestRateOn } from "@/lib/costing";

export default function PortalInventoryDashboard() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const [items, setItems] = useState<MasterItem[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [ledger, setLedger] = useState<InventoryLedgerEntry[]>([]);
  const [rates, setRates] = useState<CostRate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeProfitCenter) return;
    setLoading(true);
    Promise.all([
      fetchMasterItems(activeProfitCenter.id),
      fetchStockLocations(activeProfitCenter.id),
      fetchLedger(activeProfitCenter.id),
      fetchCostRates(activeProfitCenter.id),
    ])
      .then(([m, l, le, r]) => { setItems(m); setLocations(l); setLedger(le); setRates(r); })
      .catch((e) => toast({ title: "Failed to load dashboard", description: e instanceof Error ? e.message : "", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [activeProfitCenter?.id, toast]);

  const balances = useMemo(() => computeStockBalances(ledger), [ledger]);
  const today = new Date().toISOString().slice(0, 10);

  // Per-material totals and valuation
  const itemRows = useMemo(() => {
    return items.map((item) => {
      const qty = balances
        .filter((b) => b.materialId === item.id)
        .reduce((sum, b) => sum + b.quantity, 0);
      const rate = latestRateOn(rates, item.id, today);
      const value = rate ? qty * rate.rate : null;
      const status = classifyStockStatus(qty, {
        minLevel: item.minLevel,
        maxLevel: item.maxLevel,
        reorderLevel: item.reorderLevel,
      });
      return { item, qty, rate, value, status };
    });
  }, [items, balances, rates, today]);

  const stockValue = itemRows.reduce((sum, r) => sum + (r.value ?? 0), 0);
  const belowMin = itemRows.filter((r) => r.status === "below_min");
  const reorder = itemRows.filter((r) => r.status === "reorder");

  const todayStr = today;
  const isToday = (iso: string) => iso.slice(0, 10) === todayStr;
  const todayReceipts = ledger.filter((e) => e.movementType === "receipt" && isToday(e.createdAt));
  const todayIssues = ledger.filter((e) => e.movementType === "consumption" && isToday(e.createdAt));

  const itemLabel = (id: string) => {
    const m = items.find((x) => x.id === id);
    return m ? `${m.code} — ${m.name} (${m.uom})` : id;
  };
  const locLabel = (id: string) => locations.find((l) => l.id === id)?.code ?? id;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Stock value</p>
              <p className="mt-2 text-2xl font-semibold">{stockValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              <p className="mt-1 text-xs text-muted-foreground">Σ qty × latest rate</p>
            </div>
            <div className="rounded-md bg-primary/12 p-3 text-primary"><Package className="h-5 w-5" /></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Below minimum</p>
              <p className="mt-2 text-2xl font-semibold text-destructive">{belowMin.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Items requiring action</p>
            </div>
            <div className="rounded-md bg-destructive/12 p-3 text-destructive"><AlertTriangle className="h-5 w-5" /></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Receipts today</p>
              <p className="mt-2 text-2xl font-semibold">{todayReceipts.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Inward movements</p>
            </div>
            <div className="rounded-md bg-primary/12 p-3 text-primary"><ArrowDownToLine className="h-5 w-5" /></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Issues today</p>
              <p className="mt-2 text-2xl font-semibold">{todayIssues.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Outward movements</p>
            </div>
            <div className="rounded-md bg-primary/12 p-3 text-primary"><ArrowUpFromLine className="h-5 w-5" /></div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card shadow-panel">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-destructive" />
            Low-stock alerts
          </CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link to="/portal/inventory/min-max">Manage thresholds</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Min</TableHead>
                <TableHead className="text-right">Reorder</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...belowMin, ...reorder].map(({ item, qty, status }) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{itemLabel(item.id)}</TableCell>
                  <TableCell className={`text-right ${status === "below_min" ? "text-destructive" : ""}`}>{qty.toFixed(3)}</TableCell>
                  <TableCell className="text-right">{item.minLevel ?? "—"}</TableCell>
                  <TableCell className="text-right">{item.reorderLevel ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={status === "below_min" ? "destructive" : "secondary"}>
                      {status === "below_min" ? "Below min" : "Reorder"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {belowMin.length === 0 && reorder.length === 0 && !loading && (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">All items at or above minimum levels.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border bg-card shadow-panel">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2"><Boxes className="h-4 w-4" />Stock value by item</CardTitle>
          <p className="text-xs text-muted-foreground">Locations: {locations.length}</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Latest rate</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itemRows.filter((r) => r.qty !== 0 || r.value !== null).map((r) => (
                <TableRow key={r.item.id}>
                  <TableCell className="font-medium">{r.item.code} — {r.item.name}</TableCell>
                  <TableCell className="text-right">{r.qty.toFixed(3)}</TableCell>
                  <TableCell className="text-right">{r.rate ? r.rate.rate.toLocaleString() : "—"}</TableCell>
                  <TableCell className="text-right">{r.value !== null ? r.value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—"}</TableCell>
                </TableRow>
              ))}
              {itemRows.length === 0 && !loading && (
                <TableRow><TableCell colSpan={4} className="text-muted-foreground">No items configured for this workspace.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
