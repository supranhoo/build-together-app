/**
 * Quality & chemistry validation — read-only view of `heat_metallurgy`
 * joined with `heat_logs`. FG Mn% classified vs the workspace
 * `recoveryMinPct` threshold from `profit_center_settings`.
 *
 * SSOT: heat_metallurgy + heat_logs.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/hooks/use-workspace";
import { fetchHeatLogs, type HeatLog } from "@/lib/production";
import { fetchMetallurgyByPC, type HeatMetallurgy } from "@/lib/heat-metallurgy";
import {
  fetchProductionAlertThresholds,
  DEFAULT_PRODUCTION_ALERTS,
  type ProductionAlertThresholds,
} from "@/lib/production-alerts";
import { classifyQuality, indexMetallurgyByHeat, type QualityStatus } from "@/lib/production-rollups";

const STATUS_LABEL: Record<QualityStatus, string> = {
  passed: "Passed",
  failed: "Failed",
  pending: "Pending",
};

export default function PortalProductionQuality() {
  const { activeProfitCenter } = useWorkspace();
  const [logs, setLogs] = useState<HeatLog[]>([]);
  const [met, setMet] = useState<HeatMetallurgy[]>([]);
  const [thresholds, setThresholds] = useState<ProductionAlertThresholds>(DEFAULT_PRODUCTION_ALERTS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeProfitCenter) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchHeatLogs(activeProfitCenter.id),
      fetchMetallurgyByPC(activeProfitCenter.id).catch(() => [] as HeatMetallurgy[]),
      fetchProductionAlertThresholds(activeProfitCenter.id).catch(() => DEFAULT_PRODUCTION_ALERTS),
    ])
      .then(([l, m, t]) => {
        if (cancelled) return;
        setLogs(l);
        setMet(m);
        setThresholds(t);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [activeProfitCenter?.id]);

  const byHeat = useMemo(() => indexMetallurgyByHeat(met), [met]);
  const rows = logs.filter((l) => !l.isVoided);

  if (!activeProfitCenter) return null;

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader>
        <CardTitle>Quality &amp; chemistry validation</CardTitle>
        <p className="text-sm text-muted-foreground">
          FG Mn% per heat vs threshold (≥ {thresholds.recoveryMinPct}%). Voided heats excluded.
        </p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Heat #</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead className="text-right">FG Mn %</TableHead>
              <TableHead className="text-right">Slag MnO %</TableHead>
              <TableHead className="text-right">Dust Mn %</TableHead>
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
              const m = byHeat.get(log.id);
              const status = classifyQuality(m, thresholds.recoveryMinPct);
              return (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">{log.heatNumber}</TableCell>
                  <TableCell>{m?.product ?? "—"}</TableCell>
                  <TableCell>{m?.grade ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{m?.fgMnPct?.toFixed(2) ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{m?.slagMnoPct?.toFixed(2) ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{m?.dustMnPct?.toFixed(2) ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={status === "failed" ? "destructive" : status === "pending" ? "secondary" : "outline"}>
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
