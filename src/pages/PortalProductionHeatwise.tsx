import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import {
  fetchWorkspaceConsumption,
  fetchStockLocations,
  type WorkspaceConsumption,
  type StockLocation,
} from "@/lib/inventory";
import { fetchHeatLogs, fetchFurnaces, type HeatLog, type Furnace } from "@/lib/production";
import { fetchMasterItems, type MasterItem } from "@/lib/master-data";
import { exportRows } from "@/lib/excel-export";

/**
 * Heat-wise consumption rollup. Joins material_consumption rows back to their
 * heat_log to show, per heat: furnace, tap time, weight, and the material
 * lines that fed it. Read-only — entry stays in the Data Entry tab.
 */
export default function PortalProductionHeatwise() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const [date, setDate] = useState<string>("");
  const [logs, setLogs] = useState<HeatLog[]>([]);
  const [cons, setCons] = useState<WorkspaceConsumption[]>([]);
  const [items, setItems] = useState<MasterItem[]>([]);
  const [furnaces, setFurnaces] = useState<Furnace[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);

  useEffect(() => {
    if (!activeProfitCenter) return;
    const range = date
      ? { from: `${date}T00:00:00.000Z`, to: `${date}T23:59:59.999Z` }
      : undefined;
    Promise.all([
      fetchHeatLogs(activeProfitCenter.id, { date: date || undefined }),
      fetchWorkspaceConsumption(activeProfitCenter.id, range),
      fetchMasterItems(activeProfitCenter.id),
      fetchFurnaces(activeProfitCenter.id),
      fetchStockLocations(activeProfitCenter.id),
    ])
      .then(([h, c, m, f, l]) => { setLogs(h); setCons(c); setItems(m); setFurnaces(f); setLocations(l); })
      .catch((e) => toast({ title: "Failed to load heat-wise view", description: e instanceof Error ? e.message : "", variant: "destructive" }));
  }, [activeProfitCenter?.id, date, toast]);

  const itemLabel = (id: string) => {
    const m = items.find((x) => x.id === id);
    return m ? `${m.code} — ${m.name}` : id;
  };
  const itemUom = (id: string) => items.find((x) => x.id === id)?.uom ?? "";
  const furnaceLabel = (id: string) => furnaces.find((f) => f.id === id)?.code ?? "—";
  const locLabel = (id: string) => locations.find((l) => l.id === id)?.code ?? id;

  const grouped = useMemo(() => {
    const byHeat = new Map<string, WorkspaceConsumption[]>();
    for (const c of cons) {
      const list = byHeat.get(c.heatLogId) ?? [];
      list.push(c);
      byHeat.set(c.heatLogId, list);
    }
    return logs
      .filter((l) => !l.isVoided)
      .map((log) => ({ log, rows: byHeat.get(log.id) ?? [] }))
      .filter((g) => g.rows.length > 0 || !!date);
  }, [logs, cons, date]);

  const handleExport = () => {
    const rows = grouped.flatMap((g) =>
      g.rows.map((r) => ({
        Heat: g.log.heatNumber,
        Furnace: furnaceLabel(g.log.furnaceId),
        TapTime: g.log.tapTime,
        WeightMt: g.log.weightMt ?? "",
        Material: itemLabel(r.materialId),
        UOM: itemUom(r.materialId),
        Quantity: r.quantity,
        Location: locLabel(r.stockLocationId),
      })),
    );
    exportRows(`heatwise-${activeProfitCenter?.code ?? ""}-${date || "all"}`, [
      { name: "Heat-wise", rows },
    ]);
  };

  if (!activeProfitCenter) return null;

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Heat-wise consumption</CardTitle>
          <CardDescription>Materials consumed per heat. Roll-up of `material_consumption` joined to `heat_logs`.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1.5 h-4 w-4" /> Excel
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {grouped.length === 0 && (
          <p className="text-sm text-muted-foreground">No consumption recorded for the selected date.</p>
        )}
        {grouped.map(({ log, rows }) => (
          <div key={log.id} className="rounded-md border border-border">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-panel px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold">Heat {log.heatNumber}</span>
                <span className="text-muted-foreground">{furnaceLabel(log.furnaceId)}</span>
                <span className="text-muted-foreground">{new Date(log.tapTime).toLocaleString()}</span>
              </div>
              <span className="text-muted-foreground">
                Weight: {log.weightMt ?? "—"} MT · Power: {log.powerMwh ?? "—"} MWh
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>UOM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-muted-foreground">No materials recorded.</TableCell></TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{itemLabel(r.materialId)}</TableCell>
                    <TableCell>{locLabel(r.stockLocationId)}</TableCell>
                    <TableCell className="text-right">{r.quantity.toFixed(3)}</TableCell>
                    <TableCell>{itemUom(r.materialId)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
