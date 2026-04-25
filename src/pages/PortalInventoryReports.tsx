import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
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
import { latestRateOn } from "@/lib/costing";
import { exportRows } from "@/lib/excel-export";

export default function PortalInventoryReports() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const [items, setItems] = useState<MasterItem[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [ledger, setLedger] = useState<InventoryLedgerEntry[]>([]);
  const [rates, setRates] = useState<CostRate[]>([]);

  useEffect(() => {
    if (!activeProfitCenter) return;
    Promise.all([
      fetchMasterItems(activeProfitCenter.id),
      fetchStockLocations(activeProfitCenter.id),
      fetchLedger(activeProfitCenter.id),
      fetchCostRates(activeProfitCenter.id),
    ])
      .then(([m, l, le, r]) => { setItems(m); setLocations(l); setLedger(le); setRates(r); })
      .catch((e) => toast({ title: "Failed to load", description: e instanceof Error ? e.message : "", variant: "destructive" }));
  }, [activeProfitCenter?.id, toast]);

  const today = new Date().toISOString().slice(0, 10);
  const balances = useMemo(() => computeStockBalances(ledger), [ledger]);
  const matLabel = (id: string) => items.find((m) => m.id === id);
  const locLabel = (id: string) => locations.find((l) => l.id === id)?.code ?? id;

  const exportInventoryDss = () => {
    const stockRows = balances.map((b) => {
      const item = matLabel(b.materialId);
      const rate = item ? latestRateOn(rates, item.id, today) : null;
      return {
        Material: item?.code ?? b.materialId,
        Name: item?.name ?? "",
        Location: locLabel(b.stockLocationId),
        UOM: item?.uom ?? "",
        Quantity: b.quantity,
        Rate: rate?.rate ?? null,
        Value: rate ? b.quantity * rate.rate : null,
      };
    });
    const ledgerRows = ledger.map((e) => ({
      When: e.createdAt,
      Type: e.movementType,
      Material: matLabel(e.materialId)?.code ?? e.materialId,
      Location: locLabel(e.stockLocationId),
      Quantity: e.quantity,
      Reference: e.referenceType ?? "",
      Notes: e.notes ?? "",
    }));
    exportRows(`inventory-dss-${activeProfitCenter?.code ?? ""}-${today}`, [
      { name: "Stock", rows: stockRows },
      { name: "Ledger", rows: ledgerRows },
    ]);
    toast({ title: "Exported inventory DSS" });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Inventory reports</CardTitle>
          <CardDescription>Excel exports for the current workspace, valued at latest cost rates.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" onClick={exportInventoryDss}>
            <Download className="mr-2 h-4 w-4" /> Inventory DSS (Stock + Ledger)
          </Button>
          <p className="text-xs text-muted-foreground">
            Furnace-wise consumption and Mn recovery reports are available from the Production page;
            cost sheets are available from the Costing page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
