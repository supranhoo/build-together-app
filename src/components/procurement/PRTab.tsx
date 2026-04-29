/**
 * Purchase Requisitions tab — Phase B.
 *
 * Single-step approval: draft → submitted → approved → converted.
 * Rejection (with reason) is a terminal branch. Conversion to PO happens
 * from the PO tab against an approved PR; here we expose the workflow
 * actions but stop at "approved".
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MaterialPicker } from "@/components/MaterialPicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { fetchMaterials, type Material } from "@/lib/inventory";
import {
  createPurchaseRequisition,
  fetchCurrencies,
  fetchPrLines,
  fetchPurchaseRequisitions,
  transitionPurchaseRequisition,
  type Currency,
  type PrLine,
  type PrLineInput,
  type PrStatus,
  type PurchaseRequisition,
} from "@/lib/procurement";

interface DraftLine extends PrLineInput { tempId: string; }

const STATUS_VARIANT: Record<PrStatus, { label: string; className: string }> = {
  draft:      { label: "Draft",     className: "bg-muted text-muted-foreground" },
  submitted:  { label: "Submitted", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  approved:   { label: "Approved",  className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  rejected:   { label: "Rejected",  className: "bg-destructive/10 text-destructive" },
  converted:  { label: "Converted", className: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  closed:     { label: "Closed",    className: "bg-muted text-muted-foreground" },
};

function StatusBadge({ status }: { status: PrStatus }) {
  const v = STATUS_VARIANT[status];
  return <Badge className={`${v.className} border-0`}>{v.label}</Badge>;
}

function newDraftLine(): DraftLine {
  return {
    tempId: crypto.randomUUID(),
    materialId: "",
    quantity: 0,
    uom: "kg",
    estUnitCost: null,
    currencyCode: "INR",
    notes: null,
  };
}

export function PRTab() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();

  const [prs, setPrs] = useState<PurchaseRequisition[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [prNumber, setPrNumber] = useState("");
  const [priority, setPriority] = useState<string>("normal");
  const [requestedFor, setRequestedFor] = useState<string>("");
  const [headerNotes, setHeaderNotes] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([newDraftLine()]);
  const [saving, setSaving] = useState(false);

  const [detailFor, setDetailFor] = useState<PurchaseRequisition | null>(null);
  const [detailLines, setDetailLines] = useState<PrLine[]>([]);
  const [rejectReason, setRejectReason] = useState("");

  const materialMap = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);

  const load = async () => {
    if (!activeProfitCenter) return;
    setLoading(true);
    try {
      const [list, mats, cur] = await Promise.all([
        fetchPurchaseRequisitions(activeProfitCenter.id),
        fetchMaterials(activeProfitCenter.id),
        fetchCurrencies(),
      ]);
      setPrs(list);
      setMaterials(mats.filter((m) => m.isActive));
      setCurrencies(cur);
    } catch (e) {
      toast({ title: "Failed to load PRs", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfitCenter?.id]);

  const openCreate = () => {
    setPrNumber("");
    setPriority("normal");
    setRequestedFor("");
    setHeaderNotes("");
    setDraftLines([newDraftLine()]);
    setCreateOpen(true);
  };

  const updateLine = (tempId: string, patch: Partial<DraftLine>) => {
    setDraftLines((prev) => prev.map((l) => (l.tempId === tempId ? { ...l, ...patch } : l)));
  };

  const removeLine = (tempId: string) => {
    setDraftLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.tempId !== tempId)));
  };

  const handleCreate = async () => {
    if (!activeProfitCenter || !session?.user) return;
    setSaving(true);
    try {
      await createPurchaseRequisition({
        profitCenterId: activeProfitCenter.id,
        prNumber,
        priority,
        requestedForDate: requestedFor || null,
        notes: headerNotes.trim() || null,
        requestedBy: session.user.id,
        lines: draftLines.map((l) => ({
          materialId: l.materialId,
          quantity: Number(l.quantity),
          uom: l.uom,
          estUnitCost: l.estUnitCost != null ? Number(l.estUnitCost) : null,
          currencyCode: l.currencyCode,
          notes: l.notes,
        })),
      });
      toast({ title: "PR created", description: prNumber });
      setCreateOpen(false);
      await load();
    } catch (e) {
      toast({ title: "Could not create PR", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (pr: PurchaseRequisition) => {
    setDetailFor(pr);
    setRejectReason("");
    try {
      setDetailLines(await fetchPrLines(pr.id));
    } catch (e) {
      toast({ title: "Failed to load lines", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const transition = async (toStatus: PrStatus) => {
    if (!detailFor || !session?.user) return;
    try {
      await transitionPurchaseRequisition({
        prId: detailFor.id,
        fromStatus: detailFor.status,
        toStatus,
        actorUserId: session.user.id,
        rejectedReason: toStatus === "rejected" ? rejectReason : undefined,
      });
      toast({ title: `PR ${toStatus}` });
      setDetailFor(null);
      await load();
    } catch (e) {
      toast({ title: "Transition failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardHeader><CardTitle>Purchase Requisitions</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">Select a workspace first.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Purchase Requisitions — {activeProfitCenter.name}</CardTitle>
          <CardDescription>Internal material requests. Single-step approval; convert from the PO tab.</CardDescription>
        </div>
        <Button onClick={openCreate}>New PR</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PR #</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Required by</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prs.map((pr) => (
              <TableRow key={pr.id}>
                <TableCell className="font-medium">{pr.prNumber}</TableCell>
                <TableCell><StatusBadge status={pr.status} /></TableCell>
                <TableCell>{pr.priority ?? "—"}</TableCell>
                <TableCell>{pr.requestedForDate ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(pr.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => void openDetail(pr)}>Open</Button>
                </TableCell>
              </TableRow>
            ))}
            {prs.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No PRs yet. Click <span className="font-medium">New PR</span> to create one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>New Purchase Requisition</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>PR number *</Label>
              <Input value={prNumber} onChange={(e) => setPrNumber(e.target.value)} placeholder="PR-2026-001" maxLength={32} />
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Required by</Label>
              <Input type="date" value={requestedFor} onChange={(e) => setRequestedFor(e.target.value)} />
            </div>
            <div className="sm:col-span-3">
              <Label>Notes</Label>
              <Input value={headerNotes} onChange={(e) => setHeaderNotes(e.target.value)} maxLength={500} />
            </div>
          </div>

          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Line items</h4>
              <Button size="sm" variant="outline" onClick={() => setDraftLines((p) => [...p, newDraftLine()])}>
                <Plus className="mr-1 h-3 w-3" /> Add line
              </Button>
            </div>
            <div className="space-y-2">
              {draftLines.map((l) => (
                <div key={l.tempId} className="grid grid-cols-12 gap-2 rounded-md border border-border bg-muted/20 p-2">
                  <div className="col-span-4">
                    <Label className="text-xs">Material</Label>
                    <MaterialPicker
                      contextKey="procurement.pr"
                      profitCenterId={activeProfitCenter?.id ?? null}
                      materials={materials}
                      value={l.materialId}
                      onChange={(v) => {
                        const mat = materialMap.get(v);
                        updateLine(l.tempId, { materialId: v, uom: mat?.uom ?? l.uom });
                      }}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Qty</Label>
                    <Input type="number" min="0" step="0.01" value={l.quantity || ""} onChange={(e) => updateLine(l.tempId, { quantity: Number(e.target.value) })} />
                  </div>
                  <div className="col-span-1">
                    <Label className="text-xs">UoM</Label>
                    <Input value={l.uom} onChange={(e) => updateLine(l.tempId, { uom: e.target.value })} maxLength={16} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Est. unit cost</Label>
                    <Input type="number" min="0" step="0.01" value={l.estUnitCost ?? ""} onChange={(e) => updateLine(l.tempId, { estUnitCost: e.target.value === "" ? null : Number(e.target.value) })} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Currency</Label>
                    <Select value={l.currencyCode} onValueChange={(v) => updateLine(l.tempId, { currencyCode: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {currencies.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1 flex items-end justify-end">
                    <Button size="icon" variant="ghost" onClick={() => removeLine(l.tempId)} disabled={draftLines.length === 1}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={saving}>{saving ? "Saving…" : "Save as draft"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail / workflow dialog */}
      <Dialog open={Boolean(detailFor)} onOpenChange={(o) => !o && setDetailFor(null)}>
        <DialogContent className="max-w-3xl">
          {detailFor && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detailFor.prNumber} <StatusBadge status={detailFor.status} />
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <div>Priority: <span className="text-foreground">{detailFor.priority ?? "—"}</span></div>
                  <div>Required by: <span className="text-foreground">{detailFor.requestedForDate ?? "—"}</span></div>
                  <div>Created: <span className="text-foreground">{new Date(detailFor.createdAt).toLocaleString()}</span></div>
                  <div>Approved: <span className="text-foreground">{detailFor.approvedAt ? new Date(detailFor.approvedAt).toLocaleString() : "—"}</span></div>
                </div>
                {detailFor.notes && <div className="rounded-md border border-border bg-muted/20 p-2">{detailFor.notes}</div>}
                {detailFor.rejectedReason && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-destructive">
                    Rejected: {detailFor.rejectedReason}
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>UoM</TableHead>
                      <TableHead>Est. cost</TableHead>
                      <TableHead>Currency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailLines.map((l) => {
                      const m = materialMap.get(l.materialId);
                      return (
                        <TableRow key={l.id}>
                          <TableCell>{m ? `${m.code} — ${m.name}` : l.materialId.slice(0, 8)}</TableCell>
                          <TableCell>{l.quantity}</TableCell>
                          <TableCell>{l.uom}</TableCell>
                          <TableCell>{l.estUnitCost ?? "—"}</TableCell>
                          <TableCell>{l.currencyCode}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {detailFor.status === "submitted" && (
                  <div>
                    <Label>Rejection reason (required to reject)</Label>
                    <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} maxLength={255} />
                  </div>
                )}
              </div>
              <DialogFooter className="flex-wrap gap-2">
                {detailFor.status === "draft" && (
                  <Button onClick={() => void transition("submitted")}>Submit for approval</Button>
                )}
                {detailFor.status === "submitted" && (
                  <>
                    <Button variant="outline" onClick={() => void transition("draft")}>Return to draft</Button>
                    <Button variant="destructive" onClick={() => void transition("rejected")} disabled={rejectReason.trim().length < 3}>Reject</Button>
                    <Button onClick={() => void transition("approved")}>Approve</Button>
                  </>
                )}
                {detailFor.status === "approved" && (
                  <span className="text-sm text-muted-foreground">Approved — convert to PO from the PO tab.</span>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
