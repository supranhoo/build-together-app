/**
 * Finance & Costing — Dashboard tab (Phase D).
 *
 * Read-only KPI strip derived from existing Finance SSOTs (cost sheets +
 * heat-log approvals). All maths is inline and trivial — no new tables, no
 * new aggregation layer. Mirrors the visual language of every other module
 * dashboard via the shared `AccentKpiCard` (module="finance").
 *
 * Replaces the previous "Phase D — coming soon" empty state so the tab
 * shows real, useful numbers immediately.
 */
import { useEffect, useMemo, useState } from "react";
import { Calculator, CheckSquare, DollarSign, FileText, TrendingUp } from "lucide-react";
import { AccentKpiCard } from "@/components/ui/accent-kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchFerroCostSheets, type FerroCostSheet } from "@/lib/finance";

interface Props { profitCenterId: string }

const fmtMoney = (n: number) =>
  `₹${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const fmtNum = (n: number, d = 2) =>
  n.toLocaleString(undefined, { maximumFractionDigits: d });

/** Pure helper — exported for unit testing. */
export function computeFinanceDashboardKpis(sheets: FerroCostSheet[], now = new Date()) {
  const ym = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const thisMonth = ym(now);
  const mtd = sheets.filter((s) => (s.sheetDate ?? "").slice(0, 7) === thisMonth);

  const mtdProductionMt = mtd.reduce((acc, s) => acc + (Number.isFinite(s.productionMt) ? s.productionMt : 0), 0);
  const mtdNetCost = mtd.reduce((acc, s) => acc + (Number.isFinite(s.netCost) ? s.netCost : 0), 0);
  const mtdByproductCredit = mtd.reduce((acc, s) => acc + (Number.isFinite(s.byproductCredit) ? s.byproductCredit : 0), 0);
  const mtdNetCostPerMt = mtdProductionMt > 0 ? mtdNetCost / mtdProductionMt : null;

  return {
    sheetCount: sheets.length,
    sheetCountMtd: mtd.length,
    mtdProductionMt,
    mtdNetCost,
    mtdByproductCredit,
    mtdNetCostPerMt,
  };
}

export function FinanceDashboardTab({ profitCenterId }: Props) {
  const [sheets, setSheets] = useState<FerroCostSheet[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchFerroCostSheets(profitCenterId)
      .then((rows) => { if (!cancelled) setSheets(rows); })
      .catch(() => { if (!cancelled) setSheets([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profitCenterId]);

  const k = useMemo(() => computeFinanceDashboardKpis(sheets), [sheets]);
  const recent = sheets.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <AccentKpiCard
          module="finance" icon={Calculator}
          title="Cost sheets (MTD)" value={String(k.sheetCountMtd)}
          sub={`${k.sheetCount} total in workspace`}
        />
        <AccentKpiCard
          module="finance" icon={DollarSign}
          title="Net cost / MT (MTD)"
          value={k.mtdNetCostPerMt === null ? "—" : fmtMoney(k.mtdNetCostPerMt)}
          sub="Weighted by production MT"
        />
        <AccentKpiCard
          module="finance" icon={TrendingUp}
          title="Production costed (MTD)"
          value={fmtNum(k.mtdProductionMt, 2)} unit="MT"
          sub="Sum of approved sheet output"
        />
        <AccentKpiCard
          module="finance" icon={DollarSign}
          title="Net cost (MTD)" value={fmtMoney(k.mtdNetCost)}
          sub={`${fmtMoney(k.mtdByproductCredit)} by-product credit`}
        />
        <AccentKpiCard
          module="finance" icon={CheckSquare}
          title="Avg sheet value"
          value={k.sheetCountMtd > 0 ? fmtMoney(k.mtdNetCost / k.sheetCountMtd) : "—"}
          sub="MTD net cost ÷ sheets"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-indigo-500" /> Recent cost sheets
          </CardTitle>
          <CardDescription>Most recently created Ferro Cost Sheets in this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead className="text-right">Production (MT)</TableHead>
                <TableHead className="text-right">Net cost</TableHead>
                <TableHead className="text-right">₹ / MT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!loading && recent.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No cost sheets yet — open the Cost Sheet tab to build one.</TableCell></TableRow>
              )}
              {!loading && recent.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.sheetDate}</TableCell>
                  <TableCell>{s.grade}</TableCell>
                  <TableCell className="text-right">{fmtNum(s.productionMt, 2)}</TableCell>
                  <TableCell className="text-right">{fmtMoney(s.netCost)}</TableCell>
                  <TableCell className="text-right">{s.netCostPerMt === null ? "—" : fmtMoney(s.netCostPerMt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
