import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  backtestForecast,
  bulkReverseInventoryLedger,
  bulkVoidHeatLogs,
  computeKpi,
  downloadCsv,
  exportDrilldownCsv,
  fetchKpiDrilldown,
  forecastSeasonal,
  reverseInventoryLedger,
  subscribeToKpi,
  unsubscribeFromKpi,
  userCanAct,
  voidHeatLog,
  type DateRange,
  type KpiDefinition,
  type KpiDrilldownResult,
  type KpiResult,
  type KpiSeriesPoint,
  type KpiSubscription,
  type SeasonalityMode,
} from "@/lib/reporting";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definition: KpiDefinition | null;
  profitCenterId: string;
  userId: string;
  range: DateRange;
  subscriptions: KpiSubscription[];
  onSubscriptionsChanged: () => Promise<void> | void;
  /** Optional per-workspace breakdown rendered above Rows (consolidated mode). */
  perWorkspace?: Array<{ profitCenterId: string; name: string; value: number | null; error?: string }>;
}

type PendingAction =
  | { kind: "void_heat_log"; id: string; label: string }
  | { kind: "reverse_inventory"; id: string; label: string }
  | { kind: "bulk_void_heat_log"; ids: string[] }
  | { kind: "bulk_reverse_inventory"; ids: string[] }
  | null;

const FORECAST_HORIZON_DAYS = 7;

