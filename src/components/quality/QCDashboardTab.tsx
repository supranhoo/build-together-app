/**
 * Quality Dashboard — Phase D.
 *
 * Aggregates the six Quality data sources into one read-only summary.
 * All KPI math is delegated to the pure `buildQualityKpis` function in
 * src/lib/quality.ts (single source of truth — also unit-tested).
 *
 * This tab does NOT mutate any data. Numbers shown here MUST equal the
 * counts on the underlying tabs.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle, ClipboardCheck, FileCheck, LayoutDashboard, Package, Target, Truck,
} from "lucide-react";
import { AccentKpiCard } from "@/components/ui/accent-kpi-card";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import {
  buildQualityKpis,
  fetchBunkerTests,
  fetchComplaints,
  fetchComplianceRecords,
  fetchDispatchClearances,
  fetchFgInspections,
  fetchSamples,
  type QualityKpis,
} from "@/lib/quality";

const EMPTY: QualityKpis = {
  samples: { total: 0, byStatus: { planned: 0, collected: 0, tested: 0, released: 0, rejected: 0 }, openCount: 0 },
  bunkerTests: { total: 0, pass: 0, conditional: 0, fail: 0, failRatePct: 0 },
  fgInspections: { total: 0, pending: 0, pass: 0, conditional: 0, fail: 0 },
  dispatch: { total: 0, pending: 0, cleared: 0, held: 0, rejected: 0 },
  complaints: { total: 0, open: 0, investigating: 0, correctiveAction: 0, closed: 0, activeCount: 0 },
  compliance: { total: 0, expired: 0, dueSoon: 0, ok: 0, noExpiry: 0 },
};

type Tone = "default" | "danger" | "warn" | "ok";

function MiniStat({ label, value, tone = "default" }: { label: string; value: number | string; tone?: Tone }) {
  const cls =
    tone === "danger" ? "text-destructive"
    : tone === "warn" ? "text-amber-600"
    : tone === "ok"   ? "text-emerald-600"
    : "text-foreground";
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

export function QCDashboardTab() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [kpis, setKpis] = useState<QualityKpis>(EMPTY);

  const pcId = activeProfitCenter?.id;

  useEffect(() => {
    if (!pcId) { setKpis(EMPTY); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchSamples(pcId),
      fetchBunkerTests(pcId),
      fetchFgInspections(pcId),
      fetchDispatchClearances(pcId),
      fetchComplaints(pcId),
      fetchComplianceRecords(pcId),
    ])
      .then(([samples, bunkerTests, fgInspections, dispatch, complaints, compliance]) => {
        if (cancelled) return;
        setKpis(buildQualityKpis({ samples, bunkerTests, fgInspections, dispatch, complaints, compliance }));
      })
      .catch((e) => toast({ title: "Failed to load dashboard", description: String(e?.message ?? e), variant: "destructive" }))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pcId, toast]);

  // Note: per-area MiniStat panels below remain — they show finer-grained
  // status counts inside each Quality area (Sampling/Bunker/FG/Dispatch/etc).
  // The top headline is now rendered as `quality`-accented AccentKpiCards.

  if (!pcId) {
    return (
      <Card>
        <CardHeader><CardTitle>Quality Dashboard</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Select a workspace.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <LayoutDashboard className="h-5 w-5 text-emerald-500" /> Quality KPIs
          </h2>
          <p className="text-sm text-muted-foreground">
            Snapshot across Sampling, Bunker QC, Finished Goods, Dispatch, Complaints and Compliance.
            Numbers here mirror the underlying tabs.
          </p>
        </div>
        {loading && <Badge variant="outline">Loading…</Badge>}
      </div>

      {/* Headline KPIs — uniform `quality` accent (semantic colour map). */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <AccentKpiCard module="quality" icon={Target}         title="Open samples"        value={String(kpis.samples.openCount)}            sub="Awaiting result" />
        <AccentKpiCard module="quality" icon={ClipboardCheck} title="Bunker fail-rate"    value={kpis.bunkerTests.failRatePct.toFixed(1)} unit="%" sub={`${kpis.bunkerTests.fail} of ${kpis.bunkerTests.total} failed`} />
        <AccentKpiCard module="quality" icon={Package}        title="FG pending"          value={String(kpis.fgInspections.pending)}        sub={`${kpis.fgInspections.total} inspections`} />
        <AccentKpiCard module="quality" icon={Truck}          title="Dispatch held"       value={String(kpis.dispatch.held)}                sub={`${kpis.dispatch.cleared} cleared`} />
        <AccentKpiCard module="quality" icon={AlertCircle}    title="Active complaints"   value={String(kpis.complaints.activeCount)}       sub={`${kpis.complaints.closed} closed`} />
        <AccentKpiCard module="quality" icon={FileCheck}      title="Compliance expired"  value={String(kpis.compliance.expired)}           sub={`${kpis.compliance.dueSoon} due soon`} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Target className="h-4 w-4 text-primary" /> Sampling</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2">
            <MiniStat label="Planned" value={kpis.samples.byStatus.planned} />
            <MiniStat label="Collected" value={kpis.samples.byStatus.collected} />
            <MiniStat label="Tested" value={kpis.samples.byStatus.tested} />
            <MiniStat label="Released" value={kpis.samples.byStatus.released} tone="ok" />
            <MiniStat label="Rejected" value={kpis.samples.byStatus.rejected} tone="danger" />
            <MiniStat label="Total" value={kpis.samples.total} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4 text-primary" /> Bunker Feed QC</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2">
            <MiniStat label="Pass" value={kpis.bunkerTests.pass} tone="ok" />
            <MiniStat label="Conditional" value={kpis.bunkerTests.conditional} tone="warn" />
            <MiniStat label="Fail" value={kpis.bunkerTests.fail} tone="danger" />
            <MiniStat label="Total" value={kpis.bunkerTests.total} />
            <MiniStat label="Fail-rate %" value={kpis.bunkerTests.failRatePct} tone={kpis.bunkerTests.failRatePct > 0 ? "warn" : "ok"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4 text-primary" /> Finished Goods</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2">
            <MiniStat label="Pending" value={kpis.fgInspections.pending} tone="warn" />
            <MiniStat label="Pass" value={kpis.fgInspections.pass} tone="ok" />
            <MiniStat label="Conditional" value={kpis.fgInspections.conditional} tone="warn" />
            <MiniStat label="Fail" value={kpis.fgInspections.fail} tone="danger" />
            <MiniStat label="Total" value={kpis.fgInspections.total} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4 text-primary" /> Dispatch</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2">
            <MiniStat label="Pending" value={kpis.dispatch.pending} />
            <MiniStat label="Cleared" value={kpis.dispatch.cleared} tone="ok" />
            <MiniStat label="Held" value={kpis.dispatch.held} tone="warn" />
            <MiniStat label="Rejected" value={kpis.dispatch.rejected} tone="danger" />
            <MiniStat label="Total" value={kpis.dispatch.total} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><AlertCircle className="h-4 w-4 text-primary" /> Complaints</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2">
            <MiniStat label="Open" value={kpis.complaints.open} tone="danger" />
            <MiniStat label="Investigating" value={kpis.complaints.investigating} tone="warn" />
            <MiniStat label="CA in progress" value={kpis.complaints.correctiveAction} tone="warn" />
            <MiniStat label="Closed" value={kpis.complaints.closed} tone="ok" />
            <MiniStat label="Active" value={kpis.complaints.activeCount} />
            <MiniStat label="Total" value={kpis.complaints.total} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><FileCheck className="h-4 w-4 text-primary" /> Compliance</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2">
            <MiniStat label="Expired" value={kpis.compliance.expired} tone="danger" />
            <MiniStat label="Due soon" value={kpis.compliance.dueSoon} tone="warn" />
            <MiniStat label="OK" value={kpis.compliance.ok} tone="ok" />
            <MiniStat label="No expiry" value={kpis.compliance.noExpiry} />
            <MiniStat label="Total" value={kpis.compliance.total} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
