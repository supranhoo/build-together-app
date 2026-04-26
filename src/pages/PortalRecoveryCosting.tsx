/**
 * Recovery & Costing — multi-slot Report Comparison Engine (Phase D).
 *
 * Each slot represents a (furnace × date-range) selection. The engine
 * aggregates saved Ferro Cost Sheets that match each slot and computes:
 *   - heat count, production MT, kWh/MT
 *   - gross / by-product / net cost (₹ and per MT)
 *   - production-weighted recovery % and Mn % in FG
 *   - signed delta vs the chosen baseline slot (C1 by default)
 *
 * Presets are persisted to `cost_comparison_presets` so a user can save
 * useful slot configurations and reload them.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Save, Trash2 } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { fetchFurnaces, fetchHeatLogs, type Furnace, type HeatLog } from "@/lib/production";
import {
  aggregateSlotKpis,
  createComparisonPreset,
  deltaVsBaseline,
  fetchComparisonPresets,
  fetchFerroCostSheets,
  type ComparisonKpis,
  type ComparisonSlot,
  type CostComparisonPreset,
  type FerroCostSheet,
} from "@/lib/finance";

const fmt = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: d });

function deltaCell(value: number | null, betterIsLower = true) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const positive = value > 0;
  const good = betterIsLower ? !positive : positive;
  return (
    <span className={good ? "text-emerald-600" : "text-destructive"}>
      {value > 0 ? "+" : ""}
      {fmt(value)}
    </span>
  );
}

const ALL_FURNACES = "__ALL__";

export default function PortalRecoveryCosting() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const userId = session?.user?.id;

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonth = (() => {
    const d = new Date(`${monthStart}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const lastMonthEnd = (() => {
    const d = new Date(`${monthStart}T00:00:00Z`);
    d.setUTCDate(0);
    return d.toISOString().slice(0, 10);
  })();

  const [furnaces, setFurnaces] = useState<Furnace[]>([]);
  const [allHeats, setAllHeats] = useState<HeatLog[]>([]);
  const [allSheets, setAllSheets] = useState<FerroCostSheet[]>([]);
  const [presets, setPresets] = useState<CostComparisonPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [baselineIdx, setBaselineIdx] = useState(0);
  const [slots, setSlots] = useState<ComparisonSlot[]>([
    { furnaceId: ALL_FURNACES, dateFrom: lastMonth, dateTo: lastMonthEnd, label: "C1 (last month)" },
    { furnaceId: ALL_FURNACES, dateFrom: monthStart, dateTo: today, label: "C2 (this month)" },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeProfitCenter) return;
    (async () => {
      try {
        const [f, h, s, p] = await Promise.all([
          fetchFurnaces(activeProfitCenter.id),
          fetchHeatLogs(activeProfitCenter.id, {}),
          fetchFerroCostSheets(activeProfitCenter.id),
          fetchComparisonPresets(activeProfitCenter.id),
        ]);
        setFurnaces(f);
        setAllHeats(h.filter((x) => !x.isVoided));
        setAllSheets(s);
        setPresets(p);
      } catch (e) {
        toast({
          title: "Failed to load comparison data",
          description: e instanceof Error ? e.message : "",
          variant: "destructive",
        });
      }
    })();
  }, [activeProfitCenter?.id, toast]);

  const heatById = useMemo(() => {
    const m = new Map<string, HeatLog>();
    for (const h of allHeats) m.set(h.id, h);
    return m;
  }, [allHeats]);

  const slotKpis: ComparisonKpis[] = useMemo(() => {
    return slots.map((slot) => {
      const matching = allSheets.filter((s) => {
        if (s.sheetDate < slot.dateFrom || s.sheetDate > slot.dateTo) return false;
        if (slot.furnaceId !== ALL_FURNACES) {
          const heat = heatById.get(s.heatLogId);
          if (!heat || heat.furnaceId !== slot.furnaceId) return false;
        }
        return true;
      });
      return aggregateSlotKpis(matching);
    });
  }, [slots, allSheets, heatById]);

  const baseline = slotKpis[baselineIdx] ?? null;

  const updateSlot = (i: number, patch: Partial<ComparisonSlot>) => {
    setSlots((s) => s.map((slot, idx) => (idx === i ? { ...slot, ...patch } : slot)));
  };

  const addSlot = () => {
    if (slots.length >= 6) {
      toast({ title: "Max 6 slots", variant: "destructive" });
      return;
    }
    setSlots((s) => [
      ...s,
      {
        furnaceId: ALL_FURNACES,
        dateFrom: monthStart,
        dateTo: today,
        label: `C${s.length + 1}`,
      },
    ]);
  };

  const removeSlot = (i: number) => {
    if (slots.length <= 2) {
      toast({ title: "Need at least 2 slots", variant: "destructive" });
      return;
    }
    setSlots((s) => s.filter((_, idx) => idx !== i));
    if (baselineIdx >= slots.length - 1) setBaselineIdx(0);
  };

  const handleSavePreset = async () => {
    if (!activeProfitCenter || !userId) return;
    if (!presetName.trim()) {
      toast({ title: "Preset name required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createComparisonPreset({
        profitCenterId: activeProfitCenter.id,
        name: presetName.trim(),
        slots,
        baselineSlotIndex: baselineIdx,
        notes: null,
        createdBy: userId,
      });
      toast({ title: "Preset saved" });
      setPresetName("");
      setPresets(await fetchComparisonPresets(activeProfitCenter.id));
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

  const handleLoadPreset = (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    setSlots(p.slots);
    setBaselineIdx(p.baselineSlotIndex);
    toast({ title: `Loaded: ${p.name}` });
  };

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardHeader><CardTitle>Recovery & Costing</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">Select a workspace.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>Report Comparison Engine — {activeProfitCenter.name}</CardTitle>
          <CardDescription>
            Compare furnaces and date ranges side-by-side. Each slot aggregates
            saved cost sheets — production-weighted KPIs and signed deltas vs
            the baseline make trade-offs visible at a glance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {allSheets.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No saved cost sheets yet. Build and save sheets in the Cost Sheet tab —
              they will start appearing here automatically.
            </p>
          )}

          <div className="space-y-3">
            {slots.map((slot, i) => (
              <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-12">
                <div className="sm:col-span-2">
                  <Label>Label</Label>
                  <Input value={slot.label} onChange={(e) => updateSlot(i, { label: e.target.value })} />
                </div>
                <div className="sm:col-span-3">
                  <Label>Furnace</Label>
                  <Select value={slot.furnaceId} onValueChange={(v) => updateSlot(i, { furnaceId: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_FURNACES}>All furnaces</SelectItem>
                      {furnaces.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.code} — {f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label>From</Label>
                  <Input type="date" value={slot.dateFrom} onChange={(e) => updateSlot(i, { dateFrom: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Label>To</Label>
                  <Input type="date" value={slot.dateTo} onChange={(e) => updateSlot(i, { dateTo: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Baseline</Label>
                  <div className="flex h-10 items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={baselineIdx === i ? "default" : "outline"}
                      onClick={() => setBaselineIdx(i)}
                    >
                      {baselineIdx === i ? "Baseline" : "Set baseline"}
                    </Button>
                  </div>
                </div>
                <div className="flex items-end justify-end sm:col-span-1">
                  <Button variant="ghost" size="icon" onClick={() => removeSlot(i)} aria-label="Remove slot">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={addSlot}>
                <Plus className="mr-2 h-4 w-4" /> Add slot
              </Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Slot</TableHead>
                <TableHead className="text-right">Heats</TableHead>
                <TableHead className="text-right">Production (MT)</TableHead>
                <TableHead className="text-right">kWh / MT</TableHead>
                <TableHead className="text-right">Net cost</TableHead>
                <TableHead className="text-right">Net / MT</TableHead>
                <TableHead className="text-right">Recovery %</TableHead>
                <TableHead className="text-right">Δ Net/MT</TableHead>
                <TableHead className="text-right">Δ kWh/MT</TableHead>
                <TableHead className="text-right">Δ Recovery</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slots.map((slot, i) => {
                const k = slotKpis[i];
                const d = baseline ? deltaVsBaseline(k, baseline) : null;
                return (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{slot.label}</span>
                        {baselineIdx === i && <Badge variant="secondary">baseline</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{k.heatCount}</TableCell>
                    <TableCell className="text-right">{fmt(k.productionMt)}</TableCell>
                    <TableCell className="text-right">{fmt(k.kwhPerMt)}</TableCell>
                    <TableCell className="text-right">{fmt(k.totalNetCost)}</TableCell>
                    <TableCell className="text-right">{fmt(k.netCostPerMt)}</TableCell>
                    <TableCell className="text-right">{fmt(k.avgRecoveryPct)}</TableCell>
                    <TableCell className="text-right">{i === baselineIdx ? "—" : deltaCell(d?.netCostPerMt ?? null, true)}</TableCell>
                    <TableCell className="text-right">{i === baselineIdx ? "—" : deltaCell(d?.kwhPerMt ?? null, true)}</TableCell>
                    <TableCell className="text-right">{i === baselineIdx ? "—" : deltaCell(d?.recoveryPct ?? null, false)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <Label>Save current configuration as preset</Label>
              <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="e.g. F1 vs F2 — Q3" />
            </div>
            <Button onClick={handleSavePreset} disabled={saving}>
              <Save className="mr-2 h-4 w-4" /> Save preset
            </Button>
            {presets.length > 0 && (
              <div>
                <Label>Load preset</Label>
                <Select value="" onValueChange={handleLoadPreset}>
                  <SelectTrigger className="w-[260px]"><SelectValue placeholder="Pick a preset…" /></SelectTrigger>
                  <SelectContent>
                    {presets.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {p.slots.length} slots
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
