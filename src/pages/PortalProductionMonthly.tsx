import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import { fetchHeatLogsWithMeta, type HeatLog } from "@/lib/production";
import { exportRows } from "@/lib/excel-export";
import { TruncationBanner } from "@/components/TruncationBanner";

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

/** Phase 1.5 — default window is the last 12 calendar months. */
function defaultWindow(): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const fromDt = new Date(now);
  fromDt.setMonth(fromDt.getMonth() - 11);
  fromDt.setDate(1);
  const from = fromDt.toISOString().slice(0, 10);
  return { from, to };
}

export default function PortalProductionMonthly() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const initial = defaultWindow();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [logs, setLogs] = useState<HeatLog[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [limit] = useState(10000);

  useEffect(() => {
    if (!activeProfitCenter) return;
    // Phase 1.5: bound by from/to (default last 12 months) + truncation flag.
    fetchHeatLogsWithMeta(activeProfitCenter.id, { from, to, limit })
      .then((page) => { setLogs(page.rows); setTruncated(page.truncated); })
      .catch((e) => toast({ title: "Failed to load monthly data", description: e instanceof Error ? e.message : "", variant: "destructive" }));
  }, [activeProfitCenter?.id, from, to, limit, toast]);

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
          <CardDescription>Roll-up by tap-month. Voided logs excluded. Default window = last 12 months.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-1.5 h-4 w-4" /> Excel
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
        </div>
        {truncated && (
          <TruncationBanner
            limit={limit}
            hint="Narrow the date range — some heats in this window are not included in the totals."
          />
        )}
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
