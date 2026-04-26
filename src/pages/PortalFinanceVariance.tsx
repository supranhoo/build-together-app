/**
 * Portal Variance Matrix — Phase B.
 *
 * IDEAL vs ACTUAL vs VARIANCE per material for a chosen grade and date
 * range. Decomposition uses pure functions in `src/lib/finance.ts`.
 *
 *   priceVariance = (actualRate − stdRate) × actualQty
 *   usageVariance = (actualQty  − stdQty)  × stdRate
 *
 * Production volume is summed from non-voided heat_logs in scope. When
 * heat_metallurgy.grade exists for a heat, that is used to filter; otherwise
 * a heat falls into "ungraded" and is excluded from variance (still surfaces
 * in cost sheet).
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fetchMasterItems, fetchCostRates, type MasterItem, type CostRate } from "@/lib/master-data";
import { latestRateOn } from "@/lib/costing";
import {
  buildVarianceRows,
  fetchStandardBom,
  sumVariance,
  type StandardCostBom,
} from "@/lib/finance";
import { exportRows } from "@/lib/excel-export";

const client = supabase as unknown as { from: (t: string) => any };

interface HeatRow {
  id: string;
  tap_time: string;
  weight_mt: number | null;
}
interface MetRow {
  heat_log_id: string;
  grade: string | null;
}
interface ConsumptionRow {
  heat_log_id: string;
  material_id: string;
  quantity: number;
}

export default function PortalFinanceVariance() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [grade, setGrade] = useState<string>("");
  const [bom, setBom] = useState<StandardCostBom[]>([]);
  const [items, setItems] = useState<MasterItem[]>([]);
  const [rates, setRates] = useState<CostRate[]>([]);
  const [heats, setHeats] = useState<HeatRow[]>([]);
  const [met, setMet] = useState<MetRow[]>([]);
  const [consumption, setConsumption] = useState<ConsumptionRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Static reference data
  useEffect(() => {
    if (!activeProfitCenter) return;
    (async () => {
      try {
        const [b, i, r] = await Promise.all([
          fetchStandardBom(activeProfitCenter.id),
          fetchMasterItems(activeProfitCenter.id),
          fetchCostRates(activeProfitCenter.id),
        ]);
        setBom(b);
        setItems(i);
        setRates(r);
        // Default grade picks the most-used active grade in the BOM.
        const firstGrade = Array.from(new Set(b.filter((x) => x.isActive).map((x) => x.grade)))[0];
        if (firstGrade) setGrade(firstGrade);
      } catch (e) {
        toast({
          title: "Failed to load variance inputs",
          description: e instanceof Error ? e.message : "",
          variant: "destructive",
        });
      }
    })();
  }, [activeProfitCenter?.id, toast]);

  // Period-scoped data
  useEffect(() => {
    if (!activeProfitCenter) return;
    (async () => {
      setLoading(true);
      try {
        const fromTs = `${from}T00:00:00.000Z`;
        const toTs = `${to}T23:59:59.999Z`;

        const heatsRes = await client
          .from("heat_logs")
          .select("id, tap_time, weight_mt")
          .eq("profit_center_id", activeProfitCenter.id)
          .eq("is_voided", false)
          .gte("tap_time", fromTs)
          .lte("tap_time", toTs);
        if (heatsRes.error) throw heatsRes.error;
        const h = (heatsRes.data ?? []) as HeatRow[];
        setHeats(h);

        if (h.length === 0) {
          setMet([]);
          setConsumption([]);
          return;
        }
        const heatIds = h.map((x) => x.id);

        const [metRes, consRes] = await Promise.all([
          client.from("heat_metallurgy").select("heat_log_id, grade").in("heat_log_id", heatIds),
          client.from("material_consumption").select("heat_log_id, material_id, quantity").in("heat_log_id", heatIds),
        ]);
        if (metRes.error) throw metRes.error;
        if (consRes.error) throw consRes.error;
        setMet((metRes.data ?? []) as MetRow[]);
        setConsumption(((consRes.data ?? []) as any[]).map((r) => ({
          heat_log_id: r.heat_log_id,
          material_id: r.material_id,
          quantity: Number(r.quantity),
        })));
      } catch (e) {
        toast({
          title: "Failed to load period data",
          description: e instanceof Error ? e.message : "",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [activeProfitCenter?.id, from, to, toast]);

  const grades = useMemo(
    () => Array.from(new Set(bom.filter((b) => b.isActive).map((b) => b.grade))).sort(),
    [bom],
  );
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Compute variance for selected grade
  const { rows, totals, productionMt, heatsInGrade } = useMemo(() => {
    if (!grade) {
      return {
        rows: [],
        totals: { idealCost: 0, actualCost: 0, priceVariance: 0, usageVariance: 0, totalVariance: 0 },
        productionMt: 0,
        heatsInGrade: 0,
      };
    }
    const gradeByHeat = new Map(met.map((m) => [m.heat_log_id, m.grade]));
    const heatsForGrade = heats.filter((h) => gradeByHeat.get(h.id) === grade);
    const heatIdSet = new Set(heatsForGrade.map((h) => h.id));
    const production = heatsForGrade.reduce((s, h) => s + (h.weight_mt ?? 0), 0);

    const actualByMaterial: Record<string, number> = {};
    for (const c of consumption) {
      if (!heatIdSet.has(c.heat_log_id)) continue;
      actualByMaterial[c.material_id] = (actualByMaterial[c.material_id] ?? 0) + c.quantity;
    }

    const rateByMaterial: Record<string, number | null> = {};
    for (const materialId of new Set([
      ...Object.keys(actualByMaterial),
      ...bom.filter((b) => b.grade === grade).map((b) => b.materialId),
    ])) {
      const r = latestRateOn(rates, materialId, to);
      rateByMaterial[materialId] = r?.rate ?? null;
    }

    const built = buildVarianceRows({
      productionMt: production,
      grade,
      onDate: to,
      actualByMaterial,
      bom,
      rateByMaterial,
    });
    return {
      rows: built,
      totals: sumVariance(built),
      productionMt: production,
      heatsInGrade: heatsForGrade.length,
    };
  }, [grade, met, heats, consumption, bom, rates, to]);

  const fmt = (n: number | null) =>
    n === null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const signed = (n: number) =>
    n.toLocaleString(undefined, { maximumFractionDigits: 2, signDisplay: "exceptZero" });

  const handleExport = () => {
    if (!activeProfitCenter) return;
    exportRows(`variance-${activeProfitCenter.code}-${grade || "no-grade"}-${from}-to-${to}`, [
      {
        name: "Summary",
        rows: [{
          From: from, To: to, Grade: grade, ProductionMT: productionMt,
          IdealCost: totals.idealCost, ActualCost: totals.actualCost,
          PriceVariance: totals.priceVariance, UsageVariance: totals.usageVariance,
          TotalVariance: totals.totalVariance,
        }],
      },
      {
        name: "ByMaterial",
        rows: rows.map((r) => {
          const m = itemMap.get(r.materialId);
          return {
            Material: m ? `${m.code} — ${m.name}` : r.materialId,
            IdealQty: r.idealQty, ActualQty: r.actualQty,
            StdRate: r.stdRate, ActualRate: r.actualRate,
            IdealCost: r.idealCost, ActualCost: r.actualCost,
            PriceVar: r.priceVariance, UsageVar: r.usageVariance, TotalVar: r.totalVariance,
          };
        }),
      },
    ]);
    toast({ title: "Variance exported" });
  };

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardHeader><CardTitle>Variance Analysis</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">Select a workspace.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>Variance Analysis — {activeProfitCenter.name}</CardTitle>
          <CardDescription>
            IDEAL (Standard BOM × production) vs ACTUAL (consumption × latest rate),
            decomposed into price variance and usage variance per material. Positive = overspend.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div>
              <Label>Grade</Label>
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger>
                  <SelectValue placeholder={grades.length === 0 ? "No active BOM" : "Select grade"} />
                </SelectTrigger>
                <SelectContent>
                  {grades.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={handleExport}
                disabled={rows.length === 0}
              >
                <Download className="mr-2 h-4 w-4" /> Export
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card><CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Production (MT) · {grade || "—"}</p>
              <p className="mt-2 text-2xl font-semibold">{fmt(productionMt)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{heatsInGrade} heats in grade</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Ideal cost</p>
              <p className="mt-2 text-2xl font-semibold">{fmt(totals.idealCost)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Actual cost</p>
              <p className="mt-2 text-2xl font-semibold">{fmt(totals.actualCost)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Total variance</p>
              <p className={`mt-2 text-2xl font-semibold ${totals.totalVariance > 0 ? "text-destructive" : totals.totalVariance < 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                {signed(totals.totalVariance)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Price {signed(totals.priceVariance)} · Usage {signed(totals.usageVariance)}
              </p>
            </CardContent></Card>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Ideal qty</TableHead>
                <TableHead className="text-right">Actual qty</TableHead>
                <TableHead className="text-right">Std rate</TableHead>
                <TableHead className="text-right">Actual rate</TableHead>
                <TableHead className="text-right">Ideal cost</TableHead>
                <TableHead className="text-right">Actual cost</TableHead>
                <TableHead className="text-right">Price var.</TableHead>
                <TableHead className="text-right">Usage var.</TableHead>
                <TableHead className="text-right">Total var.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={10} className="text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!loading && rows.map((r) => {
                const m = itemMap.get(r.materialId);
                return (
                  <TableRow key={r.materialId}>
                    <TableCell className="font-medium">{m ? `${m.code} — ${m.name}` : r.materialId}</TableCell>
                    <TableCell className="text-right">{fmt(r.idealQty)}</TableCell>
                    <TableCell className="text-right">{fmt(r.actualQty)}</TableCell>
                    <TableCell className="text-right">{fmt(r.stdRate)}</TableCell>
                    <TableCell className="text-right">{fmt(r.actualRate)}</TableCell>
                    <TableCell className="text-right">{fmt(r.idealCost)}</TableCell>
                    <TableCell className="text-right">{fmt(r.actualCost)}</TableCell>
                    <TableCell className={`text-right ${r.priceVariance > 0 ? "text-destructive" : ""}`}>{signed(r.priceVariance)}</TableCell>
                    <TableCell className={`text-right ${r.usageVariance > 0 ? "text-destructive" : ""}`}>{signed(r.usageVariance)}</TableCell>
                    <TableCell className={`text-right font-semibold ${r.totalVariance > 0 ? "text-destructive" : r.totalVariance < 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{signed(r.totalVariance)}</TableCell>
                  </TableRow>
                );
              })}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-muted-foreground">
                    {grades.length === 0
                      ? "No active Standard BOM rows yet — add one in Admin → Finance → Standard BOM."
                      : "No production data for this grade in the selected range."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
