/**
 * Admin Period Close — Phase C.
 *
 * Workflow:
 *   1. Pick a month → "Compute Preview"
 *   2. UI assembles summary + variance + power + by-products + profitability
 *      using the same pure functions used by the portal pages.
 *   3. "Lock Period" calls createPeriodSnapshot which inserts into the
 *      immutable cost_period_snapshots table (no UPDATE policy in the DB).
 *
 * Once locked, a snapshot cannot be unlocked from the UI. Super admins must
 * delete via DB if a re-close is needed.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { createAuditLog } from "@/lib/workspace";
import { fetchCostRates, type CostRate } from "@/lib/master-data";
import { latestRateOn, materialCost as computeMaterialCost } from "@/lib/costing";
import {
  buildSnapshotPayload,
  buildVarianceRows,
  byproductCreditTotal,
  createPeriodSnapshot,
  fetchByproductCredits,
  fetchPowerTariffSlabs,
  fetchSellingPrices,
  fetchSnapshots,
  fetchStandardBom,
  profitabilityByGrade,
  splitMwhByTodSlab,
  sumVariance,
  type ByproductCredit,
  type CostPeriodSnapshot,
  type PowerTariffSlab,
  type SellingPrice,
  type SnapshotPayload,
  type StandardCostBom,
} from "@/lib/finance";

const client = supabase as unknown as { from: (t: string) => any };

interface HeatRow { id: string; tap_time: string; weight_mt: number | null; power_mwh: number | null; is_voided: boolean; }
interface MetRow { heat_log_id: string; grade: string | null; slag_qty_mt: number | null; dust_qty_mt: number | null; }
interface ConsumptionRow { heat_log_id: string; material_id: string; quantity: number; }

const monthBounds = (yyyymm: string) => {
  const [y, m] = yyyymm.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0)); // last day
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
};

export default function AdminPeriodClose() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();

  const today = new Date();
  const defaultMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<SnapshotPayload | null>(null);
  const [computing, setComputing] = useState(false);
  const [locking, setLocking] = useState(false);
  const [snapshots, setSnapshots] = useState<CostPeriodSnapshot[]>([]);

  const { start, end } = useMemo(() => monthBounds(month), [month]);
  const alreadyLocked = useMemo(() => snapshots.some((s) => s.periodStart === start), [snapshots, start]);

  const loadSnapshots = async () => {
    if (!activeProfitCenter) return;
    try { setSnapshots(await fetchSnapshots(activeProfitCenter.id)); }
    catch (e) { toast({ title: "Failed to load snapshots", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
  };

  useEffect(() => { void loadSnapshots(); }, [activeProfitCenter?.id]);

  const compute = async () => {
    if (!activeProfitCenter) return;
    setComputing(true);
    setPreview(null);
    try {
      const [bom, prices, slabs, credits, rates, settingsRes] = await Promise.all([
        fetchStandardBom(activeProfitCenter.id),
        fetchSellingPrices(activeProfitCenter.id),
        fetchPowerTariffSlabs(activeProfitCenter.id),
        fetchByproductCredits(activeProfitCenter.id),
        fetchCostRates(activeProfitCenter.id),
        client.from("profit_center_settings")
          .select("setting_key, setting_value")
          .eq("profit_center_id", activeProfitCenter.id)
          .eq("setting_key", "costing.power_rate_per_mwh"),
      ]);
      const flatPowerRate = Number((settingsRes.data?.[0]?.setting_value as any)?.value ?? 0);

      const fromTs = `${start}T00:00:00.000Z`;
      const toTs = `${end}T23:59:59.999Z`;
      const heatsRes = await client
        .from("heat_logs")
        .select("id, tap_time, weight_mt, power_mwh, is_voided")
        .eq("profit_center_id", activeProfitCenter.id)
        .gte("tap_time", fromTs)
        .lte("tap_time", toTs);
      if (heatsRes.error) throw heatsRes.error;
      const heats = ((heatsRes.data ?? []) as HeatRow[]).filter((h) => !h.is_voided);
      const heatIds = heats.map((h) => h.id);

      let met: MetRow[] = [];
      let cons: ConsumptionRow[] = [];
      if (heatIds.length > 0) {
        const [m, c] = await Promise.all([
          client.from("heat_metallurgy").select("heat_log_id, grade, slag_qty_mt, dust_qty_mt").in("heat_log_id", heatIds),
          client.from("material_consumption").select("heat_log_id, material_id, quantity").in("heat_log_id", heatIds),
        ]);
        if (m.error) throw m.error;
        if (c.error) throw c.error;
        met = (m.data ?? []) as MetRow[];
        cons = ((c.data ?? []) as any[]).map((r) => ({ heat_log_id: r.heat_log_id, material_id: r.material_id, quantity: Number(r.quantity) }));
      }

      const productionMt = heats.reduce((s, h) => s + (h.weight_mt ?? 0), 0);
      const totalPower = heats.reduce((s, h) => s + (h.power_mwh ?? 0), 0);

      const allLines = cons.map((c) => ({ materialId: c.material_id, quantity: c.quantity }));
      const matCost = computeMaterialCost(allLines, rates, end);
      const todSlices = splitMwhByTodSlab(
        heats.map((h) => ({ tapTime: h.tap_time, powerMwh: h.power_mwh, isVoided: h.is_voided })),
        slabs,
        end,
      );
      const todPowerCost = todSlices.reduce((s, x) => s + x.costRs, 0);
      const convCost = todPowerCost > 0 ? todPowerCost : totalPower * flatPowerRate;
      const grossCost = matCost + convCost;

      const slag = met.reduce((s, m) => s + Number(m.slag_qty_mt ?? 0), 0);
      const dust = met.reduce((s, m) => s + Number(m.dust_qty_mt ?? 0), 0);
      const byproductByType = { slag, dust };
      const byproductCredit = byproductCreditTotal(credits, byproductByType, end);

      const gradeByHeat = new Map(met.map((m) => [m.heat_log_id, m.grade]));
      const grades = Array.from(new Set(met.map((m) => m.grade).filter((g): g is string => !!g)));
      let totalVariance = { idealCost: 0, actualCost: 0, priceVariance: 0, usageVariance: 0, totalVariance: 0 };
      const netCostPerMt: Record<string, number> = {};
      for (const grade of grades) {
        const heatsForGrade = heats.filter((h) => gradeByHeat.get(h.id) === grade);
        if (heatsForGrade.length === 0) continue;
        const heatIdSet = new Set(heatsForGrade.map((h) => h.id));
        const production = heatsForGrade.reduce((s, h) => s + (h.weight_mt ?? 0), 0);
        if (production <= 0) continue;
        const power = heatsForGrade.reduce((s, h) => s + (h.power_mwh ?? 0), 0);

        const linesForGrade = cons.filter((c) => heatIdSet.has(c.heat_log_id))
          .map((c) => ({ materialId: c.material_id, quantity: c.quantity }));
        const gradeMatCost = computeMaterialCost(linesForGrade, rates, end);
        const gradeConv = power * flatPowerRate;
        const gradeGross = gradeMatCost + gradeConv;

        const slagG = heatsForGrade.reduce((s, h) => s + Number(met.find((m) => m.heat_log_id === h.id)?.slag_qty_mt ?? 0), 0);
        const dustG = heatsForGrade.reduce((s, h) => s + Number(met.find((m) => m.heat_log_id === h.id)?.dust_qty_mt ?? 0), 0);
        const gradeCredit = byproductCreditTotal(credits, { slag: slagG, dust: dustG }, end);

        netCostPerMt[grade] = (gradeGross - gradeCredit) / production;

        const actualByMaterial: Record<string, number> = {};
        for (const c of linesForGrade) actualByMaterial[c.materialId] = (actualByMaterial[c.materialId] ?? 0) + c.quantity;
        const rateByMaterial: Record<string, number | null> = {};
        for (const materialId of new Set([
          ...Object.keys(actualByMaterial),
          ...bom.filter((b) => b.grade === grade).map((b) => b.materialId),
        ])) {
          const r = latestRateOn(rates, materialId, end);
          rateByMaterial[materialId] = r?.rate ?? null;
        }
        const rows = buildVarianceRows({ productionMt: production, grade, onDate: end, actualByMaterial, bom, rateByMaterial });
        const t = sumVariance(rows);
        totalVariance = {
          idealCost: totalVariance.idealCost + t.idealCost,
          actualCost: totalVariance.actualCost + t.actualCost,
          priceVariance: totalVariance.priceVariance + t.priceVariance,
          usageVariance: totalVariance.usageVariance + t.usageVariance,
          totalVariance: totalVariance.totalVariance + t.totalVariance,
        };
      }

      const profitability = profitabilityByGrade({ netCostPerMt, prices, onDate: end });

      const payload = buildSnapshotPayload({
        productionMt,
        grossCost,
        byproductCredit,
        byproductByType,
        variance: totalVariance,
        totalMwh: totalPower,
        todSlices,
        profitability,
        bomCount: bom.filter((b) => b.isActive).length,
        slabCount: slabs.filter((s) => s.isActive).length,
        priceCount: prices.filter((p) => p.isActive).length,
      });
      setPreview(payload);
      toast({ title: "Preview ready", description: `Net ₹/MT: ${payload.summary.netCostPerMt?.toLocaleString?.() ?? "—"}` });
    } catch (e) {
      toast({ title: "Compute failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setComputing(false); }
  };

  const lock = async () => {
    if (!activeProfitCenter || !session?.user || !preview) return;
    if (alreadyLocked) { toast({ title: "Period already locked", variant: "destructive" }); return; }
    if (!confirm(`Lock ${start} → ${end}? This cannot be undone from the UI.`)) return;
    setLocking(true);
    try {
      const snap = await createPeriodSnapshot({
        profitCenterId: activeProfitCenter.id,
        periodStart: start,
        periodEnd: end,
        payload: preview as unknown as Record<string, unknown>,
        notes: notes.trim() || null,
        lockedBy: session.user.id,
      });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "cost_period_snapshots",
        entityId: snap.id,
        action: "period.locked",
        changeSummary: { period_start: snap.periodStart, period_end: snap.periodEnd, net_cost_per_mt: preview.summary.netCostPerMt },
      });
      toast({ title: "Period locked" });
      setPreview(null);
      await loadSnapshots();
    } catch (e) {
      toast({ title: "Lock failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setLocking(false); }
  };

  const fmt = (n: number | null | undefined) => n === null || n === undefined ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  if (!activeProfitCenter) return <Card><CardHeader><CardTitle>Period Close</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace.</CardContent></Card>;

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>Period Close — {activeProfitCenter.name}</CardTitle>
          <CardDescription>
            Compute the month-end snapshot, review the numbers, then lock the period. Locked periods are immutable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Month</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <div className="sm:col-span-2 flex items-end gap-2">
              <Button onClick={() => void compute()} disabled={computing}>{computing ? "Computing…" : "Compute preview"}</Button>
              <Button variant="default" onClick={() => void lock()} disabled={!preview || locking || alreadyLocked}>
                {locking ? "Locking…" : alreadyLocked ? "Already locked" : "Lock period"}
              </Button>
              {alreadyLocked && <Badge variant="outline">Locked</Badge>}
            </div>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Closed after MIS reconciliation" rows={2} />
          </div>

          {preview && (
            <Card className="border-dashed">
              <CardHeader><CardTitle>Preview — {start} → {end}</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded border p-3"><p className="text-muted-foreground">Production MT</p><p className="text-lg font-semibold">{fmt(preview.summary.productionMt)}</p></div>
                  <div className="rounded border p-3"><p className="text-muted-foreground">Gross cost ₹</p><p className="text-lg font-semibold">{fmt(preview.summary.grossCost)}</p></div>
                  <div className="rounded border p-3"><p className="text-muted-foreground">By-product credit</p><p className="text-lg font-semibold">−{fmt(preview.summary.byproductCredit)}</p></div>
                  <div className="rounded border p-3"><p className="text-muted-foreground">Net cost ₹</p><p className="text-lg font-semibold">{fmt(preview.summary.netCost)}</p></div>
                  <div className="rounded border p-3"><p className="text-muted-foreground">Net ₹/MT</p><p className="text-lg font-semibold">{fmt(preview.summary.netCostPerMt)}</p></div>
                  <div className="rounded border p-3"><p className="text-muted-foreground">Total variance</p><p className={`text-lg font-semibold ${preview.variance.totalVariance > 0 ? "text-destructive" : ""}`}>{fmt(preview.variance.totalVariance)}</p></div>
                  <div className="rounded border p-3"><p className="text-muted-foreground">kWh / MT</p><p className="text-lg font-semibold">{fmt(preview.power.kwhPerMt)}</p></div>
                  <div className="rounded border p-3"><p className="text-muted-foreground">Power total ₹</p><p className="text-lg font-semibold">{fmt(preview.power.totalCost)}</p></div>
                  <div className="rounded border p-3"><p className="text-muted-foreground">Grades priced</p><p className="text-lg font-semibold">{preview.profitability.byGrade.filter((g) => g.sellingPrice !== null).length}</p></div>
                </div>
                <details className="rounded border bg-muted/40 p-3 text-xs">
                  <summary className="cursor-pointer font-medium">Full payload (JSON)</summary>
                  <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(preview, null, 2)}</pre>
                </details>
              </CardContent>
            </Card>
          )}
          <span className="hidden">{0 && (latestRateOn as unknown as number)}</span>
        </CardContent>
      </Card>
    </div>
  );
}

void (null as unknown as StandardCostBom);
void (null as unknown as PowerTariffSlab);
void (null as unknown as SellingPrice);
void (null as unknown as ByproductCredit);
