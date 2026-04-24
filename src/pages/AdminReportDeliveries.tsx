import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import {
  fetchReportDeliveries,
  filterDeliveriesByStatus,
  type DeliveryStatus,
  type ReportDelivery,
} from "@/lib/reporting";

export default function AdminReportDeliveries() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const [rows, setRows] = useState<ReportDelivery[]>([]);
  const [status, setStatus] = useState<DeliveryStatus | "all">("all");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeProfitCenter) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchReportDeliveries({ profitCenterId: activeProfitCenter.id });
        if (!cancelled) setRows(data);
      } catch (err) {
        toast({ title: "Failed to load deliveries", description: err instanceof Error ? err.message : "", variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeProfitCenter, toast]);

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>Report deliveries</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }

  const filtered = filterDeliveriesByStatus(rows, status);
  const statusBadge = (s: DeliveryStatus) => {
    const variant = s === "sent" ? "default" : s === "failed" ? "destructive" : "secondary";
    return <Badge variant={variant as any}>{s}</Badge>;
  };

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Report deliveries — {activeProfitCenter.name}</CardTitle>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Delivered at</TableHead>
              <TableHead>KPI</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Cadence</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs">{new Date(r.deliveredAt).toLocaleString()}</TableCell>
                <TableCell className="font-mono text-xs">{(r.payload?.key as string) ?? r.kpiDefinitionId.slice(0, 8)}</TableCell>
                <TableCell className="font-mono text-xs">{r.userId.slice(0, 8)}…</TableCell>
                <TableCell>{r.cadence}</TableCell>
                <TableCell>{statusBadge(r.status)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.errorMessage ?? "—"}</TableCell>
              </TableRow>
            ))}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No deliveries recorded yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
