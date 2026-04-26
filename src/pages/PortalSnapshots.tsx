/**
 * Portal Period Snapshots — Phase C.
 *
 * Read-only list of locked monthly closes. Clicking a row reveals the
 * full snapshot payload (summary + variance + power + by-products +
 * profitability + lockedRates audit hash).
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import { fetchSnapshots, type CostPeriodSnapshot } from "@/lib/finance";

export default function PortalSnapshots() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const [snapshots, setSnapshots] = useState<CostPeriodSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<CostPeriodSnapshot | null>(null);

  useEffect(() => {
    if (!activeProfitCenter) return;
    setLoading(true);
    (async () => {
      try { setSnapshots(await fetchSnapshots(activeProfitCenter.id)); }
      catch (e) { toast({ title: "Failed to load snapshots", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
      finally { setLoading(false); }
    })();
  }, [activeProfitCenter?.id, toast]);

  const summary = useMemo(() => active ? (active.payload as any)?.summary : null, [active]);

  if (!activeProfitCenter) return <Card><CardHeader><CardTitle>Period Snapshots</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace.</CardContent></Card>;

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>Period Snapshots — {activeProfitCenter.name}</CardTitle>
          <CardDescription>
            Locked monthly closes. Once locked, a period's numbers are immutable —
            back-dated rate changes do not alter historical snapshots.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Locked at</TableHead>
              <TableHead className="text-right">Production MT</TableHead>
              <TableHead className="text-right">Net cost ₹</TableHead>
              <TableHead className="text-right">Net ₹/MT</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6} className="text-muted-foreground">Loading…</TableCell></TableRow>}
              {!loading && snapshots.map((s) => {
                const sm = (s.payload as any)?.summary ?? {};
                return (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => setActive(s)}>
                    <TableCell className="font-medium">{s.periodStart} → {s.periodEnd}</TableCell>
                    <TableCell>{new Date(s.lockedAt).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{sm.productionMt?.toLocaleString?.() ?? "—"}</TableCell>
                    <TableCell className="text-right">{sm.netCost?.toLocaleString?.() ?? "—"}</TableCell>
                    <TableCell className="text-right">{sm.netCostPerMt?.toLocaleString?.() ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">Locked</Badge></TableCell>
                  </TableRow>
                );
              })}
              {!loading && snapshots.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground">No periods locked yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {active && (
            <>
              <SheetHeader>
                <SheetTitle>{active.periodStart} → {active.periodEnd}</SheetTitle>
                <SheetDescription>
                  Locked {new Date(active.lockedAt).toLocaleString()}{active.notes ? ` · ${active.notes}` : ""}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                {summary && (
                  <Card><CardContent className="p-4 text-sm space-y-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">Gross cost</span><span>{summary.grossCost?.toLocaleString?.() ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">By-product credit</span><span>−{summary.byproductCredit?.toLocaleString?.() ?? "—"}</span></div>
                    <div className="flex justify-between font-medium"><span>Net cost</span><span>{summary.netCost?.toLocaleString?.() ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Production MT</span><span>{summary.productionMt?.toLocaleString?.() ?? "—"}</span></div>
                    <div className="flex justify-between font-medium"><span>Net cost / MT</span><span>{summary.netCostPerMt?.toLocaleString?.() ?? "—"}</span></div>
                  </CardContent></Card>
                )}
                <details className="rounded border bg-muted/40 p-3 text-xs">
                  <summary className="cursor-pointer font-medium">Full payload (JSON)</summary>
                  <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words">{JSON.stringify(active.payload, null, 2)}</pre>
                </details>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
