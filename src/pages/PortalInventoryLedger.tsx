import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import {
  fetchLedger,
  fetchMaterials,
  fetchStockLocations,
  type InventoryLedgerEntry,
  type Material,
  type MovementType,
  type StockLocation,
} from "@/lib/inventory";

const MOVEMENTS: Array<{ value: MovementType | "all"; label: string }> = [
  { value: "all", label: "All movements" },
  { value: "receipt", label: "Receipts" },
  { value: "consumption", label: "Consumption" },
  { value: "adjustment", label: "Adjustments" },
  { value: "transfer_in", label: "Transfers in" },
  { value: "transfer_out", label: "Transfers out" },
];

export default function PortalInventoryLedger() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [ledger, setLedger] = useState<InventoryLedgerEntry[]>([]);
  const [filterMaterial, setFilterMaterial] = useState<string>("all");
  const [filterMovement, setFilterMovement] = useState<MovementType | "all">("all");
  const [filterDate, setFilterDate] = useState<string>("");

  useEffect(() => {
    if (!activeProfitCenter) return;
    Promise.all([
      fetchMaterials(activeProfitCenter.id),
      fetchStockLocations(activeProfitCenter.id),
      fetchLedger(activeProfitCenter.id, {
        materialId: filterMaterial !== "all" ? filterMaterial : undefined,
        movementType: filterMovement !== "all" ? filterMovement : undefined,
        date: filterDate || undefined,
      }),
    ])
      .then(([m, l, le]) => { setMaterials(m); setLocations(l); setLedger(le); })
      .catch((e) => toast({ title: "Failed to load ledger", description: e instanceof Error ? e.message : "", variant: "destructive" }));
  }, [activeProfitCenter?.id, filterMaterial, filterMovement, filterDate, toast]);

  const matLabel = (id: string) => {
    const m = materials.find((x) => x.id === id);
    return m ? `${m.code} (${m.uom})` : "—";
  };
  const locLabel = (id: string) => locations.find((x) => x.id === id)?.code ?? "—";

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>Inventory ledger</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Inventory ledger — {activeProfitCenter.name}</CardTitle>
        <Button asChild variant="outline"><Link to="/portal/inventory">Back</Link></Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Select value={filterMaterial} onValueChange={setFilterMaterial}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All materials</SelectItem>
              {materials.map((m) => <SelectItem key={m.id} value={m.id}>{m.code}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterMovement} onValueChange={(v) => setFilterMovement(v as MovementType | "all")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MOVEMENTS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Material</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledger.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{new Date(e.createdAt).toLocaleString()}</TableCell>
                <TableCell>{e.movementType}</TableCell>
                <TableCell>{matLabel(e.materialId)}</TableCell>
                <TableCell>{locLabel(e.stockLocationId)}</TableCell>
                <TableCell className={`text-right ${e.quantity < 0 ? "text-destructive" : ""}`}>{e.quantity.toFixed(3)}</TableCell>
                <TableCell className="text-muted-foreground">{e.referenceType ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{e.notes ?? ""}</TableCell>
              </TableRow>
            ))}
            {ledger.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">No ledger entries in scope.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
