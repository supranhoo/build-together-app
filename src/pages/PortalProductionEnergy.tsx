/**
 * Energy intelligence — read-only view derived from `heat_logs.power_mwh`
 * and `heat_logs.weight_mt`. Per-heat kWh/MT classified against the
 * workspace `kwhPerMtTarget` from `profit_center_settings`.
 *
 * SSOT: heat_logs (no new tables, no new services).
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchFurnaces, fetchHeatLogs, type Furnace, type HeatLog } from "@/lib/production";
import {
  fetchProductionAlertThresholds,
  DEFAULT_PRODUCTION_ALERTS,
  type ProductionAlertThresholds,
} from "@/lib/production-alerts";
import { classifyEnergy, heatKwhPerMt, type EnergyStatus } from "@/lib/production-rollups";

const STATUS_LABEL: Record<EnergyStatus, string> = {
  optimal: "Optimal",
  near_limit: "Near limit",
  high: "High",
  unknown: "—",
};

export default function PortalProductionEnergy() {
  const { activeProfitCenter } = useWorkspace();
  const [logs, setLogs] = useState<HeatLog[]>([]);
  const [furnaces, setFurnaces] = useState<Furnace[]>([]);
  const [thresholds, setThresholds] = useState<ProductionAlertThresholds>(DEFAULT_PRODUCTION_ALERTS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeProfitCenter) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchHeatLogs(activeProfitCenter.id),
      fetchFurnaces(activeProfitCenter.id),
      fetchProductionAlertThresholds(activeProfitCenter.id).catch(() => DEFAULT_PRODUCTION_ALERTS),
    ])
      .then(([l, f, t]) => {
        if (cancelled) return;
        setLogs(l);
        setFurnaces(f);
        setThresholds(t);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [activeProfitCenter?.id]);

  const furnaceCode = useMemo(() => {
    const m = new Map(furnaces.map((f) => [f.id, f.code]));
    return (id: string) => m.get(id) ?? "—";
  }, [furnaces]);

  if (!activeProfitCenter) return null;

  const target = thresholds.kwhPerMtTarget;
  const rows = logs.filter((l) => !l.isVoided);

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader>
        <CardTitle>Energy intelligence</CardTitle>
        <p className="text-sm text-muted-foreground">
          Per-heat kWh/MT vs target ({target} kWh/MT). Voided heats excluded.
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Heat #</TableHead>
              <TableHead>Furnace</TableHead>
              <TableHead className="text-right">Power (MWh)</TableHead>
              <TableHead className="text-right">Weight (MT)</TableHead>
              <TableHead className="text-right">Actual kWh/MT</TableHead>
              <TableHead className="text-right">Target</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No heats recorded.</TableCell></TableRow>
            )}
            {rows.map((log) => {
              const kwh = heatKwhPerMt(log);
              const status = classifyEnergy(kwh, target);
              return (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">{log.heatNumber}</TableCell>
                  <TableCell>{furnaceCode(log.furnaceId)}</TableCell>
                  <TableCell className="text-right font-mono">{log.powerMwh?.toFixed(2) ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{log.weightMt?.toFixed(2) ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{kwh !== null ? kwh.toFixed(0) : "—"}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{target}</TableCell>
                  <TableCell>
                    <Badge variant={status === "high" ? "destructive" : status === "near_limit" ? "secondary" : "outline"}>
                      {STATUS_LABEL[status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
