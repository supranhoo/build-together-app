/**
 * Customer Complaints — Quality Phase D.
 *
 * 8D-style lifecycle (single source of truth in src/lib/quality.ts):
 *   open → investigating → corrective_action → closed
 *
 * Closing is gated: requires a non-empty root cause AND corrective
 * action so the audit trail is meaningful. The DB enforces RLS via the
 * `quality.complaint` permission resource; this UI mirrors the rules to
 * avoid wasted round-trips.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardList, Plus, Search } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  createComplaint,
  fetchComplaints,
  nextComplaintStatuses,
  transitionComplaint,
  type ComplaintStatus,
  type QualityComplaint,
} from "@/lib/quality";

const STATUS_VARIANT: Record<ComplaintStatus, { label: string; className: string }> = {
  open:              { label: "Open",              className: "bg-destructive/10 text-destructive" },
  investigating:     { label: "Investigating",     className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  corrective_action: { label: "Corrective action", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  closed:            { label: "Closed",            className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
};

function StatusBadge({ status }: { status: ComplaintStatus }) {
  const v = STATUS_VARIANT[status];
  return <Badge className={`${v.className} border-0`}>{v.label}</Badge>;
}

export function ComplaintsTab() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<QualityComplaint[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // create form
  const [createOpen, setCreateOpen] = useState(false);
  const [complaintNo, setComplaintNo] = useState("");
  const [customer, setCustomer] = useState("");
  const [product, setProduct] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [description, setDescription] = useState("");

  // transition dialog
  const [txTarget, setTxTarget] = useState<QualityComplaint | null>(null);
  const [txNext, setTxNext] = useState<ComplaintStatus | "">("");
  const [txRootCause, setTxRootCause] = useState("");
  const [txAction, setTxAction] = useState("");

  const pcId = activeProfitCenter?.id;
  const userId = session?.user?.id;

  useEffect(() => {
    if (!pcId) return;
    setLoading(true);
    fetchComplaints(pcId)
      .then(setItems)
      .catch((e) => toast({ title: "Failed to load complaints", description: String(e?.message ?? e), variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [pcId, toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) =>
      [c.complaintNo, c.customer, c.product, c.batchNo, c.description]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [items, search]);

  function resetCreate() {
    setComplaintNo(""); setCustomer(""); setProduct(""); setBatchNo(""); setDescription("");
  }

  async function handleCreate() {
    if (!pcId || !userId) return;
    if (!complaintNo.trim() || description.trim().length < 3) {
      toast({ title: "Missing fields", description: "Complaint number and a description (≥3 chars) are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const row = await createComplaint({
        profitCenterId: pcId,
        createdBy: userId,
        complaintNo: complaintNo.trim(),
        customer: customer.trim() || null,
        product: product.trim() || null,
        batchNo: batchNo.trim() || null,
        description: description.trim(),
      });
      setItems((prev) => [row, ...prev]);
      setCreateOpen(false);
      resetCreate();
      toast({ title: "Complaint logged", description: row.complaintNo });
    } catch (e: any) {
      toast({ title: "Could not log complaint", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function openTransition(target: QualityComplaint) {
    setTxTarget(target);
    setTxNext("");
    setTxRootCause(target.rootCause ?? "");
    setTxAction(target.correctiveAction ?? "");
  }

  async function handleTransition() {
    if (!txTarget || !txNext) return;
    setSaving(true);
    try {
      const row = await transitionComplaint({
        id: txTarget.id,
        current: txTarget.status,
        next: txNext,
        closedBy: userId ?? null,
        rootCause: txRootCause.trim() || null,
        correctiveAction: txAction.trim() || null,
      });
      setItems((prev) => prev.map((c) => (c.id === row.id ? row : c)));
      setTxTarget(null);
      toast({ title: "Complaint updated", description: `${row.complaintNo} → ${row.status}` });
    } catch (e: any) {
      toast({ title: "Transition refused", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!pcId) {
    return (
      <Card>
        <CardHeader><CardTitle>Customer Complaints</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Select a workspace to view complaints.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" /> Customer Complaints (8D)
            </CardTitle>
            <CardDescription>
              Workflow: open → investigating → corrective action → closed. Closing requires a recorded root cause and corrective action.
            </CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Log complaint
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by complaint #, customer, product, batch…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Complaint #</TableHead>
                  <TableHead>Reported</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product / Batch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
                )}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      <ClipboardList className="mx-auto mb-2 h-6 w-6 opacity-50" />
                      No complaints recorded.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((c) => {
                  const next = nextComplaintStatuses(c.status);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.complaintNo}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(c.reportedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>{c.customer ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        <div>{c.product ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{c.batchNo ?? ""}</div>
                      </TableCell>
                      <TableCell><StatusBadge status={c.status} /></TableCell>
                      <TableCell className="text-right">
                        {next.length > 0 ? (
                          <Button size="sm" variant="outline" onClick={() => openTransition(c)} className="gap-1">
                            Advance <ArrowRight className="h-3 w-3" />
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Closed
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!saving) { setCreateOpen(o); if (!o) resetCreate(); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Log a customer complaint</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cn">Complaint number</Label>
              <Input id="cn" value={complaintNo} onChange={(e) => setComplaintNo(e.target.value)} placeholder="e.g. CMP-2026-0001" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="cust">Customer</Label>
                <Input id="cust" value={customer} onChange={(e) => setCustomer(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="prod">Product</Label>
                <Input id="prod" value={product} onChange={(e) => setProduct(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="batch">Batch / heat number (optional)</Label>
              <Input id="batch" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>Log complaint</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transition dialog */}
      <Dialog open={!!txTarget} onOpenChange={(o) => { if (!o && !saving) setTxTarget(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Advance {txTarget?.complaintNo}</DialogTitle>
          </DialogHeader>
          {txTarget && (
            <div className="grid gap-3">
              <div className="text-sm text-muted-foreground">
                Current: <StatusBadge status={txTarget.status} />
              </div>
              <div className="grid gap-1.5">
                <Label>Next status</Label>
                <Select value={txNext} onValueChange={(v) => setTxNext(v as ComplaintStatus)}>
                  <SelectTrigger><SelectValue placeholder="Select next status" /></SelectTrigger>
                  <SelectContent>
                    {nextComplaintStatuses(txTarget.status).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_VARIANT[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rc">Root cause {txNext === "closed" && <span className="text-destructive">*</span>}</Label>
                <Textarea id="rc" value={txRootCause} onChange={(e) => setTxRootCause(e.target.value)} rows={2} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ca">Corrective action {txNext === "closed" && <span className="text-destructive">*</span>}</Label>
                <Textarea id="ca" value={txAction} onChange={(e) => setTxAction(e.target.value)} rows={2} />
              </div>
              {txNext === "closed" && (
                <p className="text-xs text-muted-foreground">
                  Closing requires both fields (≥3 chars). The action is appended to the audit log.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTxTarget(null)} disabled={saving}>Cancel</Button>
            <Button onClick={handleTransition} disabled={saving || !txNext}>Advance</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
