import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import { fetchHeatLogs, type HeatLog } from "@/lib/production";
import { exportRows } from "@/lib/excel-export";

/**
 * Month-on-month rollup of heat logs by year-month: heats, weight, power.
 * Pure derivation from HeatLog rows.
 */
export function rollupByMonth(logs: HeatLog[]): Array<{ month: string; heats: number; weight: number; power: number }> {
  const map = new Map<string, { heats: number; weight: number; power: number }>();
  for (const l of logs) {
    if (l.isVoided) continue;
    const key = l.tapTime.slice(0, 7); // YYYY-MM
    const cur = map.get(key) ?? { heats: 0, weight: 0, power: 0 };
    cur.heats += 1;
    cur.weight += l.weightMt ?? 0;
    cur.power += l.powerMwh ?? 0;
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([month, v]) => ({ month, ...v }));
}

export default function PortalProductionMonthly() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const [logs, setLogs] = useState<HeatLog[]>([]);

  useEffect(() => {
    if (!activeProfitCenter) return;
    fetchHeatLogs(activeProfitCenter.id)
      .then(setLogs)
      .catch((e) => toast({ title: "Failed to load monthly data", description: e instanceof Error ? e.message : "", variant: "destructive" }));
  }, [activeProfitCenter?.id, toast]);

  const rows = useMemo(() => rollupByMonth(logs), [logs]);

  const handleExport = () => {
    exportRows(`monthly-summary-${activeProfitCenter?.code ?? ""}`, [
      {
        name: "Monthly",
        rows: rows.map((r) => ({
          Month: r.month,
          Heats: r.heats,
          WeightMt: Number(r.weight.toFixed(3)),
          PowerMwh: Number(r.power.toFixed(3)),
          AvgWeightPerHeat: r.heats > 0 ? Number((r.weight / r.heats).toFixed(3)) : "",
        })),
      },
    ]);
  };

  if (!activeProfitCenter) return null;

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Monthly summary</CardTitle>
          <CardDescription>Roll-up by tap-month across the latest 200 heats. Voided logs excluded.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1.5 h-4 w-4" /> Excel
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Heats</TableHead>
              <TableHead className="text-right">Weight (MT)</TableHead>
              <TableHead className="text-right">Power (MWh)</TableHead>
              <TableHead className="text-right">Avg MT/heat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.month}>
                <TableCell className="font-medium">{r.month}</TableCell>
                <TableCell className="text-right">{r.heats}</TableCell>
                <TableCell className="text-right">{r.weight.toFixed(3)}</TableCell>
                <TableCell className="text-right">{r.power.toFixed(3)}</TableCell>
                <TableCell className="text-right">{r.heats > 0 ? (r.weight / r.heats).toFixed(3) : "—"}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground">No heat logs to summarize.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
