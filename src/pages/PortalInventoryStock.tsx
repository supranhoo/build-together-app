import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import {
  computeStockBalances,
  fetchLedger,
  fetchMaterials,
  fetchStockLocations,
  type InventoryLedgerEntry,
  type Material,
  type StockLocation,
} from "@/lib/inventory";

/** Stock-on-hand by material × location. Same data as the legacy default view. */
export default function PortalInventoryStock() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [ledger, setLedger] = useState<InventoryLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeProfitCenter) return;
    setLoading(true);
    Promise.all([
      fetchMaterials(activeProfitCenter.id),
      fetchStockLocations(activeProfitCenter.id),
      fetchLedger(activeProfitCenter.id),
    ])
      .then(([m, l, le]) => { setMaterials(m); setLocations(l); setLedger(le); })
      .catch((e) => toast({ title: "Failed to load stock", description: e instanceof Error ? e.message : "", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [activeProfitCenter?.id, toast]);

  const balances = useMemo(() => computeStockBalances(ledger), [ledger]);
  const matLabel = (id: string) => {
    const m = materials.find((x) => x.id === id);
    return m ? `${m.code} — ${m.name} (${m.uom})` : id;
  };
  const locLabel = (id: string) => locations.find((x) => x.id === id)?.code ?? id;

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader>
        <CardTitle>Stock on hand</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {balances.map((b) => (
              <TableRow key={`${b.materialId}-${b.stockLocationId}`}>
                <TableCell className="font-medium">{matLabel(b.materialId)}</TableCell>
                <TableCell>{locLabel(b.stockLocationId)}</TableCell>
                <TableCell className={`text-right ${b.quantity < 0 ? "text-destructive" : ""}`}>{b.quantity.toFixed(3)}</TableCell>
              </TableRow>
            ))}
            {balances.length === 0 && !loading && (
              <TableRow><TableCell colSpan={3} className="text-muted-foreground">No stock movements yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
