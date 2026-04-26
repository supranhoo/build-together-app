/**
 * Plant Head Dashboard — unified cross-module monitoring view.
 *
 * Mounts on /portal between the user's pinned-KPI sections and the
 * configured-modules grid. Every value here is computed from the existing
 * module SSOTs via src/lib/plant-health.ts (pure derivers). RLS is enforced
 * by each underlying fetcher — this component performs no privileged work.
 *
 * Visual language deliberately uniform: 12 KPI cards share a card style,
 * with only an accent border-left hinting at the source module. Reads as
 * one dashboard, not seven stitched modules.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, AlertTriangle, Boxes, Calendar, CheckCircle2, ClipboardList,
  DollarSign, Factory, Gauge, MessageSquareWarning, Package, ShieldCheck,
  ShoppingCart, Sparkles, TrendingUp, Truck, Wrench, Zap,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { fetchHeatLogs } from "@/lib/production";
import { fetchMetallurgyByPC } from "@/lib/heat-metallurgy";
import { fetchFgInspections, fetchComplaints } from "@/lib/quality";
import { fetchLedger } from "@/lib/inventory";
import { fetchMasterItems } from "@/lib/master-data";
import { fetchPurchaseOrders, fetchSupplierEvaluations } from "@/lib/procurement";
import {
  fetchEquipment, fetchBreakdowns, fetchPMSchedules, fetchWorkOrders,
} from "@/lib/maintenance";
import { fetchFerroCostSheets } from "@/lib/finance";
import { fetchOrders } from "@/lib/sales";

import {
  aggregateCrossModuleKpis,
  aggregateTodayActivity,
  derivePlantHealth,
  mergeAlertFeed,
  type CrossModuleKpis,
  type PlantHealthSummary,
  type PlantAlert,
  type ActivityCounters,
  type DomainHealth,
  type HealthStatus,
} from "@/lib/plant-health";

interface Props {
  profitCenterId: string;
}

const fmt = (n: number, max = 1) =>
  n.toLocaleString(undefined, { maximumFractionDigits: max });

const fmtMoney = (n: number) =>
  `₹${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const fmtPct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);

export function PlantHeadDashboard({ profitCenterId }: Props) {
  const [kpis, setKpis] = useState<CrossModuleKpis | null>(null);
  const [health, setHealth] = useState<PlantHealthSummary | null>(null);
  const [alerts, setAlerts] = useState<PlantAlert[]>([]);
  const [activity, setActivity] = useState<ActivityCounters | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profitCenterId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      // Run each fetch with its own try/catch via Promise.allSettled so that
      // a single module failure (e.g. an empty table) never blanks the whole
      // dashboard. Fall back to [] on any per-source error.
      const safe = async <T,>(p: Promise<T[]>): Promise<T[]> =>
        p.catch(() => [] as T[]);

      try {
        const [
          heatLogs, metallurgy, fgInspections, complaints, ledger,
          masterItems, purchaseOrders, supplierEvaluations, equipment,
          breakdowns, pmSchedules, workOrders, ferroCostSheets, salesOrders,
        ] = await Promise.all([
          safe(fetchHeatLogs(profitCenterId)),
          safe(fetchMetallurgyByPC(profitCenterId)),
          safe(fetchFgInspections(profitCenterId)),
          safe(fetchComplaints(profitCenterId)),
          safe(fetchLedger(profitCenterId)),
          safe(fetchMasterItems(profitCenterId)),
          safe(fetchPurchaseOrders(profitCenterId)),
          safe(fetchSupplierEvaluations(profitCenterId)),
          safe(fetchEquipment(profitCenterId)),
          safe(fetchBreakdowns(profitCenterId)),
          safe(fetchPMSchedules(profitCenterId)),
          safe(fetchWorkOrders(profitCenterId)),
          safe(fetchFerroCostSheets(profitCenterId)),
          safe(fetchOrders(profitCenterId)),
        ]);
        if (cancelled) return;

        const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
        const voidedHeatsToday = heatLogs.filter(
          (h) => h.isVoided && new Date(h.tapTime).getTime() >= dayStart.getTime(),
        ).length;

        const totalConfiguredItems = masterItems.filter(
          (m) => m.minLevel !== null || m.reorderLevel !== null || m.maxLevel !== null,
        ).length;

        const aggregated = aggregateCrossModuleKpis({
          heatLogs, metallurgy, fgInspections, complaints, ledger, masterItems,
          purchaseOrders, supplierEvaluations, equipment, breakdowns,
          pmSchedules, workOrders, ferroCostSheets, salesOrders,
        });
        setKpis(aggregated);
        setHealth(derivePlantHealth(aggregated, voidedHeatsToday, totalConfiguredItems));
        setAlerts(mergeAlertFeed({
          breakdowns, pmSchedules, fgInspections, complaints, masterItems, ledger,
        }, 10));
        setActivity(aggregateTodayActivity({
          heatLogs, ledger, workOrders, fgInspections, salesOrders, purchaseOrders,
        }));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profitCenterId]);

  const cards = useMemo(() => buildKpiCards(kpis), [kpis]);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Plant Health Command Deck
        </h2>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
          Cross-module · live
        </Badge>
        {error && (
          <Badge variant="destructive" className="text-[10px]">{error}</Badge>
        )}
      </header>

      {/* Health strip */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <HealthPill label="Production"  domain={health?.production} icon={Factory} />
        <HealthPill label="Quality"     domain={health?.quality}    icon={ShieldCheck} />
        <HealthPill label="Inventory"   domain={health?.inventory}  icon={Boxes} />
        <HealthPill label="Maintenance" domain={health?.maintenance} icon={Wrench} />
      </div>

      {/* KPI mosaic */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((c) => (
          <KpiCard key={c.label} {...c} loading={loading && kpis === null} />
        ))}
      </div>

      {/* Insights row */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Live Alert Feed
            </CardTitle>
            <CardDescription>Cross-module signals, sorted by severity then recency</CardDescription>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {loading ? "Loading…" : "All clear — no active alerts."}
              </p>
            ) : (
              <ul className="space-y-2">
                {alerts.map((a) => (
                  <li key={a.id}>
                    <Link
                      to={a.routeHint}
                      className="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2 transition-colors hover:bg-muted/40"
                    >
                      <SeverityDot severity={a.severity} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                        {a.source}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-blue-600" />
              Today's Activity
            </CardTitle>
            <CardDescription>Operational throughput so far today</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <ActivityRow icon={Factory}      label="Heats tapped"       value={activity?.heatsTapped} />
              <ActivityRow icon={Package}      label="Inventory moves"    value={activity?.inventoryMovements} />
              <ActivityRow icon={Wrench}       label="Work orders opened" value={activity?.workOrdersOpened} />
              <ActivityRow icon={ShieldCheck}  label="FG inspections"     value={activity?.fgInspections} />
              <ActivityRow icon={ShoppingCart} label="Sales orders"       value={activity?.salesOrders} />
              <ActivityRow icon={Truck}        label="POs created"        value={activity?.posCreated} />
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<HealthStatus, { dot: string; label: string; bar: string }> = {
  healthy:  { dot: "bg-emerald-500", label: "text-emerald-700 dark:text-emerald-400", bar: "border-l-emerald-500" },
  watch:    { dot: "bg-amber-500",   label: "text-amber-700 dark:text-amber-400",     bar: "border-l-amber-500" },
  critical: { dot: "bg-red-500",     label: "text-red-700 dark:text-red-400",         bar: "border-l-red-500" },
  unknown:  { dot: "bg-muted-foreground", label: "text-muted-foreground",             bar: "border-l-muted" },
};

function HealthPill({
  label, domain, icon: Icon,
}: { label: string; domain?: DomainHealth; icon: React.ComponentType<{ className?: string }> }) {
  const status: HealthStatus = domain?.status ?? "unknown";
  const styles = STATUS_STYLES[status];
  return (
    <Card className={`border-l-4 ${styles.bar}`}>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-muted p-2 text-foreground"><Icon className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <span className={`inline-block h-2 w-2 rounded-full ${styles.dot}`} aria-hidden />
            <span className={`text-xs font-semibold capitalize ${styles.label}`}>{status}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {domain?.reason ?? "Loading…"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

interface KpiCardModel {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;     // border-l-* class
  iconBg: string;     // bg-* + text-*
  href?: string;
}

function KpiCard({
  label, value, sub, icon: Icon, accent, iconBg, href, loading,
}: KpiCardModel & { loading: boolean }) {
  const inner = (
    <Card className={`h-full border-l-4 ${accent} ${href ? "cursor-pointer transition-shadow hover:shadow-md" : ""}`}>
      <CardContent className="flex items-start justify-between p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {loading ? "—" : value}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{sub}</p>
        </div>
        <div className={`shrink-0 rounded-lg p-2 ${iconBg}`}><Icon className="h-5 w-5" /></div>
      </CardContent>
    </Card>
  );
  return href ? <Link to={href} aria-label={label}>{inner}</Link> : inner;
}

function SeverityDot({ severity }: { severity: PlantAlert["severity"] }) {
  const cls =
    severity === "critical" ? "bg-red-500" :
    severity === "warning"  ? "bg-amber-500" :
                              "bg-blue-500";
  return <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} aria-hidden />;
}

function ActivityRow({
  icon: Icon, label, value,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value?: number }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border bg-panel px-3 py-2">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      <span className="font-semibold tabular-nums">{value ?? "—"}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// KPI card builder — keeps the JSX above tidy
// ---------------------------------------------------------------------------

function buildKpiCards(k: CrossModuleKpis | null): KpiCardModel[] {
  return [
    {
      label: "Production today",
      value: k ? `${fmt(k.productionTodayMt, 1)} MT` : "—",
      sub: k ? `${k.heatsToday} heat${k.heatsToday === 1 ? "" : "s"} tapped` : "Loading",
      icon: Factory, accent: "border-l-blue-500", iconBg: "bg-blue-50 text-blue-600",
      href: "/portal/production",
    },
    {
      label: "kWh / MT",
      value: k?.kwhPerMt !== null && k?.kwhPerMt !== undefined ? fmt(k.kwhPerMt, 0) : "—",
      sub: "Energy efficiency today", icon: Zap,
      accent: "border-l-blue-500", iconBg: "bg-blue-50 text-blue-600",
      href: "/portal/production",
    },
    {
      label: "FG pass rate (MTD)",
      value: fmtPct(k?.fgPassPctMtd ?? null),
      sub: k ? `${k.fgInspectionsMtd} inspections this month` : "Loading",
      icon: CheckCircle2, accent: "border-l-emerald-500", iconBg: "bg-emerald-50 text-emerald-600",
      href: "/portal/quality",
    },
    {
      label: "Open complaints",
      value: k ? fmt(k.openComplaints, 0) : "—",
      sub: "Customer issues not yet closed",
      icon: MessageSquareWarning, accent: "border-l-emerald-500", iconBg: "bg-emerald-50 text-emerald-600",
      href: "/portal/quality",
    },
    {
      label: "Items below min",
      value: k ? fmt(k.itemsBelowMin, 0) : "—",
      sub: k ? `${k.itemsAtReorder} at reorder` : "Loading",
      icon: AlertTriangle, accent: "border-l-amber-500", iconBg: "bg-amber-50 text-amber-600",
      href: "/portal/inventory/min-max",
    },
    {
      label: "Stock value",
      value: k ? fmtMoney(k.totalStockValue) : "—",
      sub: "Sum of priced ledger entries",
      icon: Package, accent: "border-l-amber-500", iconBg: "bg-amber-50 text-amber-600",
      href: "/portal/inventory",
    },
    {
      label: "Open POs",
      value: k ? fmt(k.openPos, 0) : "—",
      sub: k ? `${k.pendingGrnLines} pending GRN` : "Loading",
      icon: ShoppingCart, accent: "border-l-violet-500", iconBg: "bg-violet-50 text-violet-600",
      href: "/portal/procurement",
    },
    {
      label: "Supplier on-time",
      value: fmtPct(k?.supplierOnTimePct ?? null),
      sub: "Latest evaluation per supplier",
      icon: Gauge, accent: "border-l-violet-500", iconBg: "bg-violet-50 text-violet-600",
      href: "/portal/procurement",
    },
    {
      label: "In breakdown",
      value: k ? fmt(k.equipmentInBreakdown, 0) : "—",
      sub: "Equipment currently down",
      icon: Wrench, accent: "border-l-red-500", iconBg: "bg-red-50 text-red-600",
      href: "/portal/maintenance",
    },
    {
      label: "PM due (7 days)",
      value: k ? fmt(k.pmDueNext7Days, 0) : "—",
      sub: k ? `${k.pmOverdue} overdue` : "Loading",
      icon: Calendar, accent: "border-l-red-500", iconBg: "bg-red-50 text-red-600",
      href: "/portal/maintenance",
    },
    {
      label: "MTD net cost / MT",
      value: k?.mtdNetCostPerMt !== null && k?.mtdNetCostPerMt !== undefined
        ? fmtMoney(k.mtdNetCostPerMt) : "—",
      sub: k ? `${k.costSheetsMtd} cost sheets` : "Loading",
      icon: DollarSign, accent: "border-l-indigo-500", iconBg: "bg-indigo-50 text-indigo-600",
      href: "/portal/finance",
    },
    {
      label: "Sales booked (MTD)",
      value: k ? `${fmt(k.salesBookedMtMtd, 1)} MT` : "—",
      sub: k ? `${k.salesOrdersMtd} orders this month` : "Loading",
      icon: TrendingUp, accent: "border-l-pink-500", iconBg: "bg-pink-50 text-pink-600",
      href: "/portal/sales",
    },
  ];
}
