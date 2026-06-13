/**
 * Heat Approval queue — Phase D.
 *
 * Operators submit completed heats for approval; managers/admins approve or
 * reject. Only approved heats can drive a Ferro Cost Sheet, so this page is
 * the gate between operations and finance.
 *
 * Design intent (per RCA + SSOT rules):
 *  - All approval state lives in `heat_log_approvals` (1:1 with heat_logs).
 *  - RLS handles authorization — UI just hides actions the user can't perform.
 *  - No business policy is hardcoded; "approval rights" follows
 *    `can_manage_profit_center`.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Clock, ThumbsDown, ThumbsUp } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { fetchFurnaces, fetchHeatLogs, type Furnace, type HeatLog } from "@/lib/production";
import {
  decideHeatApproval,
  fetchHeatApprovals,
  submitHeatForApproval,
  type HeatApprovalStatus,
  type HeatLogApproval,
} from "@/lib/finance";
import {
  fetchProductionApprovals,
  type ProductionApproval,
} from "@/lib/production-approvals";
import { transitionHeat, type CluHeatStatus } from "@/lib/clu-production";

const statusBadge: Record<HeatApprovalStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
};

export default function PortalHeatApprovals() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const userId = session?.user?.id;

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [statusFilter, setStatusFilter] = useState<HeatApprovalStatus | "all">("pending");
  const [furnaces, setFurnaces] = useState<Furnace[]>([]);
  const [heats, setHeats] = useState<HeatLog[]>([]);
  const [approvals, setApprovals] = useState<HeatLogApproval[]>([]);
  const [reasonByHeat, setReasonByHeat] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cluRows, setCluRows] = useState<ProductionApproval[]>([]);

  const reload = async () => {
    if (!activeProfitCenter) return;
    try {
      // Phase 1: push the date range down to the DB and request a high cap
      // so heats beyond row 200 in the workspace are never silently dropped
      // from the approval queue.
      const [f, h, a, clu] = await Promise.all([
        fetchFurnaces(activeProfitCenter.id),
        fetchHeatLogs(activeProfitCenter.id, { from, to, limit: 5000 }),
        fetchHeatApprovals(activeProfitCenter.id),
        fetchProductionApprovals(activeProfitCenter.id, { source: "clu_heat" }),
      ]);
      setFurnaces(f);
      setHeats(h.filter((x) => !x.isVoided));
      setApprovals(a);
      setCluRows(clu);
    } catch (e) {
      toast({
        title: "Failed to load approvals",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfitCenter?.id, from, to]);

  const approvalByHeat = useMemo(() => {
    const m = new Map<string, HeatLogApproval>();
    for (const a of approvals) m.set(a.heatLogId, a);
    return m;
  }, [approvals]);

  const furnaceCode = (id: string) => furnaces.find((f) => f.id === id)?.code ?? id.slice(0, 6);

  const visibleRows = useMemo(() => {
    return heats
      .map((h) => ({ heat: h, approval: approvalByHeat.get(h.id) ?? null }))
      .filter(({ approval }) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "pending") return !approval || approval.status === "pending";
        return approval?.status === statusFilter;
      })
      .sort((a, b) => (a.heat.tapTime > b.heat.tapTime ? -1 : 1));
  }, [heats, approvalByHeat, statusFilter]);

  const handleSubmit = async (heat: HeatLog) => {
    if (!activeProfitCenter || !userId) return;
    setBusyId(heat.id);
    try {
      await submitHeatForApproval({
        heatLogId: heat.id,
        profitCenterId: activeProfitCenter.id,
        submittedBy: userId,
        notes: reasonByHeat[heat.id]?.trim() || null,
      });
      toast({ title: "Submitted for approval", description: `Heat ${heat.heatNumber}` });
      setReasonByHeat((s) => ({ ...s, [heat.id]: "" }));
      await reload();
    } catch (e) {
      toast({
        title: "Submit failed",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDecide = async (
    approval: HeatLogApproval,
    status: "approved" | "rejected",
    heatLabel: string,
  ) => {
    if (!userId) return;
    const noteKey = approval.heatLogId;
    if (status === "rejected" && !(reasonByHeat[noteKey] ?? "").trim()) {
      toast({ title: "Rejection reason required", variant: "destructive" });
      return;
    }
    setBusyId(approval.id);
    try {
      await decideHeatApproval({
        approvalId: approval.id,
        status,
        decidedBy: userId,
        notes: reasonByHeat[noteKey]?.trim() || approval.notes,
      });
      toast({
        title: status === "approved" ? "Heat approved" : "Heat rejected",
        description: heatLabel,
      });
      setReasonByHeat((s) => ({ ...s, [noteKey]: "" }));
      await reload();
    } catch (e) {
      toast({
        title: "Decision failed",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleCluDecide = async (
    row: ProductionApproval,
    decision: "approve" | "reject",
  ) => {
    if (!userId) return;
    const reason = (reasonByHeat[row.id] ?? "").trim();
    if (decision === "reject" && reason.length < 3) {
      toast({ title: "Rejection reason required (min 3 chars)", variant: "destructive" });
      return;
    }
    setBusyId(row.id);
    try {
      await transitionHeat({
        heatId: row.entityId,
        currentStatus: "pending_approval" as CluHeatStatus,
        transition: decision,
        reason: reason || undefined,
        actorUserId: userId,
      });
      toast({
        title: decision === "approve" ? "CLU heat approved" : "CLU heat rejected",
        description: `Heat ${row.heatNumber}`,
      });
      setReasonByHeat((s) => ({ ...s, [row.id]: "" }));
      await reload();
    } catch (e) {
      toast({
        title: "Decision failed",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardHeader><CardTitle>Heat Approvals</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">Select a workspace.</CardContent>
      </Card>
    );
  }

  const counts = {
    pending: approvals.filter((a) => a.status === "pending").length,
    approved: approvals.filter((a) => a.status === "approved").length,
    rejected: approvals.filter((a) => a.status === "rejected").length,
  };

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card shadow-panel">
        <CardHeader className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Heat Approvals — {activeProfitCenter.name}</CardTitle>
            <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />{counts.pending} pending</Badge>
            <Badge variant="default"><CheckCircle2 className="mr-1 h-3 w-3" />{counts.approved} approved</Badge>
            <Badge variant="destructive">{counts.rejected} rejected</Badge>
          </div>
          <CardDescription>
            Submit completed heats for approval. Approved heats become available to the
            Ferro Costing Engine. Decisions are append-only and audit-tracked.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div>
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending / not submitted</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Heat #</TableHead>
                <TableHead>Tap time</TableHead>
                <TableHead>Furnace</TableHead>
                <TableHead className="text-right">Weight (MT)</TableHead>
                <TableHead className="text-right">Power (MWh)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[280px]">Notes / decision</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map(({ heat, approval }) => {
                const noteVal = reasonByHeat[heat.id] ?? "";
                const status = approval?.status ?? "pending";
                const isBusy = busyId === heat.id || busyId === approval?.id;
                return (
                  <TableRow key={heat.id}>
                    <TableCell className="font-medium">{heat.heatNumber}</TableCell>
                    <TableCell>{new Date(heat.tapTime).toLocaleString()}</TableCell>
                    <TableCell>{furnaceCode(heat.furnaceId)}</TableCell>
                    <TableCell className="text-right">{heat.weightMt ?? "—"}</TableCell>
                    <TableCell className="text-right">{heat.powerMwh ?? "—"}</TableCell>
                    <TableCell>
                      {approval ? (
                        <Badge variant={statusBadge[approval.status].variant}>
                          {statusBadge[approval.status].label}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Not submitted</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {status === "pending" ? (
                        <Textarea
                          placeholder="Optional note / required for reject"
                          value={noteVal}
                          rows={2}
                          onChange={(e) => setReasonByHeat((s) => ({ ...s, [heat.id]: e.target.value }))}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">{approval?.notes ?? "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!approval ? (
                        <Button size="sm" disabled={isBusy} onClick={() => handleSubmit(heat)}>
                          Submit
                        </Button>
                      ) : approval.status === "pending" ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" disabled={isBusy}
                            onClick={() => handleDecide(approval, "rejected", `Heat ${heat.heatNumber}`)}>
                            <ThumbsDown className="mr-1 h-4 w-4" /> Reject
                          </Button>
                          <Button size="sm" disabled={isBusy}
                            onClick={() => handleDecide(approval, "approved", `Heat ${heat.heatNumber}`)}>
                            <ThumbsUp className="mr-1 h-4 w-4" /> Approve
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {approval.decidedAt ? new Date(approval.decidedAt).toLocaleString() : "—"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {visibleRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    No heats match the current filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border bg-card shadow-panel">
        <CardHeader className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>CLU Heats</CardTitle>
            <Badge variant="outline">Polymorphic queue</Badge>
            <Badge variant="secondary">
              <Clock className="mr-1 h-3 w-3" />
              {cluRows.filter((r) => r.status === "pending").length} pending
            </Badge>
          </div>
          <CardDescription>
            CLU heats submitted from <code>/portal/production/clu</code>. Decisions here
            update <code>clu_heats.status</code> and append to its transition audit trail.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Heat #</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[280px]">Notes / decision</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cluRows.map((row) => {
                const isBusy = busyId === row.id;
                const noteVal = reasonByHeat[row.id] ?? "";
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.heatNumber}</TableCell>
                    <TableCell>
                      {row.submittedAt ? new Date(row.submittedAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadge[row.status].variant}>
                        {statusBadge[row.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.status === "pending" ? (
                        <Textarea
                          placeholder="Optional note / required for reject"
                          value={noteVal}
                          rows={2}
                          onChange={(e) =>
                            setReasonByHeat((s) => ({ ...s, [row.id]: e.target.value }))
                          }
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">{row.notes ?? "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.status === "pending" ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isBusy}
                            onClick={() => handleCluDecide(row, "reject")}
                          >
                            <ThumbsDown className="mr-1 h-4 w-4" /> Reject
                          </Button>
                          <Button
                            size="sm"
                            disabled={isBusy}
                            onClick={() => handleCluDecide(row, "approve")}
                          >
                            <ThumbsUp className="mr-1 h-4 w-4" /> Approve
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {row.decidedAt ? new Date(row.decidedAt).toLocaleString() : "—"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {cluRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No CLU heats submitted for approval yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
