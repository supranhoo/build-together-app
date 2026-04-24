import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { KpiDetailDrawer } from "@/components/KpiDetailDrawer";
import {
  buildDateRange,
  computeKpi,
  downloadCsv,
  exportKpiCsv,
  fetchKpiDefinitions,
  fetchMySubscriptions,
  unsubscribeFromKpi,
  type KpiDefinition,
  type KpiPreset,
  type KpiResult,
  type KpiSubscription,
} from "@/lib/reporting";

const presets: { value: KpiPreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

export default function PortalReports() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [definitions, setDefinitions] = useState<KpiDefinition[]>([]);
  const [results, setResults] = useState<Record<string, KpiResult>>({});
  const [preset, setPreset] = useState<KpiPreset>("7d");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drawerKey, setDrawerKey] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<KpiSubscription[]>([]);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => buildDateRange(preset), [preset]);

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
        const entries = await Promise.all(
          defs.map(async (d) => [d.key, await computeKpi(activeProfitCenter.id, d.key, range)] as const),
        );
        if (cancelled) return;
        setResults(Object.fromEntries(entries));
      } catch (err) {
        toast({ title: "Failed to load KPIs", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProfitCenter, range, toast, selectedKey]);

  const selected = selectedKey ? results[selectedKey] : null;
  const selectedDef = selectedKey ? definitions.find((d) => d.key === selectedKey) : null;

  const handleExport = () => {
    if (!selected || !selectedDef) return;
    const csv = exportKpiCsv(selectedDef.displayName, selectedDef.unit, selected.series);
    downloadCsv(`${selectedDef.key}-${preset}.csv`, csv);
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
        <Select value={preset} onValueChange={(v) => setPreset(v as KpiPreset)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {presets.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
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
            const r = results[def.key];
            const isSelected = selectedKey === def.key;
            return (
              <button key={def.id} type="button" onClick={() => setSelectedKey(def.key)} className="text-left">
                <Card className={isSelected ? "border-primary" : ""}>
                  <CardHeader className="pb-2">
                    <CardDescription>{def.displayName}</CardDescription>
                    <CardTitle className="text-3xl">
                      {r?.value == null ? "—" : Number(r.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      {def.unit ? <span className="ml-1 text-sm font-normal text-muted-foreground">{def.unit}</span> : null}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </button>
            );
          })}
        </div>
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
    </div>
  );
}
