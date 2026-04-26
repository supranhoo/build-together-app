/**
 * Ferro Costing Engine — heat-based Cost Sheet builder (Phase D).
 *
 * Selects ONE approved heat and computes a deterministic cost sheet:
 *   material cost (per-line) + power cost + fixed cost
 *   − by-product credit
 *   = net cost / MT  (and cost per Mn point + recovery %)
 *
 * Saves the full payload to `ferro_cost_sheets` for history & audit.
 * History list is rendered below the engine — same component, no separate
 * route needed.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Download, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { fetchFurnaces, fetchHeatLogs, type Furnace, type HeatLog } from "@/lib/production";
import { fetchCostRates, type CostRate, type MasterItem } from "@/lib/master-data";
import { latestRateOn, daysBetween } from "@/lib/costing";
import {
  buildFerroCostSheet,
  byproductRateOn,
  createFerroCostSheet,
  fetchByproductCredits,
  fetchFerroCostSheets,
  fetchHeatApprovals,
  type ByproductCredit,
  type FerroCostSheet,
  type HeatLogApproval,
} from "@/lib/finance";
import { exportRows } from "@/lib/excel-export";

const client = supabase as unknown as { from: (t: string) => any };

interface SettingValue {
  power_rate_per_mwh?: number;
  fixed_cost_per_day?: number;
}

const fmt = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: d });

export default function PortalFerroCostSheet() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const userId = session?.user?.id;

  const [furnaces, setFurnaces] = useState<Furnace[]>([]);
  const [approvedHeats, setApprovedHeats] = useState<HeatLog[]>([]);
  const [approvalById, setApprovalById] = useState<Map<string, HeatLogApproval>>(new Map());
  const [rates, setRates] = useState<CostRate[]>([]);
  const [credits, setCredits] = useState<ByproductCredit[]>([]);
  const [materials, setMaterials] = useState<MasterItem[]>([]);
  const [settings, setSettings] = useState<SettingValue>({});
  const [history, setHistory] = useState<FerroCostSheet[]>([]);

  const [selectedHeatId, setSelectedHeatId] = useState<string>("");
  const [grade, setGrade] = useState("");
  const [product, setProduct] = useState("");
  const [gradeMnPct, setGradeMnPct] = useState<string>("");
  const [byproductSlagMt, setByproductSlagMt] = useState<string>("");
  const [byproductDustMt, setByproductDustMt] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [consumption, setConsumption] = useState<Array<{ materialId: string; quantity: number }>>([]);
  const [saving, setSaving] = useState(false);

  // Initial loads
  useEffect(() => {
    if (!activeProfitCenter) return;
    (async () => {
      try {
        const [f, r, c, m, s, sheets, approvals, allHeats] = await Promise.all([
          fetchFurnaces(activeProfitCenter.id),
          fetchCostRates(activeProfitCenter.id),
          fetchByproductCredits(activeProfitCenter.id),
          (async () => {
            const { data, error } = await client
              .from("materials")
              .select("id, code, name, uom")
              .eq("profit_center_id", activeProfitCenter.id);
            if (error) throw error;
            return (data ?? []) as MasterItem[];
          })(),
          client
            .from("profit_center_settings")
            .select("setting_key, setting_value")
            .eq("profit_center_id", activeProfitCenter.id)
            .like("setting_key", "costing.%"),
          fetchFerroCostSheets(activeProfitCenter.id),
          fetchHeatApprovals(activeProfitCenter.id, { status: "approved" }),
          fetchHeatLogs(activeProfitCenter.id, {}),
        ]);
        setFurnaces(f);
        setRates(r);
        setCredits(c);
        setMaterials(m);
        setHistory(sheets);

        const merged: SettingValue = {};
        for (const row of (s.data ?? [])) {
          const key = (row.setting_key as string).replace("costing.", "");
          const val = (row.setting_value as { value?: number } | null)?.value;
          if (typeof val === "number") (merged as Record<string, number>)[key] = val;
        }
        setSettings(merged);

        const approvedIds = new Set(approvals.map((a) => a.heatLogId));
        const map = new Map<string, HeatLogApproval>();
        for (const a of approvals) map.set(a.heatLogId, a);
        setApprovalById(map);
        setApprovedHeats(allHeats.filter((h) => approvedIds.has(h.id) && !h.isVoided));
      } catch (e) {
        toast({
          title: "Failed to load Cost Sheet inputs",
          description: e instanceof Error ? e.message : "",
          variant: "destructive",
        });
      }
    })();
  }, [activeProfitCenter?.id, toast]);

  // When a heat is selected, fetch its consumption and any metallurgy info.
  useEffect(() => {
    if (!selectedHeatId) {
      setConsumption([]);
      return;
    }
    (async () => {
      try {
        const { data, error } = await client
          .from("material_consumption")
          .select("material_id, quantity")
          .eq("heat_log_id", selectedHeatId);
        if (error) throw error;
        setConsumption(
          (data ?? []).map((r: { material_id: string; quantity: number | string }) => ({
            materialId: r.material_id,
            quantity: Number(r.quantity),
          })),
        );
        // Try to pull grade / product from heat_metallurgy for convenience.
        const { data: met } = await client
          .from("heat_metallurgy")
          .select("grade, product, fg_mn_pct")
          .eq("heat_log_id", selectedHeatId)
          .maybeSingle();
        if (met) {
          if (met.grade) setGrade(met.grade);
          if (met.product) setProduct(met.product);
          if (met.fg_mn_pct != null) setGradeMnPct(String(met.fg_mn_pct));
        }
      } catch (e) {
        toast({
          title: "Failed to load heat data",
          description: e instanceof Error ? e.message : "",
          variant: "destructive",
        });
      }
    })();
  }, [selectedHeatId, toast]);

  const selectedHeat = useMemo(
    () => approvedHeats.find((h) => h.id === selectedHeatId) ?? null,
    [approvedHeats, selectedHeatId],
  );
  const sheetDate = selectedHeat?.tapTime.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

  const rateByMaterial = useMemo(() => {
    const m: Record<string, number | null> = {};
    for (const c of consumption) {
      const r = latestRateOn(rates, c.materialId, sheetDate);
      m[c.materialId] = r?.rate ?? null;
    }
    return m;
  }, [consumption, rates, sheetDate]);

  const byproductByType = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    const slag = Number(byproductSlagMt);
    const dust = Number(byproductDustMt);
    if (Number.isFinite(slag) && slag > 0) out.slag = slag;
    if (Number.isFinite(dust) && dust > 0) out.dust = dust;
    return out;
  }, [byproductSlagMt, byproductDustMt]);

  const byproductRateByType = useMemo<Record<string, number | null>>(() => {
    const out: Record<string, number | null> = {};
    for (const t of Object.keys(byproductByType)) {
      out[t] = byproductRateOn(credits, t, sheetDate);
    }
    return out;
  }, [byproductByType, credits, sheetDate]);

  const sheet = useMemo(() => {
    if (!selectedHeat) return null;
    return buildFerroCostSheet({
      productionMt: selectedHeat.weightMt ?? 0,
      consumption,
      rateByMaterial,
      powerMwh: selectedHeat.powerMwh ?? 0,
      powerRatePerMwh: settings.power_rate_per_mwh ?? 0,
      fixedCostPerDay: settings.fixed_cost_per_day ?? 0,
      days: 1, // single-heat sheet uses one tap day; date-range cost sheet stays in PortalCosting
      byproductByType,
      byproductRateByType,
      gradeMnPct: gradeMnPct === "" ? null : Number(gradeMnPct),
      inputMnQty: null, // recovery requires per-material Mn% — surfaced in Recovery & Costing tab
    });
  }, [selectedHeat, consumption, rateByMaterial, settings, byproductByType, byproductRateByType, gradeMnPct]);

  const materialName = (id: string) => materials.find((m) => m.id === id)?.code ?? id.slice(0, 6);
  const furnaceCode = (id: string) => furnaces.find((f) => f.id === id)?.code ?? id.slice(0, 6);

  const handleSave = async () => {
    if (!activeProfitCenter || !userId || !selectedHeat || !sheet) return;
    if (!grade.trim()) {
      toast({ title: "Grade is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createFerroCostSheet({
        profitCenterId: activeProfitCenter.id,
        heatLogId: selectedHeat.id,
        sheetDate,
        grade: grade.trim(),
        product: product.trim() || null,
        productionMt: sheet.productionMt,
        grossCost: sheet.grossCost,
        byproductCredit: sheet.byproductCredit,
        netCost: sheet.netCost,
        netCostPerMt: sheet.netCostPerMt,
        payload: sheet,
        notes: notes.trim() || null,
        createdBy: userId,
      });
      toast({ title: "Cost sheet saved", description: `Heat ${selectedHeat.heatNumber}` });
      const refreshed = await fetchFerroCostSheets(activeProfitCenter.id);
      setHistory(refreshed);
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    if (!selectedHeat || !sheet) return;
    exportRows(`ferro-cost-sheet-${selectedHeat.heatNumber}`, [
      {
        name: "Summary",
        rows: [{
          Heat: selectedHeat.heatNumber,
          TapTime: selectedHeat.tapTime,
          Grade: grade,
          Product: product,
          ProductionMT: sheet.productionMt,
          MaterialCost: sheet.materialCost,
          PowerCost: sheet.powerCost,
          FixedCost: sheet.fixedCost,
          GrossCost: sheet.grossCost,
          ByproductCredit: sheet.byproductCredit,
          NetCost: sheet.netCost,
          NetCostPerMT: sheet.netCostPerMt,
          CostPerMnPoint: sheet.costPerMnPoint,
        }],
      },
      {
        name: "Materials",
        rows: sheet.materialLines.map((l) => ({
          Material: materialName(l.materialId),
          Quantity: l.quantity,
          Rate: l.rate,
          Cost: l.cost,
        })),
      },
    ]);
  };

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardHeader><CardTitle>Cost Sheet</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">Select a workspace.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>Ferro Costing Engine — {activeProfitCenter.name}</CardTitle>
          <CardDescription>
            Build a cost sheet from one approved heat. Material rates, power tariff
            and by-product credits are resolved from the heat's tap date — the
            sheet is fully deterministic.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {approvedHeats.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No approved heats found. Submit and approve heats under the
              Heat Approvals tab to enable cost sheets.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Label>Approved heat</Label>
              <Select value={selectedHeatId} onValueChange={setSelectedHeatId}>
                <SelectTrigger><SelectValue placeholder="Pick an approved heat…" /></SelectTrigger>
                <SelectContent>
                  {approvedHeats.map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.heatNumber} · {furnaceCode(h.furnaceId)} · {new Date(h.tapTime).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Grade</Label>
              <Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. Si-Mn-65" />
            </div>
            <div>
              <Label>Product (optional)</Label>
              <Input value={product} onChange={(e) => setProduct(e.target.value)} />
            </div>
            <div>
              <Label>Mn % in FG</Label>
              <Input type="number" value={gradeMnPct} onChange={(e) => setGradeMnPct(e.target.value)} step="0.01" />
            </div>
            <div>
              <Label>By-product slag (MT)</Label>
              <Input type="number" value={byproductSlagMt} onChange={(e) => setByproductSlagMt(e.target.value)} step="0.01" />
            </div>
            <div>
              <Label>By-product dust (MT)</Label>
              <Input type="number" value={byproductDustMt} onChange={(e) => setByproductDustMt(e.target.value)} step="0.01" />
            </div>
            <div className="sm:col-span-2 lg:col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          {sheet && selectedHeat && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Material cost</p><p className="mt-2 text-2xl font-semibold">{fmt(sheet.materialCost)}</p></CardContent></Card>
                <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Conversion (power + fixed)</p><p className="mt-2 text-2xl font-semibold">{fmt(sheet.conversionCost)}</p></CardContent></Card>
                <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">By-product credit</p><p className="mt-2 text-2xl font-semibold text-emerald-600">{fmt(sheet.byproductCredit)}</p></CardContent></Card>
                <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Net cost</p><p className="mt-2 text-2xl font-semibold">{fmt(sheet.netCost)}</p></CardContent></Card>
                <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Production (MT)</p><p className="mt-2 text-2xl font-semibold">{fmt(sheet.productionMt)}</p></CardContent></Card>
                <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Net cost / MT</p><p className="mt-2 text-2xl font-semibold">{fmt(sheet.netCostPerMt)}</p></CardContent></Card>
                <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Cost / Mn point</p><p className="mt-2 text-2xl font-semibold">{fmt(sheet.costPerMnPoint)}</p></CardContent></Card>
                <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Approval</p><p className="mt-2 text-sm">{approvalById.get(selectedHeat.id)?.decidedAt ? new Date(approvalById.get(selectedHeat.id)!.decidedAt!).toLocaleString() : "—"}</p></CardContent></Card>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sheet.materialLines.map((l) => (
                    <TableRow key={l.materialId}>
                      <TableCell className="font-medium">{materialName(l.materialId)}</TableCell>
                      <TableCell className="text-right">{fmt(l.quantity, 3)}</TableCell>
                      <TableCell className="text-right">{l.rate === null ? <span className="text-destructive">no rate</span> : fmt(l.rate)}</TableCell>
                      <TableCell className="text-right">{fmt(l.cost)}</TableCell>
                    </TableRow>
                  ))}
                  {sheet.materialLines.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-muted-foreground">No consumption recorded for this heat.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" /> Save cost sheet
                </Button>
                <Button variant="outline" onClick={handleExport}>
                  <Download className="mr-2 h-4 w-4" /> Export Excel
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Saved cost sheets — immutable once created.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Heat</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead className="text-right">Production (MT)</TableHead>
                <TableHead className="text-right">Net cost</TableHead>
                <TableHead className="text-right">Net / MT</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((s) => {
                const heat = approvedHeats.find((h) => h.id === s.heatLogId);
                return (
                  <TableRow key={s.id}>
                    <TableCell>{s.sheetDate}</TableCell>
                    <TableCell className="font-medium">{heat?.heatNumber ?? s.heatLogId.slice(0, 8)}</TableCell>
                    <TableCell>{s.grade}</TableCell>
                    <TableCell className="text-right">{fmt(s.productionMt)}</TableCell>
                    <TableCell className="text-right">{fmt(s.netCost)}</TableCell>
                    <TableCell className="text-right">{fmt(s.netCostPerMt)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.notes ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
              {history.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-muted-foreground">No saved sheets yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
