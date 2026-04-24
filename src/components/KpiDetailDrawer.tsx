import { useEffect, useMemo, useState } from "react";
import { Download, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  downloadCsv,
  exportDrilldownCsv,
  fetchKpiDrilldown,
  reverseInventoryLedger,
  subscribeToKpi,
  unsubscribeFromKpi,
  userCanAct,
  voidHeatLog,
  type DateRange,
  type KpiDefinition,
  type KpiDrilldownResult,
  type KpiSubscription,
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
}

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
  | null;

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
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canVoidHeat, setCanVoidHeat] = useState(false);
  const [canReverseInv, setCanReverseInv] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open || !definition) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await fetchKpiDrilldown(profitCenterId, definition.key, range);
        if (!cancelled) setDrill(result);
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

  const hasRowActions = (drill?.source === "heat_logs" && canVoidHeat) || (drill?.source === "inventory_ledger" && canReverseInv);

  const refreshDrill = async () => {
    if (!definition) return;
    try {
      const r = await fetchKpiDrilldown(profitCenterId, definition.key, range);
      setDrill(r);
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
            <div className="max-h-96 overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {headers.map((h) => <TableHead key={h} className="whitespace-nowrap text-xs">{h}</TableHead>)}
                    {(canVoidHeat && drill?.source === "heat_logs") ? <TableHead className="w-10" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drill?.rows.map((r, i) => {
                    const action = rowAction(r);
                    return (
                      <TableRow key={i}>
                        {headers.map((h) => <TableCell key={h} className="whitespace-nowrap text-xs">{String(r[h] ?? "")}</TableCell>)}
                        {(canVoidHeat && drill?.source === "heat_logs") ? (
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
                                    Void heat log
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
                    <TableRow><TableCell colSpan={Math.max(headers.length, 1)} className="text-center text-muted-foreground">No rows in this window.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <TabsContent value="meta" className="mt-3">
            <pre className="max-h-80 overflow-auto rounded-md border border-border bg-panel p-3 text-xs">{JSON.stringify(definition.formula, null, 2)}</pre>
          </TabsContent>
        </Tabs>

        <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) { setPending(null); setReason(""); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pending?.kind === "void_heat_log" ? `Void heat log ${pending?.label}?` : "Reverse entry?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                This action is auditable and cannot be undone. Voided heat logs are excluded from KPIs but retained for audit.
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
