/**
 * Sales Dashboard tab — KPIs + recent activity for the current Domestic/Export view.
 * Pure presentation; data comes from src/lib/sales.ts.
 *
 * Visual spec: matches uploaded screenshot — 5 colored-border KPI cards,
 * 3-panel info row (FX/LC, Market Presence, Shipping Pipeline), recent activity table.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Search, FileText, ShoppingCart, Truck, CheckCircle2, DollarSign,
  TrendingUp, Anchor, Package,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  aggregateSalesKpis,
  fetchInquiries,
  fetchOrders,
  type SalesInquiry,
  type SalesOrder,
} from "@/lib/sales";

const fmtMt = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

interface Props {
  profitCenterId: string;
  isExport: boolean;
  onJumpTab: (tabId: string) => void;
}

export function DashboardTab({ profitCenterId, isExport, onJumpTab }: Props) {
  const [inquiries, setInquiries] = useState<SalesInquiry[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [inq, ord] = await Promise.all([
          fetchInquiries(profitCenterId, { isExport }),
          fetchOrders(profitCenterId, { isExport }),
        ]);
        if (!cancelled) {
          setInquiries(inq);
          setOrders(ord);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profitCenterId, isExport]);

  const kpis = useMemo(() => aggregateSalesKpis(inquiries, orders), [inquiries, orders]);
  const recent = orders.slice(0, 5);
  const viewLabel = isExport ? "Export" : "Domestic";
  const totalInquiries = kpis.openInquiries + kpis.quotedInquiries;

  return (
    <div className="space-y-6">
      {/* Row 1: 5 colored-border KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <AccentKpi
          accent="border-l-blue-500"
          iconColor="text-blue-500"
          icon={Search}
          title="Total Inquiries"
          value={String(totalInquiries)}
          sub={`Active ${viewLabel} requests`}
        />
        <AccentKpi
          accent="border-l-indigo-500"
          iconColor="text-indigo-500"
          icon={FileText}
          title="Active Offers"
          value={String(kpis.quotedInquiries)}
          sub={`Pending ${viewLabel} approval`}
        />
        <AccentKpi
          accent="border-l-emerald-500"
          iconColor="text-emerald-500"
          icon={ShoppingCart}
          title="Confirmed Orders"
          value={String(kpis.confirmedOrders)}
          sub={`In ${viewLabel} production`}
        />
        <AccentKpi
          accent="border-l-amber-500"
          iconColor="text-amber-500"
          icon={Truck}
          title="Available Stock"
          value="0"
          unit="MT"
          sub="Ready for release"
        />
        <AccentKpi
          accent="border-l-purple-500"
          iconColor="text-purple-500"
          icon={CheckCircle2}
          title="Dispatched Qty"
          value={fmtMt(kpis.dispatchedMt)}
          unit="MT"
          sub="Historical performance"
        />
      </div>

      {/* Row 2: 3 info panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* FX Exposure & LC Limits */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              {isExport ? "FX Exposure & LC Limits" : "Domestic Receivables"}
            </CardTitle>
            <CardDescription>
              {isExport ? "International finance overview" : "Receivables overview"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow
              icon={Anchor}
              iconBg="bg-blue-100"
              iconColor="text-blue-600"
              label={isExport ? "LC Value Pending" : "Outstanding AR"}
              value={isExport ? "$ 0" : "₹ 0"}
            />
            <InfoRow
              icon={TrendingUp}
              iconBg="bg-amber-100"
              iconColor="text-amber-600"
              label={isExport ? "FX Realisation Rate (Avg)" : "Avg DSO (Days)"}
              value={isExport ? "₹ 0 / USD" : "0 days"}
            />
            <p className="text-xs text-muted-foreground pt-1">Live in Phase D — Banking & LC.</p>
          </CardContent>
        </Card>

        {/* Market Presence */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Market Presence</CardTitle>
            <CardDescription>Domestic vs Export distribution</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MixBar label="Domestic Sales" pct={kpis.domesticPctByValueInr} />
            <MixBar label="Export Sales" pct={kpis.exportPctByValueInr} />
            {isExport && (
              <div className="pt-2">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground mb-2">
                  TOP EXPORT MARKETS
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Europe (45%)</Badge>
                  <Badge variant="secondary">Japan (30%)</Badge>
                  <Badge variant="secondary">SE Asia (25%)</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Shipping Pipeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Shipping Pipeline</CardTitle>
            <CardDescription>Vessel & Container tracking</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <PipelineRow label="Container Booking" value="0 Units" />
            <PipelineRow label="Stuffing Underway" value="0 Units" />
            <PipelineRow label="Sailed / In Transit" value="0 Units" valueClass="text-blue-600" />
            <p className="text-xs text-muted-foreground pt-1">Live in Phase B — Logistics & Shipping.</p>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Recent activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent {viewLabel} Activity</CardTitle>
            <CardDescription>Latest confirmed sales orders</CardDescription>
          </div>
          <Button variant="link" size="sm" className="text-blue-600" onClick={() => onJumpTab("orders")}>
            View All
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OrderRef</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Port / Dest</TableHead>
                <TableHead className="text-right">Price (FX)</TableHead>
                <TableHead className="text-right">Qty (MT)</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              )}
              {!loading && recent.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No recent activity</TableCell></TableRow>
              )}
              {!loading && recent.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.soNumber}</TableCell>
                  <TableCell className="font-medium">{o.customerName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{o.portOfDischarge ?? o.portOfLoading ?? "—"}</TableCell>
                  <TableCell className="text-right">{o.currencyCode} {o.pricePerMt.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{o.qtyMt.toLocaleString()}</TableCell>
                  <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AccentKpi({
  accent, iconColor, icon: Icon, title, value, sub, unit,
}: {
  accent: string;
  iconColor: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  sub: string;
  unit?: string;
}) {
  return (
    <Card className={`border-l-4 ${accent}`}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-foreground">{value}</span>
          {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

function InfoRow({
  icon: Icon, iconBg, iconColor, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-3">
      <div className={`flex h-9 w-9 items-center justify-center rounded-md ${iconBg}`}>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-base font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function PipelineRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-3">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <span className={`text-sm font-semibold ${valueClass ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}

function MixBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">{fmtPct(pct)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  );
}