export function KpiDetailDrawer({
  open,
  onOpenChange,
  definition,
  profitCenterId,
  userId,
  range,
  subscriptions,
  onSubscriptionsChanged,
  perWorkspace,
}: Props) {
  const { toast } = useToast();
  const [drill, setDrill] = useState<KpiDrilldownResult | null>(null);
  const [series, setSeries] = useState<KpiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canVoidHeat, setCanVoidHeat] = useState(false);
  const [canReverseInv, setCanReverseInv] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showForecast, setShowForecast] = useState(false);

  useEffect(() => {
    if (!open || !definition) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [drillResult, seriesResult] = await Promise.all([
          fetchKpiDrilldown(profitCenterId, definition.key, range),
          computeKpi(profitCenterId, definition.key, range).catch(() => null),
        ]);
        if (!cancelled) {
          setDrill(drillResult);
          setSeries(seriesResult);
          setSelectedIds(new Set());
        }
      } catch (err) {
        if (!cancelled) toast({ title: "Drill-down failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, definition, profitCenterId, range, toast]);

  // Probe void permissions (cheap RPC, only when drawer opens)
  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    (async () => {
      const [a, b] = await Promise.all([
        userCanAct(userId, "heat_log", "void"),
        userCanAct(userId, "inventory", "void"),
      ]);
      if (!cancelled) {
        setCanVoidHeat(a);
        setCanReverseInv(b);
      }
    })();
    return () => { cancelled = true; };
  }, [open, userId]);

  const headers = useMemo(() => (drill && drill.rows[0] ? Object.keys(drill.rows[0]) : []), [drill]);

  const bulkKind: "void" | "reverse" | null = useMemo(() => {
    if (drill?.source === "heat_logs" && canVoidHeat) return "void";
    if (drill?.source === "inventory_ledger" && canReverseInv) return "reverse";
    return null;
  }, [drill?.source, canVoidHeat, canReverseInv]);

  const selectableIds = useMemo(() => {
    if (!drill || !bulkKind) return [] as string[];
    return drill.rows
      .map((r) => String(r.id ?? ""))
      .filter((id) => id.length > 0);
  }, [drill, bulkKind]);

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const forecastPoints = useMemo<KpiSeriesPoint[]>(() => {
    if (!showForecast || !series?.series) return [];
    return forecastLinear(series.series, FORECAST_HORIZON_DAYS);
  }, [showForecast, series?.series]);

  const chartData = useMemo(() => {
    const actual = (series?.series ?? []).map((p) => ({ day: p.day, value: p.value, forecast: null as number | null }));
    const projected = forecastPoints.map((p) => ({ day: p.day, value: null as number | null, forecast: p.value }));
    return [...actual, ...projected];
  }, [series?.series, forecastPoints]);

  if (!definition) return null;

  const dailySub = subscriptions.find((s) => s.kpiDefinitionId === definition.id && s.cadence === "daily");
  const weeklySub = subscriptions.find((s) => s.kpiDefinitionId === definition.id && s.cadence === "weekly");

  const toggle = async (cadence: "daily" | "weekly", existing: KpiSubscription | undefined, on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        await subscribeToKpi({ userId, profitCenterId, kpiDefinitionId: definition.id, cadence });
        toast({ title: `Subscribed (${cadence})` });
      } else if (existing) {
        await unsubscribeFromKpi(existing.id);
        toast({ title: `Unsubscribed (${cadence})` });
      }
      await onSubscriptionsChanged();
    } catch (err) {
      toast({ title: "Subscription update failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleExport = () => {
    if (!drill) return;
    const csv = exportDrilldownCsv(drill.rows);
    if (!csv) {
      toast({ title: "Nothing to export" });
      return;
    }
    downloadCsv(`${definition.key}-drilldown.csv`, csv);
  };

  const rowAction = (row: Record<string, unknown>): PendingAction => {
    if (drill?.source === "heat_logs" && canVoidHeat) {
      const id = String(row.id ?? "");
      if (!id) return null;
      return { kind: "void_heat_log", id, label: String(row.heat_number ?? id) };
    }
    if (drill?.source === "inventory_ledger" && canReverseInv) {
      const id = String(row.id ?? "");
      if (!id) return null;
      return { kind: "reverse_inventory", id, label: String(row.movement_type ?? id) };
    }
    return null;
  };

  const hasRowActions = bulkKind !== null;

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(selectableIds) : new Set());
  };

  const openBulk = () => {
    if (!bulkKind || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setPending(bulkKind === "void" ? { kind: "bulk_void_heat_log", ids } : { kind: "bulk_reverse_inventory", ids });
  };

  const refreshDrill = async () => {
    if (!definition) return;
    try {
      const r = await fetchKpiDrilldown(profitCenterId, definition.key, range);
      setDrill(r);
      setSelectedIds(new Set());
    } catch {
      /* ignored */
    }
  };

  const confirmAction = async () => {
    if (!pending) return;
    if (reason.trim().length < 3) {
      toast({ title: "Reason required", description: "Enter at least 3 characters.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      if (pending.kind === "void_heat_log") {
        await voidHeatLog(pending.id, reason.trim());
        toast({ title: "Heat log voided" });
      } else if (pending.kind === "reverse_inventory") {
        await reverseInventoryLedger(pending.id, reason.trim());
        toast({ title: "Inventory entry reversed" });
      } else if (pending.kind === "bulk_void_heat_log") {
        const result = await bulkVoidHeatLogs(pending.ids, reason.trim());
        if (!result.ok) throw new Error(result.error ?? "bulk_void_failed");
        toast({ title: `Voided ${result.succeeded ?? pending.ids.length} heat log(s)` });
      } else if (pending.kind === "bulk_reverse_inventory") {
        const result = await bulkReverseInventoryLedger(pending.ids, reason.trim());
        if (!result.ok) throw new Error(result.error ?? "bulk_reverse_failed");
        toast({ title: `Reversed ${result.succeeded ?? pending.ids.length} entry(ies)` });
      }
      setPending(null);
      setReason("");
      await refreshDrill();
    } catch (err) {
      toast({ title: "Action failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const dialogTitle = pending?.kind === "void_heat_log"
    ? `Void heat log ${pending.label}?`
    : pending?.kind === "reverse_inventory"
      ? "Reverse entry?"
      : pending?.kind === "bulk_void_heat_log"
        ? `Void ${pending.ids.length} heat log(s)?`
        : pending?.kind === "bulk_reverse_inventory"
          ? `Reverse ${pending.ids.length} entry(ies)?`
          : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{definition.displayName}</SheetTitle>
          <SheetDescription>
            Source rows for the selected window {definition.unit ? `· unit: ${definition.unit}` : ""}
          </SheetDescription>
        </SheetHeader>

        {perWorkspace && perWorkspace.length > 0 && (
          <div className="mt-4 rounded-md border border-border bg-panel p-4">
            <p className="text-sm font-medium">Per-workspace breakdown</p>
            <div className="mt-2 max-h-48 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Workspace</TableHead>
                    <TableHead className="text-right text-xs">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perWorkspace.map((p) => (
                    <TableRow key={p.profitCenterId}>
                      <TableCell className="text-xs">{p.name}</TableCell>
                      <TableCell className="text-right text-xs">
                        {p.value == null ? "—" : Number(p.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        {definition.unit ? <span className="ml-1 text-muted-foreground">{definition.unit}</span> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <div className="mt-4 rounded-md border border-border bg-panel p-4">
          <p className="text-sm font-medium">Email digest</p>
          <p className="text-xs text-muted-foreground">Get this KPI delivered on a schedule.</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm">Daily (07:00 UTC)</span>
            <Switch checked={!!dailySub} disabled={busy} onCheckedChange={(v) => void toggle("daily", dailySub, v)} />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm">Weekly (Mon 07:00 UTC)</span>
            <Switch checked={!!weeklySub} disabled={busy} onCheckedChange={(v) => void toggle("weekly", weeklySub, v)} />
          </div>
        </div>

        <Tabs defaultValue="rows" className="mt-6">
          <TabsList>
            <TabsTrigger value="rows">Rows</TabsTrigger>
            <TabsTrigger value="trend">Trend</TabsTrigger>
            <TabsTrigger value="meta">Definition</TabsTrigger>
          </TabsList>

          <TabsContent value="rows" className="mt-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {loading ? "Loading…" : drill ? `${drill.rows.length} row(s) · source: ${drill.source ?? "—"}` : ""}
              </p>
              <Button size="sm" variant="outline" onClick={handleExport} disabled={!drill || drill.rows.length === 0}>
                <Download className="mr-2 h-4 w-4" /> Export CSV
              </Button>
            </div>

            {bulkKind && selectedIds.size > 0 && (
              <div className="mb-3 flex items-center justify-between rounded-md border border-primary/40 bg-primary/10 px-3 py-2">
                <span className="text-xs font-medium">{selectedIds.size} selected</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} aria-label="Clear selection">
                    Clear
                  </Button>
                  <Button size="sm" variant="destructive" onClick={openBulk}>
                    {bulkKind === "void" ? `Void ${selectedIds.size} selected` : `Reverse ${selectedIds.size} selected`}
                  </Button>
                </div>
              </div>
            )}

            <div className="max-h-96 overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {hasRowActions ? (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(v) => toggleAll(v === true)}
                          aria-label="Select all rows"
                          disabled={selectableIds.length === 0}
                        />
                      </TableHead>
                    ) : null}
                    {headers.map((h) => <TableHead key={h} className="whitespace-nowrap text-xs">{h}</TableHead>)}
                    {hasRowActions ? <TableHead className="w-10" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drill?.rows.map((r, i) => {
                    const action = rowAction(r);
                    const id = String(r.id ?? "");
                    const checked = id ? selectedIds.has(id) : false;
                    return (
                      <TableRow key={i}>
                        {hasRowActions ? (
                          <TableCell className="w-10">
                            {id ? (
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => toggleRow(id, v === true)}
                                aria-label={`Select row ${i + 1}`}
                              />
                            ) : null}
                          </TableCell>
                        ) : null}
                        {headers.map((h) => <TableCell key={h} className="whitespace-nowrap text-xs">{String(r[h] ?? "")}</TableCell>)}
                        {hasRowActions ? (
                          <TableCell className="w-10">
                            {action ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="icon" variant="ghost" aria-label="Row actions">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setPending(action); }}>
                                    {action.kind === "void_heat_log" ? "Void heat log" : "Reverse entry"}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                  {!loading && drill && drill.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={Math.max(headers.length, 1) + (hasRowActions ? 2 : 0)} className="text-center text-muted-foreground">
                        No rows in this window.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="trend" className="mt-3">
            <div className="mb-3 flex items-center justify-between rounded-md border border-border bg-panel px-3 py-2">
              <div>
                <p className="text-sm font-medium">Show forecast</p>
                <p className="text-[11px] text-muted-foreground">
                  Linear projection · {FORECAST_HORIZON_DAYS}-day horizon · advisory only
                </p>
              </div>
              <Switch
                checked={showForecast}
                onCheckedChange={setShowForecast}
                disabled={!series || (series.series ?? []).length < 2}
                aria-label="Toggle forecast projection"
              />
            </div>
            <div className="h-64 rounded-md border border-border bg-card p-2">
              {!series || (series.series ?? []).length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No data in this window.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                    <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} connectNulls={false} name="Actual" />
                    {showForecast && forecastPoints.length > 0 && (
                      <Line
                        type="monotone"
                        dataKey="forecast"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                        connectNulls
                        name="Forecast"
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </TabsContent>

          <TabsContent value="meta" className="mt-3">
            <pre className="max-h-80 overflow-auto rounded-md border border-border bg-panel p-3 text-xs">{JSON.stringify(definition.formula, null, 2)}</pre>
          </TabsContent>
        </Tabs>

        <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) { setPending(null); setReason(""); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                This action is auditable and cannot be undone. Bulk operations are atomic — all selected rows succeed or none are applied. Voided heat logs are excluded from KPIs but retained for audit.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea
              placeholder="Reason (required, min 3 characters)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={busy || reason.trim().length < 3} onClick={(e) => { e.preventDefault(); void confirmAction(); }}>
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
