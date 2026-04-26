/**
 * Maintenance Dashboard — KPI cards + recent activity. Pure presentation.
 * Data comes from src/lib/maintenance.ts.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Settings, Activity, AlertTriangle, ClipboardList, Calendar,
  Clock, DollarSign, Package, TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccentKpiCard } from "@/components/ui/accent-kpi-card";
import {
  fetchEquipment, fetchWorkOrders, fetchPMSchedules, fetchBreakdowns,
  fetchDowntime, fetchCosts, fetchSpares, aggregateMaintenanceKpis,
  type Equipment, type WorkOrder, type PMSchedule, type Breakdown,
  type Downtime, type MaintenanceCost, type Spare,
} from "@/lib/maintenance";

const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
const fmtHours = (n: number | null) => n === null ? "—" : `${n.toFixed(1)} h`;

interface Props { profitCenterId: string; onJumpTab: (id: string) => void; }

export function MaintenanceDashboardTab({ profitCenterId, onJumpTab }: Props) {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [pmSchedules, setPmSchedules] = useState<PMSchedule[]>([]);
  const [breakdowns, setBreakdowns] = useState<Breakdown[]>([]);
  const [downtime, setDowntime] = useState<Downtime[]>([]);
  const [costs, setCosts] = useState<MaintenanceCost[]>([]);
  const [spares, setSpares] = useState<Spare[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [eq, wo, pm, bd, dt, ct, sp] = await Promise.all([
          fetchEquipment(profitCenterId), fetchWorkOrders(profitCenterId),
          fetchPMSchedules(profitCenterId), fetchBreakdowns(profitCenterId),
          fetchDowntime(profitCenterId), fetchCosts(profitCenterId),
          fetchSpares(profitCenterId),
        ]);
        if (cancelled) return;
        setEquipment(eq); setWorkOrders(wo); setPmSchedules(pm);
        setBreakdowns(bd); setDowntime(dt); setCosts(ct); setSpares(sp);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [profitCenterId]);

  const kpis = useMemo(() => aggregateMaintenanceKpis({
    equipment, workOrders, pmSchedules, breakdowns, downtime, costs, spares,
  }), [equipment, workOrders, pmSchedules, breakdowns, downtime, costs, spares]);

  const recentBreakdowns = breakdowns.slice(0, 5);
  const upcomingPM = [...pmSchedules]
    .filter((p) => p.isActive)
    .sort((a, b) => new Date(a.nextDue).getTime() - new Date(b.nextDue).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* KPI cards — every Maintenance KPI uses the shared `maintenance`
          accent so the colour rail matches the global module map. */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <AccentKpiCard
          module="maintenance" icon={Settings}
          title="Total Equipment" value={fmtNum(kpis.totalEquipment)}
          sub={`${kpis.operationalEquipment} operational`}
          onClick={() => onJumpTab("equipment")}
        />
        <AccentKpiCard
          module="maintenance" icon={AlertTriangle}
          title="In Breakdown" value={fmtNum(kpis.inBreakdown)}
          sub={`${breakdowns.length} total reports`}
          onClick={() => onJumpTab("breakdown")}
        />
        <AccentKpiCard
          module="maintenance" icon={ClipboardList}
          title="Open Work Orders" value={fmtNum(kpis.openWorkOrders)}
          sub={`${workOrders.length} total`}
          onClick={() => onJumpTab("workorders")}
        />
        <AccentKpiCard
          module="maintenance" icon={Calendar}
          title="PM Due (7 days)" value={fmtNum(kpis.pmDueThisWeek)}
          sub={`${kpis.pmOverdue} overdue`}
          onClick={() => onJumpTab("preventive")}
        />
        <AccentKpiCard
          module="maintenance" icon={Clock}
          title="Downtime (mins)" value={fmtNum(kpis.totalDowntimeMinutes)}
          sub={`${fmtNum(kpis.totalProductionLossMt)} MT loss`}
          onClick={() => onJumpTab("downtime")}
        />
        <AccentKpiCard
          module="maintenance" icon={TrendingUp}
          title="MTBF" value={fmtHours(kpis.mtbfHours)}
          sub={`MTTR ${fmtHours(kpis.mttrHours)}`}
        />
        <AccentKpiCard
          module="maintenance" icon={DollarSign}
          title="Cost (MTD)" value={`₹${fmtNum(kpis.totalCostMtd)}`}
          sub={`${costs.length} entries`}
          onClick={() => onJumpTab("costs")}
        />
        <AccentKpiCard
          module="maintenance" icon={Package}
          title="Spares Below Min" value={fmtNum(kpis.spareStockoutCount)}
          sub={`${spares.length} catalog items`}
          onClick={() => onJumpTab("spares")}
        />
      </div>

      {/* Recent activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-red-600" /> Recent Breakdowns
            </CardTitle>
            <CardDescription>Last 5 reported incidents</CardDescription>
          </CardHeader>
          <CardContent>
            {recentBreakdowns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No breakdowns reported.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>BD No.</TableHead><TableHead>Equipment</TableHead>
                    <TableHead>Severity</TableHead><TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentBreakdowns.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs">{b.breakdownNo}</TableCell>
                      <TableCell>{b.equipmentName ?? "—"}</TableCell>
                      <TableCell><Badge variant={b.severity === "critical" || b.severity === "major" ? "destructive" : "outline"}>{b.severity}</Badge></TableCell>
                      <TableCell>{b.resolvedAt ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Resolved</Badge> : <Badge variant="destructive">Open</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4 text-violet-600" /> Upcoming Preventive Maintenance
            </CardTitle>
            <CardDescription>Next 5 scheduled tasks</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingPM.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No active PM schedules.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead><TableHead>Equipment</TableHead>
                    <TableHead>Frequency</TableHead><TableHead>Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcomingPM.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.taskName}</TableCell>
                      <TableCell>{p.equipmentName ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline">{p.frequency}</Badge></TableCell>
                      <TableCell className={new Date(p.nextDue) < new Date() ? "text-red-600 font-medium" : ""}>
                        {new Date(p.nextDue).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {loading && <p className="text-xs text-muted-foreground text-center">Loading…</p>}
    </div>
  );
}

function KpiCard({ icon: Icon, accent, iconBg, label, value, sub, onClick }: {
  icon: any; accent: string; iconBg: string; label: string; value: string;
  sub?: string; onClick?: () => void;
}) {
  return (
    <Card
      className={`border-l-4 ${accent} ${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-4 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold mt-1 text-foreground">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg ${iconBg}`}><Icon className="h-5 w-5" /></div>
      </CardContent>
    </Card>
  );
}
