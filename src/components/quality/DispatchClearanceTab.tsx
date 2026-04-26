/**
 * Dispatch Clearance — Quality Phase C.
 *
 * Release gate before goods leave the works. Each clearance optionally
 * links to a finished-goods inspection; clearance to `cleared` requires
 * a passed (or conditionally-overridden) inspection. Hold and reject
 * transitions require a written reason for the audit trail.
 *
 * Lifecycle (single source of truth in src/lib/quality.ts):
 *   pending → cleared | held | rejected
 *   held    → cleared | rejected
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, CheckCircle2, ShieldAlert, Truck, XCircle, Clock } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  createDispatchClearance,
  fetchDispatchClearances,
  fetchFgInspections,
  nextDispatchStatuses,
  transitionDispatch,
  type DispatchClearance,
  type DispatchStatus,
  type FgInspection,
} from "@/lib/quality";

const STATUS_VARIANT: Record<DispatchStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  pending:  { label: "Pending",  className: "bg-muted text-muted-foreground",                            Icon: Clock },
  cleared:  { label: "Cleared",  className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", Icon: Truck },
  held:     { label: "Held",     className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",       Icon: ShieldAlert },
  rejected: { label: "Rejected", className: "bg-destructive/10 text-destructive",                       Icon: XCircle },
};

function StatusBadge({ status }: { status: DispatchStatus }) {
  const v = STATUS_VARIANT[status];
  const I = v.Icon;
  return <Badge className={`${v.className} gap-1 border-0`}><I className="h-3 w-3" />{v.label}</Badge>;
}

export function DispatchClearanceTab() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<DispatchClearance[]>([]);
  const [inspections, setInspections] = useState<FgInspection[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Create form
  const [clearanceNo, setClearanceNo] = useState("");
  const [customer, setCustomer] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [fgInspectionId, setFgInspectionId] = useState<string>("");
  const [notes, setNotes] = useState("");

  // Transition dialog
  const [txTarget, setTxTarget] = useState<DispatchClearance | null>(null);
  const [txNext, setTxNext] = useState<DispatchStatus | "">("");
  const [txReason, setTxReason] = useState("");

  const pcId = activeProfitCenter?.id;
  const userId = session?.user?.id;

  useEffect(() => {
    if (!pcId) return;
    setLoading(true);
    Promise.all([fetchDispatchClearances(pcId), fetchFgInspections(pcId)])
      .then(([d, fg]) => { setItems(d); setInspections(fg); })
      .catch((e: any) => toast({ title: "Failed to load dispatches", description: e?.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [pcId, toast]);

  const inspById = useMemo(() => new Map(inspections.map(i => [i.id, i])), [inspections]);

  async function reload() {
    if (!pcId) return;
    const [d, fg] = await Promise.all([fetchDispatchClearances(pcId), fetchFgInspections(pcId)]);
    setItems(d); setInspections(fg);
  }

  function resetCreate() {
    setClearanceNo(""); setCustomer(""); setVehicleNo(""); setFgInspectionId(""); setNotes("");
  }

  async function handleCreate() {
    if (!pcId || !userId) return;
    if (!clearanceNo.trim()) {
      toast({ title: "Clearance number required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createDispatchClearance({
        profitCenterId: pcId,
        createdBy: userId,
        clearanceNo: clearanceNo.trim(),
        customer: customer.trim() || null,
        vehicleNo: vehicleNo.trim() || null,
        fgInspectionId: fgInspectionId || null,
        notes: notes.trim() || null,
      });
      toast({ title: "Dispatch clearance created" });
      setCreateOpen(false);
      resetCreate();
      await reload();
    } catch (e: any) {
      toast({ title: "Create failed", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function openTransition(row: DispatchClearance) {
    setTxTarget(row);
    setTxNext("");
    setTxReason("");
  }

  async function handleTransition() {
    if (!txTarget || !txNext) return;
    const inspection = txTarget.fgInspectionId
      ? inspById.get(txTarget.fgInspectionId) ?? null
      : null;
    setSaving(true);
    try {
      await transitionDispatch({
        id: txTarget.id,
        current: txTarget.status,
        next: txNext,
        clearedBy: userId ?? null,
        inspection: inspection ? { id: inspection.id, result: inspection.result } : null,
        holdReason: txReason.trim() || null,
      });
      toast({ title: `Dispatch → ${txNext}` });
      setTxTarget(null);
      await reload();
    } catch (e: any) {
      toast({ title: "Transition refused", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!pcId) {
    return <p className="text-sm text-muted-foreground">Select a workspace to manage dispatch clearances.</p>;
  }

  const txOptions = txTarget ? nextDispatchStatuses(txTarget.status) : [];
  const reasonRequired = txNext === "held" || txNext === "rejected";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>Dispatch Clearance</CardTitle>
          <CardDescription>
            Release-gate before shipment. Clearance to <strong>cleared</strong> requires a passed FG inspection.
          </CardDescription>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New clearance
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Clearance #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>FG Inspection</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Hold reason</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!loading && items.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">No dispatch clearances yet.</TableCell></TableRow>
              )}
              {items.map(r => {
                const insp = r.fgInspectionId ? inspById.get(r.fgInspectionId) : null;
                const canAct = nextDispatchStatuses(r.status).length > 0;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="font-medium">{r.clearanceNo}</TableCell>
                    <TableCell>{r.customer ?? "—"}</TableCell>
                    <TableCell>{r.vehicleNo ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {insp
                        ? <span><span className="font-medium">{insp.inspectionNo}</span> · <span className="text-muted-foreground">{insp.result}</span></span>
                        : <span className="text-muted-foreground">— none —</span>}
                    </TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.holdReason ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {canAct
                        ? <Button size="sm" variant="outline" onClick={() => openTransition(r)}>Update</Button>
                        : <span className="text-xs text-muted-foreground">Locked</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) resetCreate(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>New Dispatch Clearance</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Clearance # *</Label>
                <Input value={clearanceNo} onChange={e => setClearanceNo(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Customer</Label>
                <Input value={customer} onChange={e => setCustomer(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Vehicle #</Label>
                <Input value={vehicleNo} onChange={e => setVehicleNo(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>FG Inspection</Label>
                <Select value={fgInspectionId} onValueChange={setFgInspectionId}>
                  <SelectTrigger><SelectValue placeholder="Link inspection (optional)" /></SelectTrigger>
                  <SelectContent>
                    {inspections.length === 0 && <SelectItem value="__none" disabled>No inspections available</SelectItem>}
                    {inspections.map(i => (
                      <SelectItem key={i.id} value={i.id}>{i.inspectionNo} · {i.result}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Saving…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transition dialog */}
      <Dialog open={!!txTarget} onOpenChange={(v) => { if (!v) setTxTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Update {txTarget?.clearanceNo}</DialogTitle></DialogHeader>
          {txTarget && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                Current status: <StatusBadge status={txTarget.status} />
              </div>
              <div className="space-y-1">
                <Label>New status</Label>
                <Select value={txNext} onValueChange={v => setTxNext(v as DispatchStatus)}>
                  <SelectTrigger><SelectValue placeholder="Pick next status" /></SelectTrigger>
                  <SelectContent>
                    {txOptions.map(s => (
                      <SelectItem key={s} value={s}>{STATUS_VARIANT[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(txNext === "held" || txNext === "rejected"
                || (txNext === "cleared" && txTarget.fgInspectionId
                    && inspById.get(txTarget.fgInspectionId)?.result === "conditional")) && (
                <div className="space-y-1">
                  <Label>{reasonRequired ? "Reason *" : "Override reason *"}</Label>
                  <Input value={txReason} onChange={e => setTxReason(e.target.value)} placeholder="≥ 3 characters" />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTxTarget(null)} disabled={saving}>Cancel</Button>
            <Button onClick={handleTransition} disabled={saving || !txNext}>{saving ? "Saving…" : "Apply"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
