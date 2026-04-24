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

  const headers = drill && drill.rows[0] ? Object.keys(drill.rows[0]) : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{definition.displayName}</SheetTitle>
          <SheetDescription>
            Source rows for the selected window {definition.unit ? `· unit: ${definition.unit}` : ""}
          </SheetDescription>
        </SheetHeader>

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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drill?.rows.map((r, i) => (
                    <TableRow key={i}>
                      {headers.map((h) => <TableCell key={h} className="whitespace-nowrap text-xs">{String(r[h] ?? "")}</TableCell>)}
                    </TableRow>
                  ))}
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
      </SheetContent>
    </Sheet>
  );
}
