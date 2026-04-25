import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fetchFurnaces, fetchHeatLogs, type Furnace, type HeatLog } from "@/lib/production";
import { fetchCostRates, type CostRate } from "@/lib/master-data";
import { buildCostBreakdown, conversionCost, daysBetween, materialCost, type ConsumptionLine } from "@/lib/costing";
import { exportRows } from "@/lib/excel-export";

const client = supabase as unknown as { from: (t: string) => any };

interface SettingValue { power_rate_per_mwh?: number; fixed_cost_per_day?: number; target_cost_per_mt?: number; target_grade_mn_pct?: number; }

export default function PortalCosting() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [furnaceId, setFurnaceId] = useState<string>("all");
  const [furnaces, setFurnaces] = useState<Furnace[]>([]);
  const [heats, setHeats] = useState<HeatLog[]>([]);
  const [consumption, setConsumption] = useState<Array<{ heatLogId: string; materialId: string; quantity: number }>>([]);
  const [rates, setRates] = useState<CostRate[]>([]);
  const [settings, setSettings] = useState<SettingValue>({});

  useEffect(() => {
    if (!activeProfitCenter) return;
    (async () => {
      try {
        const [f, r, s] = await Promise.all([
          fetchFurnaces(activeProfitCenter.id),
          fetchCostRates(activeProfitCenter.id),
          client.from("profit_center_settings")
            .select("setting_key, setting_value")
            .eq("profit_center_id", activeProfitCenter.id)
            .like("setting_key", "costing.%"),
        ]);
        setFurnaces(f); setRates(r);
        const merged: SettingValue = {};
        for (const row of (s.data ?? [])) {
          const key = (row.setting_key as string).replace("costing.", "");
          const val = (row.setting_value as any)?.value;
          if (typeof val === "number") (merged as any)[key] = val;
        }
        setSettings(merged);
      } catch (e) {
        toast({ title: "Failed to load costing inputs", description: e instanceof Error ? e.message : "", variant: "destructive" });
      }
    })();
  }, [activeProfitCenter?.id, toast]);

  useEffect(() => {
    if (!activeProfitCenter) return;
    (async () => {
      try {
        const allHeats = await fetchHeatLogs(activeProfitCenter.id, {
          furnaceId: furnaceId !== "all" ? furnaceId : undefined,
        });
        const filtered = allHeats.filter((h) => {
          const d = h.tapTime.slice(0, 10);
          return d >= from && d <= to && !h.isVoided;
        });
        setHeats(filtered);
        if (filtered.length === 0) { setConsumption([]); return; }
        const ids = filtered.map((h) => h.id);
        const { data, error } = await client.from("material_consumption")
          .select("heat_log_id, material_id, quantity")
          .in("heat_log_id", ids);
        if (error) throw error;
        setConsumption((data ?? []).map((r: any) => ({ heatLogId: r.heat_log_id, materialId: r.material_id, quantity: Number(r.quantity) })));
      } catch (e) {
        toast({ title: "Failed to load heats", description: e instanceof Error ? e.message : "", variant: "destructive" });
      }
    })();
  }, [activeProfitCenter?.id, from, to, furnaceId, toast]);

  const breakdown = useMemo(() => {
    const lines: ConsumptionLine[] = consumption.map((c) => ({ materialId: c.materialId, quantity: c.quantity }));
    const matCost = materialCost(lines, rates, to);
    const totalPower = heats.reduce((s, h) => s + (h.powerMwh ?? 0), 0);
    const days = daysBetween(from, to);
    const convCost = conversionCost({
      powerMwh: totalPower,
      powerRatePerMwh: settings.power_rate_per_mwh ?? 0,
      fixedCostPerDay: settings.fixed_cost_per_day ?? 0,
      days,
    });
    const production = heats.reduce((s, h) => s + (h.weightMt ?? 0), 0);
    return buildCostBreakdown({
      materialCost: matCost,
      conversionCost: convCost,
      productionMt: production,
      gradeMnPct: settings.target_grade_mn_pct ?? null,
      targetCostPerMt: settings.target_cost_per_mt ?? null,
    });
  }, [consumption, rates, heats, settings, from, to]);

  const fmt = (n: number | null) => n === null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  const handleExport = () => {
    exportRows(`cost-sheet-${activeProfitCenter?.code ?? ""}-${from}-to-${to}`, [
      { name: "Summary", rows: [{
        From: from, To: to, Furnace: furnaceId === "all" ? "All" : furnaces.find((f) => f.id === furnaceId)?.code ?? "",
        MaterialCost: breakdown.materialCost, ConversionCost: breakdown.conversionCost, TotalCost: breakdown.totalCost,
        ProductionMT: breakdown.productionMt, CostPerMT: breakdown.costPerMt, CostPerMn: breakdown.costPerMn,
        VarianceVsTarget: breakdown.varianceVsTarget,
      }] },
      { name: "Heats", rows: heats.map((h) => ({ Heat: h.heatNumber, TapTime: h.tapTime, WeightMT: h.weightMt, PowerMWh: h.powerMwh })) },
    ]);
    toast({ title: "Cost sheet exported" });
  };

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>Costing</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace.</CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>Cost sheet — {activeProfitCenter.name}</CardTitle>
          <CardDescription>Material cost + conversion (power × rate + fixed × days). Configure rates under Master Data and the cost settings under Admin → Settings (keys <code>costing.power_rate_per_mwh</code>, <code>costing.fixed_cost_per_day</code>, <code>costing.target_cost_per_mt</code>, <code>costing.target_grade_mn_pct</code>).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div>
              <Label>Furnace</Label>
              <Select value={furnaceId} onValueChange={setFurnaceId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All furnaces</SelectItem>
                  {furnaces.map((f) => <SelectItem key={f.id} value={f.id}>{f.code} — {f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end"><Button variant="outline" onClick={handleExport}><Download className="mr-2 h-4 w-4" /> Export</Button></div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Material cost</p><p className="mt-2 text-2xl font-semibold">{fmt(breakdown.materialCost)}</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Conversion cost</p><p className="mt-2 text-2xl font-semibold">{fmt(breakdown.conversionCost)}</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total cost</p><p className="mt-2 text-2xl font-semibold">{fmt(breakdown.totalCost)}</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Production (MT)</p><p className="mt-2 text-2xl font-semibold">{fmt(breakdown.productionMt)}</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Cost / MT</p><p className="mt-2 text-2xl font-semibold">{fmt(breakdown.costPerMt)}</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Cost / Mn point</p><p className="mt-2 text-2xl font-semibold">{fmt(breakdown.costPerMn)}</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Variance vs target</p><p className={`mt-2 text-2xl font-semibold ${(breakdown.varianceVsTarget ?? 0) > 0 ? "text-destructive" : ""}`}>{fmt(breakdown.varianceVsTarget)}</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Heats in scope</p><p className="mt-2 text-2xl font-semibold">{heats.length}</p></CardContent></Card>
          </div>

          <Table>
            <TableHeader><TableRow><TableHead>Heat #</TableHead><TableHead>Tap time</TableHead><TableHead className="text-right">Weight (MT)</TableHead><TableHead className="text-right">Power (MWh)</TableHead></TableRow></TableHeader>
            <TableBody>
              {heats.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">{h.heatNumber}</TableCell>
                  <TableCell>{new Date(h.tapTime).toLocaleString()}</TableCell>
                  <TableCell className="text-right">{h.weightMt ?? "—"}</TableCell>
                  <TableCell className="text-right">{h.powerMwh ?? "—"}</TableCell>
                </TableRow>
              ))}
              {heats.length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No heats in selected range.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
