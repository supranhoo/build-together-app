import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { KpiDetailDrawer } from "@/components/KpiDetailDrawer";
import {
  buildDateRange,
  computeKpi,
  computeKpiConsolidated,
  downloadCsv,
  enforceMaxPins,
  exportKpiCsv,
  fetchKpiDefinitions,
  fetchKpiPins,
  fetchMySubscriptions,
  KPI_PIN_CAP,
  pinKpi,
  unpinKpi,
  unsubscribeFromKpi,
  type KpiConsolidatedResult,
  type KpiDefinition,
  type KpiPin,
  type KpiPreset,
  type KpiResult,
  type KpiSubscription,
} from "@/lib/reporting";

const presets: { value: KpiPreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

type ViewMode = "workspace" | "consolidated";

export default function PortalReports() {
  const { activeProfitCenter, assignments } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [definitions, setDefinitions] = useState<KpiDefinition[]>([]);
  const [results, setResults] = useState<Record<string, KpiResult>>({});
  const [consolidated, setConsolidated] = useState<Record<string, KpiConsolidatedResult>>({});
  const [view, setView] = useState<ViewMode>("workspace");
  const [preset, setPreset] = useState<KpiPreset>("7d");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drawerKey, setDrawerKey] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<KpiSubscription[]>([]);
  const [pins, setPins] = useState<KpiPin[]>([]);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => buildDateRange(preset), [preset]);
  const activeAssignmentCount = assignments.filter((a) => a.isActive).length;
  const canConsolidate = activeAssignmentCount >= 2;

  useEffect(() => {
    if (!activeProfitCenter) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const defs = await fetchKpiDefinitions(activeProfitCenter.id);
        if (cancelled) return;
        setDefinitions(defs);
        if (!selectedKey && defs[0]) setSelectedKey(defs[0].key);
        if (view === "workspace") {
          const entries = await Promise.all(
            defs.map(async (d) => [d.key, await computeKpi(activeProfitCenter.id, d.key, range)] as const),
          );
          if (cancelled) return;
          setResults(Object.fromEntries(entries));
        } else {
          const entries = await Promise.all(
            defs.map(async (d) => [d.key, await computeKpiConsolidated(d.key, range)] as const),
          );
          if (cancelled) return;
          setConsolidated(Object.fromEntries(entries));
        }
      } catch (err) {
        toast({ title: "Failed to load KPIs", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProfitCenter, range, toast, selectedKey, view]);

  const refreshSubs = async () => {
    if (!activeProfitCenter) return;
    try {
      const subs = await fetchMySubscriptions(activeProfitCenter.id);
      setSubscriptions(subs.filter((s) => s.userId === session?.user?.id));
    } catch {
      // non-fatal
    }
  };

  const refreshPins = async () => {
    if (!activeProfitCenter || !session?.user?.id) return;
    try {
      const list = await fetchKpiPins(session.user.id, activeProfitCenter.id);
      setPins(list);
    } catch {
      // non-fatal
    }
  };

  useEffect(() => { void refreshSubs(); void refreshPins(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id, session?.user?.id]);

  const selected = view === "workspace" && selectedKey ? results[selectedKey] : null;
  const selectedDef = selectedKey ? definitions.find((d) => d.key === selectedKey) : null;
  const drawerDef = drawerKey ? definitions.find((d) => d.key === drawerKey) ?? null : null;
  const drawerConsolidated = view === "consolidated" && drawerKey ? consolidated[drawerKey] : null;

  const handleExport = () => {
    if (!selected || !selectedDef) return;
    const csv = exportKpiCsv(selectedDef.displayName, selectedDef.unit, selected.series);
    downloadCsv(`${selectedDef.key}-${preset}.csv`, csv);
  };

  const handleQuickUnsubscribe = async (id: string) => {
    try {
      await unsubscribeFromKpi(id);
      await refreshSubs();
      toast({ title: "Unsubscribed" });
    } catch (err) {
      toast({ title: "Unsubscribe failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  };

  if (!activeProfitCenter) {
    return <p className="text-sm text-muted-foreground">Select a workspace to view reports.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Operational KPIs</h2>
          <p className="text-sm text-muted-foreground">Aggregations driven by workspace formulas. Configure under Admin → KPIs.</p>
        </div>
        <div className="flex items-center gap-3">
          {canConsolidate && (
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => { if (v === "workspace" || v === "consolidated") setView(v); }}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="workspace">Workspace</ToggleGroupItem>
              <ToggleGroupItem value="consolidated">Consolidated</ToggleGroupItem>
            </ToggleGroup>
          )}
          <Select value={preset} onValueChange={(v) => setPreset(v as KpiPreset)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {presets.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {definitions.length === 0 && !loading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No KPI definitions are active. Ask an admin to enable them.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {definitions.map((def) => {
            const ws = results[def.key];
            const cons = consolidated[def.key];
            const value = view === "workspace" ? ws?.value : cons?.value;
            const isSelected = selectedKey === def.key;
            const subCount = subscriptions.filter((s) => s.kpiDefinitionId === def.id).length;
            const wsCount = view === "consolidated" ? (cons?.perWorkspace.length ?? 0) : 0;
            return (
              <button
                key={def.id}
                type="button"
                onClick={() => { setSelectedKey(def.key); setDrawerKey(def.key); }}
                className="text-left"
              >
                <Card className={isSelected ? "border-primary" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardDescription>{def.displayName}</CardDescription>
                      {subCount > 0 ? <Badge variant="secondary" className="text-[10px]">subscribed</Badge> : null}
                    </div>
                    <CardTitle className="text-3xl">
                      {value == null ? "—" : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      {def.unit ? <span className="ml-1 text-sm font-normal text-muted-foreground">{def.unit}</span> : null}
                    </CardTitle>
                    {view === "consolidated" && wsCount > 0 ? (
                      <p className="text-xs text-muted-foreground">across {wsCount} workspace{wsCount === 1 ? "" : "s"}</p>
                    ) : null}
                  </CardHeader>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      {subscriptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">My subscriptions</CardTitle>
            <CardDescription>Scheduled KPI digests delivered by email.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {subscriptions.map((s) => {
              const def = definitions.find((d) => d.id === s.kpiDefinitionId);
              return (
                <div key={s.id} className="flex items-center justify-between rounded-md border border-border bg-panel px-3 py-2 text-sm">
                  <span>{def?.displayName ?? s.kpiDefinitionId.slice(0, 8)} · <span className="text-muted-foreground">{s.cadence}</span></span>
                  <Button size="sm" variant="ghost" onClick={() => void handleQuickUnsubscribe(s.id)}>Unsubscribe</Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {selectedDef && selected ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>{selectedDef.displayName}</CardTitle>
              <CardDescription>Daily trend over the selected window</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!selected.series.length}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              {selected.series.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data in this window.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selected.series}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }} />
                    <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <KpiDetailDrawer
        open={!!drawerKey}
        onOpenChange={(o) => { if (!o) setDrawerKey(null); }}
        definition={drawerDef}
        profitCenterId={activeProfitCenter.id}
        userId={session?.user?.id ?? ""}
        range={range}
        subscriptions={subscriptions}
        onSubscriptionsChanged={refreshSubs}
        perWorkspace={drawerConsolidated?.perWorkspace}
      />
    </div>
  );
}
