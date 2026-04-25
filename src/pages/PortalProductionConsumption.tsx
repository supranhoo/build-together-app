/**
 * Raw material consumption — read-only view of `material_consumption`
 * joined with `materials`, `stock_locations`, and `heat_logs`.
 *
 * SSOT: material_consumption (no new tables).
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchHeatLogs, type HeatLog } from "@/lib/production";
import {
  fetchMaterials,
  fetchStockLocations,
  fetchWorkspaceConsumption,
  type Material,
  type StockLocation,
  type WorkspaceConsumption,
} from "@/lib/inventory";

export default function PortalProductionConsumption() {
  const { activeProfitCenter } = useWorkspace();
  const [rows, setRows] = useState<WorkspaceConsumption[]>([]);
  const [logs, setLogs] = useState<HeatLog[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeProfitCenter) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchWorkspaceConsumption(activeProfitCenter.id),
      fetchHeatLogs(activeProfitCenter.id),
      fetchMaterials(activeProfitCenter.id),
      fetchStockLocations(activeProfitCenter.id),
    ])
      .then(([c, l, m, s]) => {
        if (cancelled) return;
        setRows(c);
        setLogs(l);
        setMaterials(m);
        setLocations(s);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [activeProfitCenter?.id]);

  const matLookup = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const locLookup = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const heatLookup = useMemo(() => new Map(logs.map((l) => [l.id, l])), [logs]);

  if (!activeProfitCenter) return null;

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader>
        <CardTitle>Raw material consumption</CardTitle>
        <p className="text-sm text-muted-foreground">
          Per-heat consumption from <code>material_consumption</code> (latest 1000 rows).
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Heat #</TableHead>
              <TableHead>Material</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>UoM</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No consumption recorded.</TableCell></TableRow>
            )}
            {rows.map((r) => {
              const mat = matLookup.get(r.materialId);
              const loc = locLookup.get(r.stockLocationId);
              const heat = heatLookup.get(r.heatLogId);
              return (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="font-medium">{heat?.heatNumber ?? "—"}</TableCell>
                  <TableCell>{mat ? `${mat.code} — ${mat.name}` : "—"}</TableCell>
                  <TableCell>{loc?.code ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{r.quantity.toFixed(3)}</TableCell>
                  <TableCell className="text-muted-foreground">{mat?.uom ?? "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
