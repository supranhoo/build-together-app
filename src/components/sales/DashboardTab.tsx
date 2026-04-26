/**
 * Sales Dashboard tab — KPIs + recent activity for the current Domestic/Export view.
 * Pure presentation; data comes from src/lib/sales.ts.
 */
import { useEffect, useMemo, useState } from "react";
import { Search, FileText, ShoppingCart, Truck, CheckCircle, DollarSign } from "lucide-react";
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

const fmtMt = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} MT`;
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard title="Open Inquiries" value={String(kpis.openInquiries)} sub={`${isExport ? "Export" : "Domestic"} — pending`} icon={Search} />
        <KpiCard title="Quoted" value={String(kpis.quotedInquiries)} sub="Awaiting customer" icon={FileText} />
        <KpiCard title="Active Orders" value={String(kpis.confirmedOrders)} sub="In pipeline" icon={ShoppingCart} />
        <KpiCard title="Total Booking" value={fmtMt(kpis.totalBookingMt)} sub="Across active SOs" icon={Truck} />
        <KpiCard title="Dispatched" value={fmtMt(kpis.dispatchedMt)} sub="Post dispatch" icon={CheckCircle} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" /> Order Value by Currency
            </CardTitle>
            <CardDescription>Across active orders in this view</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.keys(kpis.totalValueByCurrency).length === 0 ? (
              <p className="text-sm text-muted-foreground">No active orders yet.</p>
            ) : (
              Object.entries(kpis.totalValueByCurrency).map(([cur, val]) => (
                <div key={cur} className="flex items-center justify-between rounded-md border border-border bg-muted/40 p-3">
                  <span className="text-sm font-medium text-muted-foreground">{cur}</span>
                  <span className="text-base font-semibold text-foreground">
                    {val.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Market Mix (INR-normalised)</CardTitle>
            <CardDescription>All workspaces' active orders</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MixBar label="Domestic" pct={kpis.domesticPctByValueInr} />
            <MixBar label="Export" pct={kpis.exportPctByValueInr} />
            <p className="text-xs text-muted-foreground">
              Export rows without an FX rate are excluded from the mix.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent {isExport ? "Export" : "Domestic"} Orders</CardTitle>
            <CardDescription>Latest 5 orders for this view</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onJumpTab("orders")}>View all</Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SO #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty (MT)</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!loading && recent.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground">No orders yet.</TableCell></TableRow>
              )}
              {!loading && recent.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.soNumber}</TableCell>
                  <TableCell className="font-medium">{o.customerName ?? "—"}</TableCell>
                  <TableCell>{o.product}</TableCell>
                  <TableCell className="text-right">{o.qtyMt.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{o.currencyCode} {o.pricePerMt.toLocaleString()}</TableCell>
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

function KpiCard({ title, value, sub, icon: Icon }: {
  title: string; value: string; sub: string; icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
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
