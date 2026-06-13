import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import { fetchHeatLogsWithMeta, fetchFurnaces, type HeatLog, type Furnace } from "@/lib/production";
import { exportRows } from "@/lib/excel-export";
import { TruncationBanner } from "@/components/TruncationBanner";

/**
 * Per-furnace rollup of heat production: count, total weight, total power,
 * power per MT. Filter by date range.
 */
export default function PortalProductionFurnaceSummary() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [logs, setLogs] = useState<HeatLog[]>([]);
  const [furnaces, setFurnaces] = useState<Furnace[]>([]);
  const [truncated, setTruncated] = useState(false);
  const FURNACE_LIMIT = 10000;

  useEffect(() => {
    if (!activeProfitCenter) return;
    // Phase 1.5: bound query by visible range + capture truncation flag.
    Promise.all([
      fetchHeatLogsWithMeta(activeProfitCenter.id, { from, to, limit: FURNACE_LIMIT }),
      fetchFurnaces(activeProfitCenter.id),
    ])
      .then(([page, f]) => { setLogs(page.rows); setTruncated(page.truncated); setFurnaces(f); })
      .catch((e) => toast({ title: "Failed to load", description: e instanceof Error ? e.message : "", variant: "destructive" }));
  }, [activeProfitCenter?.id, from, to, toast]);

  const rows = useMemo(() => {
    const fromIso = `${from}T00:00:00.000Z`;
    const toIso = `${to}T23:59:59.999Z`;
    const inRange = logs.filter((l) => !l.isVoided && l.tapTime >= fromIso && l.tapTime <= toIso);
    return furnaces.map((f) => {
      const fLogs = inRange.filter((l) => l.furnaceId === f.id);
      const heats = fLogs.length;
      const weight = fLogs.reduce((s, l) => s + (l.weightMt ?? 0), 0);
      const power = fLogs.reduce((s, l) => s + (l.powerMwh ?? 0), 0);
      const powerPerMt = weight > 0 ? power / weight : null;
      return { furnace: f, heats, weight, power, powerPerMt };
    });
  }, [logs, furnaces, from, to]);

  const handleExport = () => {
    exportRows(`furnace-summary-${activeProfitCenter?.code ?? ""}-${from}-${to}`, [
      {
        name: "Furnace Summary",
        rows: rows.map((r) => ({
          Furnace: r.furnace.code,
          Name: r.furnace.name,
          Type: r.furnace.machineType ?? "",
          Heats: r.heats,
          WeightMt: Number(r.weight.toFixed(3)),
          PowerMwh: Number(r.power.toFixed(3)),
          PowerPerMt: r.powerPerMt !== null ? Number(r.powerPerMt.toFixed(3)) : "",
        })),
      },
    ]);
  };

  if (!activeProfitCenter) return null;

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Furnace summary</CardTitle>
          <CardDescription>Per-furnace heats, weight (MT), power (MWh) and energy intensity in the selected window.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1.5 h-4 w-4" /> Excel
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {truncated && (
          <TruncationBanner limit={FURNACE_LIMIT} hint="Narrow the date range — some heats in this window are not included in the totals." />
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Furnace</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Heats</TableHead>
              <TableHead className="text-right">Weight (MT)</TableHead>
              <TableHead className="text-right">Power (MWh)</TableHead>
              <TableHead className="text-right">MWh / MT</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.furnace.id}>
                <TableCell className="font-medium">{r.furnace.code} — {r.furnace.name}</TableCell>
                <TableCell>{r.furnace.machineType ?? "—"}</TableCell>
                <TableCell className="text-right">{r.heats}</TableCell>
                <TableCell className="text-right">{r.weight.toFixed(3)}</TableCell>
                <TableCell className="text-right">{r.power.toFixed(3)}</TableCell>
                <TableCell className="text-right">{r.powerPerMt !== null ? r.powerPerMt.toFixed(3) : "—"}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-muted-foreground">No furnaces configured.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
