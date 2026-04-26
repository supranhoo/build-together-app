/**
 * Portal Power Analysis — Phase C.
 *
 * KPI cards (kWh/MT, total ₹, % of cost from power) + TOD slab decomposition
 * for a chosen date range. Uses the tap_time hour as the consumption-hour
 * proxy (documented limitation; half-hourly meter ingest is future work).
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import { fetchHeatLogs, type HeatLog } from "@/lib/production";
import { fetchPowerTariffSlabs, splitMwhByTodSlab, type PowerTariffSlab } from "@/lib/finance";
import { exportRows } from "@/lib/excel-export";

export default function PortalPowerAnalysis() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [slabs, setSlabs] = useState<PowerTariffSlab[]>([]);
  const [heats, setHeats] = useState<HeatLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeProfitCenter) return;
    (async () => {
      try {
        setSlabs(await fetchPowerTariffSlabs(activeProfitCenter.id));
      } catch (e) {
        toast({ title: "Failed to load tariff slabs", description: e instanceof Error ? e.message : "", variant: "destructive" });
      }
    })();
  }, [activeProfitCenter?.id, toast]);

  useEffect(() => {
    if (!activeProfitCenter) return;
    setLoading(true);
    (async () => {
      try {
        const all = await fetchHeatLogs(activeProfitCenter.id);
        setHeats(all.filter((h) => {
          const d = h.tapTime.slice(0, 10);
          return !h.isVoided && d >= from && d <= to;
        }));
      } catch (e) {
        toast({ title: "Failed to load heats", description: e instanceof Error ? e.message : "", variant: "destructive" });
      } finally { setLoading(false); }
    })();
  }, [activeProfitCenter?.id, from, to, toast]);

  const { slices, totalMwh, totalCost, productionMt, kwhPerMt } = useMemo(() => {
    const tod = splitMwhByTodSlab(heats, slabs, to);
    const mwh = tod.reduce((s, x) => s + x.mwh, 0);
    const cost = tod.reduce((s, x) => s + x.costRs, 0);
    const prod = heats.reduce((s, h) => s + (h.weightMt ?? 0), 0);
    return {
      slices: tod,
      totalMwh: mwh,
      totalCost: cost,
      productionMt: prod,
      kwhPerMt: prod > 0 ? (mwh * 1000) / prod : null,
    };
  }, [heats, slabs, to]);

  const fmt = (n: number | null) => n === null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  const handleExport = () => {
    exportRows(`power-analysis-${activeProfitCenter?.code ?? ""}-${from}-to-${to}`, [
      { name: "Summary", rows: [{ From: from, To: to, TotalMWh: totalMwh, TotalCost: totalCost, ProductionMT: productionMt, kWhPerMT: kwhPerMt }] },
      { name: "ByTOD", rows: slices.map((s) => ({ Slab: s.slabName, MWh: s.mwh, RatePerMWh: s.ratePerMwh, CostRs: s.costRs })) },
    ]);
    toast({ title: "Power analysis exported" });
  };

  if (!activeProfitCenter) return <Card><CardHeader><CardTitle>Power Analysis</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace.</CardContent></Card>;

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>Power Analysis — {activeProfitCenter.name}</CardTitle>
          <CardDescription>
            MWh × Time-Of-Day rate decomposition. Hour is taken from each heat's tap time.
            Heats whose hour is not covered by an active slab fall into the "Unassigned" bucket.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div className="flex items-end"><Button variant="outline" onClick={handleExport}><Download className="mr-2 h-4 w-4" /> Export</Button></div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total MWh</p><p className="mt-2 text-2xl font-semibold">{fmt(totalMwh)}</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total ₹</p><p className="mt-2 text-2xl font-semibold">{fmt(totalCost)}</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Production (MT)</p><p className="mt-2 text-2xl font-semibold">{fmt(productionMt)}</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">kWh / MT</p><p className="mt-2 text-2xl font-semibold">{fmt(kwhPerMt)}</p></CardContent></Card>
          </div>

          <Table>
            <TableHeader><TableRow>
              <TableHead>TOD Slab</TableHead>
              <TableHead className="text-right">MWh</TableHead>
              <TableHead className="text-right">Rate / MWh</TableHead>
              <TableHead className="text-right">Cost ₹</TableHead>
              <TableHead className="text-right">Share %</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={5} className="text-muted-foreground">Loading…</TableCell></TableRow>}
              {!loading && slices.map((s) => (
                <TableRow key={s.slabName}>
                  <TableCell className="font-medium">{s.slabName}</TableCell>
                  <TableCell className="text-right">{fmt(s.mwh)}</TableCell>
                  <TableCell className="text-right">{fmt(s.ratePerMwh)}</TableCell>
                  <TableCell className="text-right">{fmt(s.costRs)}</TableCell>
                  <TableCell className="text-right">{totalCost > 0 ? ((s.costRs / totalCost) * 100).toFixed(1) : "—"}</TableCell>
                </TableRow>
              ))}
              {!loading && slices.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No power consumption in range.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
