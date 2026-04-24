import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const INVENTORY_TABS: Array<{ value: string; label: string; path: string }> = [
  { value: "stock", label: "Stock on hand", path: "/portal/inventory" },
  { value: "receipts", label: "Receipts", path: "/portal/inventory/receipts" },
  { value: "ledger", label: "Ledger", path: "/portal/inventory/ledger" },
];

export default function PortalInventory() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [ledger, setLedger] = useState<InventoryLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const isNested = location.pathname !== "/portal/inventory";
  const activeTab = useMemo(() => {
    const match = INVENTORY_TABS.find((t) => t.path === location.pathname);
    return match?.value ?? "stock";
  }, [location.pathname]);

  useEffect(() => {
    if (!activeProfitCenter) return;
    if (isNested) return;
    setLoading(true);
    Promise.all([
      fetchMaterials(activeProfitCenter.id),
      fetchStockLocations(activeProfitCenter.id),
      fetchLedger(activeProfitCenter.id),
    ])
      .then(([m, l, le]) => { setMaterials(m); setLocations(l); setLedger(le); })
      .catch((e) => toast({ title: "Failed to load inventory", description: e instanceof Error ? e.message : "", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [activeProfitCenter?.id, isNested, toast]);

  const balances = useMemo(() => computeStockBalances(ledger), [ledger]);
  const materialLabel = (id: string) => {
    const m = materials.find((x) => x.id === id);
    return m ? `${m.code} — ${m.name} (${m.uom})` : id;
  };
  const locationLabel = (id: string) => locations.find((x) => x.id === id)?.code ?? id;

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>Inventory</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace to view inventory.</CardContent></Card>;
  }

  const tabStrip = (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        const next = INVENTORY_TABS.find((t) => t.value === value);
        if (next) navigate(next.path);
      }}
    >
      <TabsList>
        {INVENTORY_TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );

  if (isNested) {
    return (
      <div className="space-y-6">
        {tabStrip}
        <Outlet />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {tabStrip}
      <Card className="border-border bg-card shadow-panel">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Stock on hand — {activeProfitCenter.name}</CardTitle>
          <div className="flex gap-2">
            <Button asChild variant="outline"><Link to="/portal/inventory/ledger">View ledger</Link></Button>
            <Button asChild><Link to="/portal/inventory/receipts">New receipt</Link></Button>
          </div>
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
                  <TableCell className="font-medium">{materialLabel(b.materialId)}</TableCell>
                  <TableCell>{locationLabel(b.stockLocationId)}</TableCell>
                  <TableCell className={`text-right ${b.quantity < 0 ? "text-destructive" : ""}`}>{b.quantity.toFixed(3)}</TableCell>
                </TableRow>
              ))}
              {balances.length === 0 && !loading && (
                <TableRow><TableCell colSpan={3} className="text-muted-foreground">No stock movements yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          {(materials.length === 0 || locations.length === 0) && (
            <p className="mt-4 text-xs text-muted-foreground">
              An admin must configure at least one material and one stock location for this workspace before receipts can be posted.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
