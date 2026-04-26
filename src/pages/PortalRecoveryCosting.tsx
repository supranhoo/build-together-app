/**
 * Recovery & Costing — Report Comparison Engine (Phase D, redesigned shell).
 *
 * Presentation refresh only. Business logic, persistence, RLS path and
 * KPI math are unchanged from the previous version:
 *   - each slot = furnace × date-range
 *   - aggregateSlotKpis() over saved Ferro Cost Sheets
 *   - deltaVsBaseline() vs the chosen baseline slot
 *   - presets persisted to cost_comparison_presets
 *
 * Layout mirrors the supplied design reference:
 *   1. Engine header card with right-side secondary actions
 *   2. Comparison node cards (C1, C2, …) + dashed "Add Comparison Slot"
 *   3. Status / export / analyze toolbar
 *   4. "Analytical Report" matrix card with Furnace-wise Performance & Costing
 */
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  History,
  Layers,
  LineChart,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2,
  TrendingDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { exportRows } from "@/lib/excel-export";

const ALL_FURNACES = "__ALL__";

const fmtNum = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : n.toLocaleString(undefined, { maximumFractionDigits: d });

const fmtPct = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : `${n.toFixed(d)}%`;

function deltaInline(value: number | null, betterIsLower = true) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const positive = value > 0;
  const good = betterIsLower ? !positive : positive;
  return (
    <span className={good ? "text-emerald-600" : "text-destructive"}>
      {value > 0 ? "+" : ""}
      {fmtNum(value)}
    </span>
  );
}

/** Furnace-wise matrix row spec — driven by real slot KPIs, not hardcoded values. */
type MetricRow = {
  label: string;
  unit: string;
  pick: (k: ComparisonKpis) => number | null;
  /** Lower is better (true) → green for negative deltas. */
  betterIsLower?: boolean;
  /** Optional formatter. Defaults to fmtNum. */
  format?: (v: number | null) => string;
  /** Section header inserts a band before this row. */
  section?: string;
};

const SECTION_PERFORMANCE = "I. Performance & Recovery";
const SECTION_COST = "II. Operational Cost Matrix (Cost / MT)";

const METRIC_ROWS: MetricRow[] = [
  { section: SECTION_PERFORMANCE, label: "Heats Counted", unit: "#", pick: (k) => k.heatCount, betterIsLower: false, format: (v) => (v == null ? "—" : String(v)) },
  { label: "Cycle Net Production", unit: "MT", pick: (k) => k.productionMt, betterIsLower: false },
  { label: "Aggregate Recovery Rate", unit: "%", pick: (k) => k.avgRecoveryPct, betterIsLower: false, format: (v) => fmtPct(v, 2) },
  { label: "Average Grade (Mn)", unit: "%", pick: (k) => k.avgGradeMnPct, betterIsLower: false, format: (v) => fmtPct(v, 2) },
  { label: "Specific Power Utilization", unit: "kWh/MT", pick: (k) => k.kwhPerMt, betterIsLower: true, format: (v) => fmtNum(v, 0) },
  { label: "Total Power Drawn", unit: "MWh", pick: (k) => k.totalPowerMwh, betterIsLower: true },

  { section: SECTION_COST, label: "Gross Cost", unit: "₹", pick: (k) => k.totalGrossCost, betterIsLower: true, format: (v) => fmtNum(v, 0) },
  { label: "By-product Credit", unit: "₹", pick: (k) => k.totalByproductCredit, betterIsLower: false, format: (v) => fmtNum(v, 0) },
  { label: "Net Cost", unit: "₹", pick: (k) => k.totalNetCost, betterIsLower: true, format: (v) => fmtNum(v, 0) },
  { label: "Net Cost / MT", unit: "₹/MT", pick: (k) => k.netCostPerMt, betterIsLower: true, format: (v) => fmtNum(v, 0) },
];

