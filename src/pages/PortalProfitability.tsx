/**
 * Portal Profitability — Phase C.
 *
 * Per-grade table: Selling Price | Net Cost/MT | Margin/MT | Margin %.
 * Net cost = (material+conversion cost / production MT) − by-product credit/MT.
 * Reuses Phase B grade scoping (heat_metallurgy.grade ↔ heat_logs).
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
import { supabase } from "@/integrations/supabase/client";
import { fetchCostRates, type CostRate } from "@/lib/master-data";
import { latestRateOn, materialCost as computeMaterialCost } from "@/lib/costing";
import {
  fetchByproductCredits,
  fetchSellingPrices,
  byproductCreditTotal,
  profitabilityByGrade,
  type ByproductCredit,
  type SellingPrice,
} from "@/lib/finance";
import { exportRows } from "@/lib/excel-export";

const client = supabase as unknown as { from: (t: string) => any };

interface HeatRow { id: string; tap_time: string; weight_mt: number | null; power_mwh: number | null; }
interface MetRow { heat_log_id: string; grade: string | null; slag_qty_mt: number | null; dust_qty_mt: number | null; }
interface ConsumptionRow { heat_log_id: string; material_id: string; quantity: number; }

export default function PortalProfitability() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [prices, setPrices] = useState<SellingPrice[]>([]);
  const [credits, setCredits] = useState<ByproductCredit[]>([]);
  const [rates, setRates] = useState<CostRate[]>([]);
  const [heats, setHeats] = useState<HeatRow[]>([]);
  const [met, setMet] = useState<MetRow[]>([]);
  const [consumption, setConsumption] = useState<ConsumptionRow[]>([]);
  const [powerRate, setPowerRate] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeProfitCenter) return;
    (async () => {
      try {
        const [p, c, r, s] = await Promise.all([
          fetchSellingPrices(activeProfitCenter.id),
          fetchByproductCredits(activeProfitCenter.id),
          fetchCostRates(activeProfitCenter.id),
          client.from("profit_center_settings")
            .select("setting_key, setting_value")
            .eq("profit_center_id", activeProfitCenter.id)
            .eq("setting_key", "costing.power_rate_per_mwh"),
        ]);
        setPrices(p); setCredits(c); setRates(r);
        const v = (s.data?.[0]?.setting_value as any)?.value;
        if (typeof v === "number") setPowerRate(v);
      } catch (e) {
        toast({ title: "Failed to load profitability inputs", description: e instanceof Error ? e.message : "", variant: "destructive" });
      }
    })();
  }, [activeProfitCenter?.id, toast]);

  useEffect(() => {
    if (!activeProfitCenter) return;
    setLoading(true);
    (async () => {
      try {
        const fromTs = `${from}T00:00:00.000Z`;
        const toTs = `${to}T23:59:59.999Z`;
        const heatsRes = await client
          .from("heat_logs")
          .select("id, tap_time, weight_mt, power_mwh")
          .eq("profit_center_id", activeProfitCenter.id)
          .eq("is_voided", false)
          .gte("tap_time", fromTs)
          .lte("tap_time", toTs);
        if (heatsRes.error) throw heatsRes.error;
        const h = (heatsRes.data ?? []) as HeatRow[];
        setHeats(h);
        if (h.length === 0) { setMet([]); setConsumption([]); return; }
        const ids = h.map((x) => x.id);
        const [m, c] = await Promise.all([
          client.from("heat_metallurgy").select("heat_log_id, grade, slag_qty_mt, dust_qty_mt").in("heat_log_id", ids),
          client.from("material_consumption").select("heat_log_id, material_id, quantity").in("heat_log_id", ids),
        ]);
        if (m.error) throw m.error;
        if (c.error) throw c.error;
        setMet((m.data ?? []) as MetRow[]);
        setConsumption(((c.data ?? []) as any[]).map((r) => ({ heat_log_id: r.heat_log_id, material_id: r.material_id, quantity: Number(r.quantity) })));
      } catch (e) {
        toast({ title: "Failed to load period data", description: e instanceof Error ? e.message : "", variant: "destructive" });
      } finally { setLoading(false); }
    })();
  }, [activeProfitCenter?.id, from, to, toast]);

  const rows = useMemo(() => {
    if (heats.length === 0) return [];
    const gradeByHeat = new Map(met.map((m) => [m.heat_log_id, m.grade]));
    const slagByHeat = new Map(met.map((m) => [m.heat_log_id, Number(m.slag_qty_mt ?? 0)]));
    const dustByHeat = new Map(met.map((m) => [m.heat_log_id, Number(m.dust_qty_mt ?? 0)]));

    const grades = Array.from(new Set(met.map((m) => m.grade).filter((g): g is string => !!g)));
    const netCostPerMt: Record<string, number> = {};

    for (const grade of grades) {
      const heatsForGrade = heats.filter((h) => gradeByHeat.get(h.id) === grade);
      if (heatsForGrade.length === 0) continue;
      const heatIdSet = new Set(heatsForGrade.map((h) => h.id));
      const production = heatsForGrade.reduce((s, h) => s + (h.weight_mt ?? 0), 0);
      if (production <= 0) continue;
      const power = heatsForGrade.reduce((s, h) => s + (h.power_mwh ?? 0), 0);

      const lines = consumption
        .filter((c) => heatIdSet.has(c.heat_log_id))
        .map((c) => ({ materialId: c.material_id, quantity: c.quantity }));
      const matCost = computeMaterialCost(lines, rates, to);
      const convCost = power * powerRate;
      const grossCost = matCost + convCost;

      const slag = heatsForGrade.reduce((s, h) => s + (slagByHeat.get(h.id) ?? 0), 0);
      const dust = heatsForGrade.reduce((s, h) => s + (dustByHeat.get(h.id) ?? 0), 0);
      const credit = byproductCreditTotal(credits, { slag, dust }, to);

      netCostPerMt[grade] = (grossCost - credit) / production;
    }

    return profitabilityByGrade({ netCostPerMt, prices, onDate: to });
  }, [heats, met, consumption, rates, credits, prices, powerRate, to]);

  const fmt = (n: number | null) => n === null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const fmtPct = (n: number | null) => n === null ? "—" : `${(n * 100).toFixed(1)}%`;

  const handleExport = () => {
    exportRows(`profitability-${activeProfitCenter?.code ?? ""}-${from}-to-${to}`, [
      { name: "ByGrade", rows: rows.map((r) => ({
        Grade: r.grade, SellingPrice: r.sellingPrice, NetCostPerMT: r.netCost,
        MarginPerMT: r.marginPerMt, MarginPct: r.marginPct,
      })) },
    ]);
    toast({ title: "Profitability exported" });
  };

  void latestRateOn;

  if (!activeProfitCenter) return <Card><CardHeader><CardTitle>Profitability</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace.</CardContent></Card>;

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>Profitability — {activeProfitCenter.name}</CardTitle>
          <CardDescription>
            Selling price − net cost / MT, per grade. Net cost = (material + power) − by-product credit, divided by production MT.
            Grades without a graded heat or without a selling price are excluded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div className="flex items-end"><Button variant="outline" onClick={handleExport}><Download className="mr-2 h-4 w-4" /> Export</Button></div>
          </div>

          <Table>
            <TableHeader><TableRow>
              <TableHead>Grade</TableHead>
              <TableHead className="text-right">Selling price ₹/MT</TableHead>
              <TableHead className="text-right">Net cost ₹/MT</TableHead>
              <TableHead className="text-right">Margin ₹/MT</TableHead>
              <TableHead className="text-right">Margin %</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={5} className="text-muted-foreground">Loading…</TableCell></TableRow>}
              {!loading && rows.map((r) => (
                <TableRow key={r.grade}>
                  <TableCell className="font-medium">{r.grade}</TableCell>
                  <TableCell className="text-right">{fmt(r.sellingPrice)}</TableCell>
                  <TableCell className="text-right">{fmt(r.netCost)}</TableCell>
                  <TableCell className={`text-right ${r.marginPerMt !== null && r.marginPerMt < 0 ? "text-destructive" : ""}`}>{fmt(r.marginPerMt)}</TableCell>
                  <TableCell className="text-right">{fmtPct(r.marginPct)}</TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No graded production in range.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