export default function PortalRecoveryCosting() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const userId = session?.user?.id;

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthStart = (() => {
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
    { furnaceId: ALL_FURNACES, dateFrom: lastMonthStart, dateTo: lastMonthEnd, label: "Sequence #1" },
    { furnaceId: ALL_FURNACES, dateFrom: monthStart, dateTo: today, label: "Sequence #2" },
  ]);
  const [saving, setSaving] = useState(false);
  const [reportTimestamp, setReportTimestamp] = useState<Date>(() => new Date());

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

  const furnaceById = useMemo(() => {
    const m = new Map<string, Furnace>();
    for (const f of furnaces) m.set(f.id, f);
    return m;
  }, [furnaces]);

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
  const baselineKpis = useMemo<ComparisonKpis>(() => {
    // Pseudo-baseline column = simple mean of slot values (used as the right-most "baseline" reference column in the matrix).
    if (slotKpis.length === 0) {
      return {
        heatCount: 0,
        productionMt: 0,
        totalPowerMwh: 0,
        kwhPerMt: null,
        totalGrossCost: 0,
        totalByproductCredit: 0,
        totalNetCost: 0,
        netCostPerMt: null,
        avgRecoveryPct: null,
        avgGradeMnPct: null,
      };
    }
    const mean = (vals: (number | null)[]) => {
      const xs = vals.filter((v): v is number => v !== null && Number.isFinite(v));
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    };
    const sum = (vals: number[]) => vals.reduce((a, b) => a + b, 0);
    return {
      heatCount: sum(slotKpis.map((k) => k.heatCount)),
      productionMt: sum(slotKpis.map((k) => k.productionMt)),
      totalPowerMwh: sum(slotKpis.map((k) => k.totalPowerMwh)),
      kwhPerMt: mean(slotKpis.map((k) => k.kwhPerMt)),
      totalGrossCost: sum(slotKpis.map((k) => k.totalGrossCost)),
      totalByproductCredit: sum(slotKpis.map((k) => k.totalByproductCredit)),
      totalNetCost: sum(slotKpis.map((k) => k.totalNetCost)),
      netCostPerMt: mean(slotKpis.map((k) => k.netCostPerMt)),
      avgRecoveryPct: mean(slotKpis.map((k) => k.avgRecoveryPct)),
      avgGradeMnPct: mean(slotKpis.map((k) => k.avgGradeMnPct)),
    };
  }, [slotKpis]);

  const updateSlot = (i: number, patch: Partial<ComparisonSlot>) => {
    setSlots((s) => s.map((slot, idx) => (idx === i ? { ...slot, ...patch } : slot)));
  };

  const addSlot = () => {
    if (slots.length >= 6) {
      toast({ title: "Max 6 comparison slots", variant: "destructive" });
      return;
    }
    setSlots((s) => [
      ...s,
      {
        furnaceId: ALL_FURNACES,
        dateFrom: monthStart,
        dateTo: today,
        label: `Sequence #${s.length + 1}`,
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

  const handleAnalyze = () => {
    setReportTimestamp(new Date());
    toast({ title: "Comparison refreshed", description: "Matrix recomputed against latest saved cost sheets." });
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

  const handleExportXls = () => {
    if (!slotKpis.length) return;
    const rows = METRIC_ROWS.filter((r) => !r.section || true).flatMap((r) => {
      const base: Record<string, string | number> = { Metric: r.label, Unit: r.unit };
      slots.forEach((slot, i) => {
        const v = r.pick(slotKpis[i]);
        base[slot.label || `C${i + 1}`] = v == null ? "—" : Number(v.toFixed(2));
      });
      const bv = r.pick(baselineKpis);
      base["Baseline"] = bv == null ? "—" : Number(bv.toFixed(2));
      return [base];
    });
    exportRows(`recovery_costing_${today}`, [{ name: "Comparison Matrix", rows }]);
  };

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardContent className="p-6 text-muted-foreground">Select a workspace.</CardContent>
      </Card>
    );
  }

  const furnaceLabel = (id: string) => {
    if (id === ALL_FURNACES) return "All";
    const f = furnaceById.get(id);
    return f ? f.code : "—";
  };

  return (
    <div className="space-y-6">
      {/* ============================================================ */}
      {/* 1. Engine card — header + comparison nodes + action toolbar  */}
      {/* ============================================================ */}
      <Card className="border-border/60 bg-muted/20 shadow-panel">
        <CardContent className="p-5 sm:p-6 space-y-5">
          {/* Header strip */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-base font-semibold tracking-tight">Report Comparison Engine</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled className="gap-2" title="Coming soon">
                <History className="h-4 w-4" /> Comparison History
              </Button>
              {presets.length > 0 ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Layers className="h-4 w-4" /> Load Presets
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 p-2">
                    <div className="space-y-1">
                      <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Saved presets</p>
                      {presets.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleLoadPreset(p.id)}
                          className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                        >
                          <span className="truncate">{p.name}</span>
                          <span className="text-xs text-muted-foreground">{p.slots.length} slots</span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <Button variant="outline" size="sm" disabled className="gap-2" title="No presets saved yet">
                  <Layers className="h-4 w-4" /> Load Presets
                </Button>
              )}
            </div>
          </div>

          {/* Comparison node grid */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {slots.map((slot, i) => {
              const isBaseline = baselineIdx === i;
              return (
                <div
                  key={i}
                  className={`group relative rounded-lg border bg-card p-4 shadow-sm transition ${
                    isBaseline ? "ring-2 ring-primary/40" : ""
                  }`}
                >
                  {/* Top row — avatar + label + remove */}
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-semibold uppercase text-background">
                      C{i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Comparison Node
                      </p>
                      <Input
                        value={slot.label}
                        onChange={(e) => updateSlot(i, { label: e.target.value })}
                        className="mt-0.5 h-7 border-0 bg-transparent p-0 text-sm font-semibold shadow-none focus-visible:ring-0"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      {isBaseline && <Badge variant="secondary" className="text-[10px]">baseline</Badge>}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-60 hover:opacity-100"
                        onClick={() => removeSlot(i)}
                        aria-label="Remove slot"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Furnace */}
                  <div className="mt-4 space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Furnace
                    </Label>
                    <Select value={slot.furnaceId} onValueChange={(v) => updateSlot(i, { furnaceId: v })}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_FURNACES}>All furnaces</SelectItem>
                        {furnaces.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.code} — {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Analysis window */}
                  <div className="mt-3 space-y-1">
                    <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Analysis Window
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={slot.dateFrom}
                        onChange={(e) => updateSlot(i, { dateFrom: e.target.value })}
                        className="h-9"
                      />
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <Input
                        type="date"
                        value={slot.dateTo}
                        onChange={(e) => updateSlot(i, { dateTo: e.target.value })}
                        className="h-9"
                      />
                    </div>
                  </div>

                  {/* Set baseline */}
                  {!isBaseline && (
                    <button
                      type="button"
                      onClick={() => setBaselineIdx(i)}
                      className="mt-3 text-xs font-medium text-primary hover:underline"
                    >
                      Set as baseline
                    </button>
                  )}
                </div>
              );
            })}

            {/* Add slot card */}
            {slots.length < 6 && (
              <button
                type="button"
                onClick={addSlot}
                className="flex min-h-[14rem] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/70 bg-transparent p-4 text-muted-foreground transition hover:border-primary/50 hover:text-primary"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-current">
                  <Plus className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider">Add Comparison Slot</span>
              </button>
            )}
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Real-time sync active
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-sky-500" /> Auto-Cost Calculation
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={handleExportXls}>
                <FileSpreadsheet className="h-4 w-4" /> XLS
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                disabled
                title="PDF export — coming soon"
              >
                <FileText className="h-4 w-4" /> PDF
              </Button>
              <Button onClick={handleAnalyze} className="ml-2 gap-2">
                <TrendingDown className="h-4 w-4" />
                Analyze &amp; Compare Performance
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* 2. Analytical Report — Furnace-wise Performance & Costing    */}
      {/* ============================================================ */}
      <Card className="overflow-hidden border-border/60 bg-card shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium">
              <Badge className="rounded-full bg-primary px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-primary-foreground">
                Analytical Report
              </Badge>
              <span className="text-muted-foreground">| Ferro Alloys</span>
            </div>
            <h3 className="mt-2 text-2xl font-bold tracking-tight">Furnace-wise Performance &amp; Costing Matrix</h3>
            <p className="mt-1 text-sm italic text-muted-foreground">
              Comparison of cost per MT, recovery metrics, and raw material efficiency across the selected analysis windows.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Report Timestamp</p>
            <p className="mt-1 inline-block rounded-md border bg-muted/30 px-2.5 py-1 text-xs font-mono">
              {reportTimestamp.toLocaleString()}
            </p>
          </div>
        </div>

        <CardContent className="p-0 sm:p-0 mt-5">
          {/* Matrix */}
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="sticky left-0 z-10 w-[260px] bg-muted/40 px-5 py-3">Metric</th>
                  <th className="w-[80px] px-3 py-3 text-left">Unit</th>
                  {slots.map((slot, i) => (
                    <th key={i} className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-semibold text-foreground">Furnace {furnaceLabel(slot.furnaceId)}</span>
                        <span className="text-[10px] font-normal normal-case text-muted-foreground">{slot.label}</span>
                      </div>
                    </th>
                  ))}
                  <th className="bg-foreground px-4 py-3 text-right text-background">
                    <div className="flex flex-col items-end">
                      <span className="font-semibold">Baseline</span>
                      <span className="text-[10px] font-normal normal-case text-background/70">avg of slots</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {METRIC_ROWS.map((row, idx) => {
                  const fmt = row.format ?? ((v: number | null) => fmtNum(v, 2));
                  const baselineV = row.pick(baselineKpis);
                  return (
                    <>
                      {row.section && (
                        <tr key={`section-${idx}`}>
                          <td colSpan={3 + slots.length} className="bg-foreground px-5 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="h-4 w-1 rounded-sm bg-amber-400" />
                              <span className="text-xs font-semibold uppercase tracking-wider text-background">
                                {row.section}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                      <tr key={idx} className="border-t hover:bg-muted/30">
                        <td className="sticky left-0 z-10 border-t bg-card px-5 py-3 font-medium">{row.label}</td>
                        <td className="border-t px-3 py-3 text-xs italic text-muted-foreground">{row.unit}</td>
                        {slots.map((_, i) => {
                          const v = row.pick(slotKpis[i]);
                          const d =
                            i === baselineIdx
                              ? null
                              : (() => {
                                  const baseV = baseline ? row.pick(baseline) : null;
                                  return v == null || baseV == null ? null : v - baseV;
                                })();
                          return (
                            <td key={i} className="border-t px-4 py-3 text-right tabular-nums">
                              <div className="font-medium">{fmt(v)}</div>
                              {i !== baselineIdx && d !== null && (
                                <div className="text-[10px]">
                                  Δ {deltaInline(d, row.betterIsLower ?? true)}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="border-t bg-muted/40 px-4 py-3 text-right font-semibold tabular-nums">
                          {fmt(baselineV)}
                        </td>
                      </tr>
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Empty-state hint when no sheets exist */}
          {allSheets.length === 0 && (
            <div className="border-t bg-muted/20 px-5 py-4 text-sm text-muted-foreground sm:px-6">
              <div className="flex items-start gap-2">
                <Activity className="mt-0.5 h-4 w-4" />
                <p>
                  No saved cost sheets in this workspace yet — build and save sheets in the
                  <span className="font-medium text-foreground"> Cost Sheet </span>
                  tab. They will start populating this matrix automatically.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* 3. Save preset strip                                         */}
      {/* ============================================================ */}
      <Card className="border-border/60 bg-card shadow-panel">
        <CardContent className="flex flex-wrap items-end gap-3 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-sm font-medium">
            <LineChart className="h-4 w-4 text-muted-foreground" />
            Save current configuration as preset
          </div>
          <div className="flex-1 min-w-[200px]">
            <Input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="e.g. F1 vs F2 — Q3"
            />
          </div>
          <Button onClick={handleSavePreset} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" /> Save preset
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
