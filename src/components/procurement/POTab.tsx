/**
 * Purchase Orders tab — Phase B.
 *
 * Two creation modes:
 *  1. Blank PO (pick supplier + lines manually)
 *  2. Convert from an approved PR (lines pre-filled from PR lines; the source
 *     PR is then transitioned to "converted").
 *
 * Status transitions: draft → sent → acknowledged → partially_received →
 * received → closed. Cancellation requires a reason (≥3 chars).
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
import { Trash2, Plus, PackagePlus } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { fetchMaterials, fetchStockLocations, type Material, type StockLocation } from "@/lib/inventory";
import {
  calcPoTotal,
  convertPrToPo,
  createPurchaseOrder,
  fetchCurrencies,
  fetchPoLines,
  fetchPrLines,
  fetchPurchaseOrders,
  fetchPurchaseRequisitions,
  fetchSuppliers,
  receivePoLine,
  transitionPurchaseOrder,
  transitionPurchaseRequisition,
  type Currency,
  type PoLine,
  type PoLineInput,
  type PoStatus,
  type PurchaseOrder,
  type PurchaseRequisition,
  type Supplier,
} from "@/lib/procurement";

interface DraftLine extends PoLineInput { tempId: string; }

const STATUS_VARIANT: Record<PoStatus, { label: string; className: string }> = {
  draft:                { label: "Draft",      className: "bg-muted text-muted-foreground" },
  sent:                 { label: "Sent",       className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  acknowledged:         { label: "Ack'd",      className: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" },
  partially_received:   { label: "Partial",    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  received:             { label: "Received",   className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  closed:               { label: "Closed",     className: "bg-muted text-muted-foreground" },
  cancelled:            { label: "Cancelled",  className: "bg-destructive/10 text-destructive" },
};

function StatusBadge({ status }: { status: PoStatus }) {
  const v = STATUS_VARIANT[status];
  return <Badge className={`${v.className} border-0`}>{v.label}</Badge>;
}

function newDraftLine(): DraftLine {
  return {
    tempId: crypto.randomUUID(),
    materialId: "",
    qtyOrdered: 0,
    uom: "kg",
    unitCost: 0,
    currencyCode: "INR",
    notes: null,
  };
}

export function POTab() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();

  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [stockLocations, setStockLocations] = useState<StockLocation[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [approvedPrs, setApprovedPrs] = useState<PurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [mode, setMode] = useState<"blank" | "from_pr">("blank");
  const [poNumber, setPoNumber] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("INR");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [headerNotes, setHeaderNotes] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([newDraftLine()]);
  const [sourcePrId, setSourcePrId] = useState("");
  const [saving, setSaving] = useState(false);

  const [detailFor, setDetailFor] = useState<PurchaseOrder | null>(null);
  const [detailLines, setDetailLines] = useState<PoLine[]>([]);
  const [cancelReason, setCancelReason] = useState("");

  // Receive dialog state (PO ↔ inventory linkage)
  const [receiveLine, setReceiveLine] = useState<PoLine | null>(null);
  const [receiveQty, setReceiveQty] = useState("");
  const [receiveLocation, setReceiveLocation] = useState("");
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiving, setReceiving] = useState(false);

  const materialMap = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const supplierMap = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);

  const total = useMemo(
    () => calcPoTotal(draftLines.map((l) => ({ qtyOrdered: Number(l.qtyOrdered) || 0, unitCost: Number(l.unitCost) || 0 }))),
    [draftLines],
  );

  const load = async () => {
    if (!activeProfitCenter) return;
    setLoading(true);
    try {
      const [list, sup, mats, locs, cur, prs] = await Promise.all([
        fetchPurchaseOrders(activeProfitCenter.id),
        fetchSuppliers(activeProfitCenter.id),
        fetchMaterials(activeProfitCenter.id),
        fetchStockLocations(activeProfitCenter.id),
        fetchCurrencies(),
        fetchPurchaseRequisitions(activeProfitCenter.id),
      ]);
      setPos(list);
      setSuppliers(sup.filter((s) => s.isActive));
      setMaterials(mats.filter((m) => m.isActive));
      setStockLocations(locs.filter((l) => l.isActive));
      setCurrencies(cur);
      setApprovedPrs(prs.filter((p) => p.status === "approved"));
    } catch (e) {
      toast({ title: "Failed to load POs", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfitCenter?.id]);

  const resetForm = () => {
    setMode("blank");
    setPoNumber("");
    setSupplierId("");
    setCurrencyCode("INR");
    setPaymentTerms("");
    setExpectedDelivery("");
    setHeaderNotes("");
    setDraftLines([newDraftLine()]);
    setSourcePrId("");
  };

  const openCreate = () => { resetForm(); setCreateOpen(true); };

  const updateLine = (tempId: string, patch: Partial<DraftLine>) => {
    setDraftLines((prev) => prev.map((l) => (l.tempId === tempId ? { ...l, ...patch } : l)));
  };
  const removeLine = (tempId: string) => {
    setDraftLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.tempId !== tempId)));
  };

  const handleSelectPr = async (prId: string) => {
    setSourcePrId(prId);
    if (!prId) { setDraftLines([newDraftLine()]); return; }
    try {
      const lines = await fetchPrLines(prId);
      const sup = supplierMap.get(supplierId);
      const cur = sup?.defaultCurrency ?? currencyCode;
      setCurrencyCode(cur);
      setDraftLines(
        lines.map((l) => ({
          tempId: l.id,
          materialId: l.materialId,
          qtyOrdered: l.quantity,
          uom: l.uom,
          unitCost: l.estUnitCost ?? 0,
          currencyCode: cur,
          sourcePrLineId: l.id,
          notes: l.notes,
        })),
      );
    } catch (e) {
      toast({ title: "Failed to load PR lines", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const handleCreate = async () => {
    if (!activeProfitCenter || !session?.user) return;
    setSaving(true);
    try {
      if (mode === "from_pr") {
        if (!sourcePrId) throw new Error("Pick an approved PR");
        const overrides: Record<string, number> = {};
        for (const l of draftLines) {
          if (l.sourcePrLineId) overrides[l.sourcePrLineId] = Number(l.unitCost);
        }
        await convertPrToPo({
          prId: sourcePrId,
          profitCenterId: activeProfitCenter.id,
          poNumber,
          supplierId,
          currencyCode,
          paymentTerms: paymentTerms.trim() || null,
          expectedDeliveryDate: expectedDelivery || null,
          notes: headerNotes.trim() || null,
          createdBy: session.user.id,
          unitCostOverrides: overrides,
        });
        // Move the source PR to "converted" so it disappears from the dropdown.
        await transitionPurchaseRequisition({
          prId: sourcePrId,
          fromStatus: "approved",
          toStatus: "converted",
          actorUserId: session.user.id,
        });
      } else {
        await createPurchaseOrder({
          profitCenterId: activeProfitCenter.id,
          poNumber,
          supplierId,
          sourcePrId: null,
          currencyCode,
          paymentTerms: paymentTerms.trim() || null,
          expectedDeliveryDate: expectedDelivery || null,
          notes: headerNotes.trim() || null,
          createdBy: session.user.id,
          lines: draftLines.map((l) => ({
            materialId: l.materialId,
            qtyOrdered: Number(l.qtyOrdered),
            uom: l.uom,
            unitCost: Number(l.unitCost),
            currencyCode: l.currencyCode,
            notes: l.notes ?? null,
          })),
        });
      }
      toast({ title: "PO created", description: poNumber });
      setCreateOpen(false);
      await load();
    } catch (e) {
      toast({ title: "Could not create PO", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (po: PurchaseOrder) => {
    setDetailFor(po);
    setCancelReason("");
    try {
      setDetailLines(await fetchPoLines(po.id));
    } catch (e) {
      toast({ title: "Failed to load PO lines", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const transition = async (toStatus: PoStatus) => {
    if (!detailFor || !session?.user) return;
    try {
      await transitionPurchaseOrder({
        poId: detailFor.id,
        fromStatus: detailFor.status,
        toStatus,
        actorUserId: session.user.id,
        cancelledReason: toStatus === "cancelled" ? cancelReason : undefined,
      });
      toast({ title: `PO ${toStatus}` });
      setDetailFor(null);
      await load();
    } catch (e) {
      toast({ title: "Transition failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const openReceive = (line: PoLine) => {
    setReceiveLine(line);
    const remaining = Math.max(0, line.qtyOrdered - line.qtyReceived);
    setReceiveQty(remaining > 0 ? String(remaining) : "");
    setReceiveLocation(stockLocations[0]?.id ?? "");
    setReceiveNotes("");
  };

  const handleReceive = async () => {
    if (!receiveLine || !detailFor || !activeProfitCenter || !session?.user) return;
    const qty = Number(receiveQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast({ title: "Quantity must be > 0", variant: "destructive" });
      return;
    }
    setReceiving(true);
    try {
      const result = await receivePoLine({
        poLineId: receiveLine.id,
        profitCenterId: activeProfitCenter.id,
        materialId: receiveLine.materialId,
        stockLocationId: receiveLocation,
        quantity: qty,
        unitCost: receiveLine.unitCost,
        poId: detailFor.id,
        notes: receiveNotes.trim() || null,
        createdBy: session.user.id,
      });

      // Refresh lines, then auto-advance PO header status if appropriate.
      const fresh = await fetchPoLines(detailFor.id);
      setDetailLines(fresh);

      const allComplete = fresh.every((l) => l.qtyReceived + 1e-6 >= l.qtyOrdered);
      const anyPartial = fresh.some((l) => l.qtyReceived > 0);

      if (allComplete && detailFor.status !== "received" && detailFor.status !== "closed") {
        await transitionPurchaseOrder({
          poId: detailFor.id,
          fromStatus: detailFor.status,
          toStatus: "received",
          actorUserId: session.user.id,
        });
      } else if (anyPartial && detailFor.status === "acknowledged") {
        await transitionPurchaseOrder({
          poId: detailFor.id,
          fromStatus: detailFor.status,
          toStatus: "partially_received",
          actorUserId: session.user.id,
        });
      }

      toast({
        title: result.lineComplete ? "Line fully received" : "Receipt posted",
        description: `${qty} added to inventory.`,
      });
      setReceiveLine(null);
      await load();
    } catch (e) {
      toast({ title: "Receipt failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setReceiving(false);
    }
  };

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardHeader><CardTitle>Purchase Orders</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">Select a workspace first.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Purchase Orders — {activeProfitCenter.name}</CardTitle>
          <CardDescription>Multi-currency supplier orders. Create blank or convert from an approved PR.</CardDescription>
        </div>
        <Button onClick={openCreate}>New PO</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO #</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Expected</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pos.map((po) => {
              const sup = supplierMap.get(po.supplierId);
              return (
                <TableRow key={po.id}>
                  <TableCell className="font-medium">{po.poNumber}</TableCell>
                  <TableCell><StatusBadge status={po.status} /></TableCell>
                  <TableCell>{sup ? `${sup.code} — ${sup.name}` : po.supplierId.slice(0, 8)}</TableCell>
                  <TableCell>{po.currencyCode} {po.totalAmount.toLocaleString()}</TableCell>
                  <TableCell>{po.expectedDeliveryDate ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(po.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => void openDetail(po)}>Open</Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {pos.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No POs yet. Click <span className="font-medium">New PO</span> to create one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => { setMode(v as "blank" | "from_pr"); setSourcePrId(""); setDraftLines([newDraftLine()]); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="blank">Blank PO</SelectItem>
                  <SelectItem value="from_pr" disabled={approvedPrs.length === 0}>
                    Convert from approved PR {approvedPrs.length === 0 && "(none available)"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === "from_pr" && (
              <div>
                <Label>Source PR *</Label>
                <Select value={sourcePrId} onValueChange={(v) => void handleSelectPr(v)}>
                  <SelectTrigger><SelectValue placeholder="Pick PR" /></SelectTrigger>
                  <SelectContent>
                    {approvedPrs.map((pr) => <SelectItem key={pr.id} value={pr.id}>{pr.prNumber}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>PO number *</Label>
              <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO-2026-001" maxLength={32} />
            </div>
            <div>
              <Label>Supplier *</Label>
              <Select value={supplierId} onValueChange={(v) => {
                setSupplierId(v);
                const s = supplierMap.get(v);
                if (s) setCurrencyCode(s.defaultCurrency);
              }}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Currency *</Label>
              <Select value={currencyCode} onValueChange={setCurrencyCode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Payment terms</Label>
              <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Net 30" maxLength={64} />
            </div>
            <div>
              <Label>Expected delivery</Label>
              <Input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Input value={headerNotes} onChange={(e) => setHeaderNotes(e.target.value)} maxLength={500} />
            </div>
          </div>

          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Line items</h4>
              {mode === "blank" && (
                <Button size="sm" variant="outline" onClick={() => setDraftLines((p) => [...p, newDraftLine()])}>
                  <Plus className="mr-1 h-3 w-3" /> Add line
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {draftLines.map((l) => (
                <div key={l.tempId} className="grid grid-cols-12 gap-2 rounded-md border border-border bg-muted/20 p-2">
                  <div className="col-span-4">
                    <Label className="text-xs">Material</Label>
                    <MaterialPicker
                      contextKey="procurement.po"
                      profitCenterId={activeProfitCenter?.id ?? null}
                      materials={materials}
                      value={l.materialId}
                      onChange={(v) => {
                        const mat = materialMap.get(v);
                        updateLine(l.tempId, { materialId: v, uom: mat?.uom ?? l.uom });
                      }}
                      disabled={mode === "from_pr"}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Qty</Label>
                    <Input type="number" min="0" step="0.01" value={l.qtyOrdered || ""} onChange={(e) => updateLine(l.tempId, { qtyOrdered: Number(e.target.value) })} disabled={mode === "from_pr"} />
                  </div>
                  <div className="col-span-1">
                    <Label className="text-xs">UoM</Label>
                    <Input value={l.uom} onChange={(e) => updateLine(l.tempId, { uom: e.target.value })} maxLength={16} disabled={mode === "from_pr"} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Unit cost *</Label>
                    <Input type="number" min="0" step="0.01" value={l.unitCost || ""} onChange={(e) => updateLine(l.tempId, { unitCost: Number(e.target.value) })} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Line total</Label>
                    <div className="px-3 py-2 text-sm">{(Number(l.qtyOrdered) * Number(l.unitCost) || 0).toLocaleString()}</div>
                  </div>
                  <div className="col-span-1 flex items-end justify-end">
                    {mode === "blank" && (
                      <Button size="icon" variant="ghost" onClick={() => removeLine(l.tempId)} disabled={draftLines.length === 1}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-1 text-sm font-medium">
              Total: {currencyCode} {total.toLocaleString()}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={saving}>{saving ? "Saving…" : "Save as draft"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={Boolean(detailFor)} onOpenChange={(o) => !o && setDetailFor(null)}>
        <DialogContent className="max-w-3xl">
          {detailFor && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detailFor.poNumber} <StatusBadge status={detailFor.status} />
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <div>Supplier: <span className="text-foreground">{supplierMap.get(detailFor.supplierId)?.name ?? "—"}</span></div>
                  <div>Total: <span className="text-foreground">{detailFor.currencyCode} {detailFor.totalAmount.toLocaleString()}</span></div>
                  <div>Expected: <span className="text-foreground">{detailFor.expectedDeliveryDate ?? "—"}</span></div>
                  <div>Payment: <span className="text-foreground">{detailFor.paymentTerms ?? "—"}</span></div>
                </div>
                {detailFor.notes && <div className="rounded-md border border-border bg-muted/20 p-2">{detailFor.notes}</div>}
                {detailFor.cancelledReason && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-destructive">
                    Cancelled: {detailFor.cancelledReason}
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead className="text-right">Ordered</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead>UoM</TableHead>
                      <TableHead className="text-right">Unit cost</TableHead>
                      <TableHead className="text-right">Line total</TableHead>
                      <TableHead className="text-right">Receive</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailLines.map((l) => {
                      const m = materialMap.get(l.materialId);
                      const remaining = Math.max(0, l.qtyOrdered - l.qtyReceived);
                      const canReceive =
                        remaining > 0 &&
                        (detailFor.status === "acknowledged" ||
                          detailFor.status === "partially_received" ||
                          detailFor.status === "sent");
                      return (
                        <TableRow key={l.id}>
                          <TableCell>{m ? `${m.code} — ${m.name}` : l.materialId.slice(0, 8)}</TableCell>
                          <TableCell className="text-right">{l.qtyOrdered}</TableCell>
                          <TableCell className="text-right">{l.qtyReceived}</TableCell>
                          <TableCell>{l.uom}</TableCell>
                          <TableCell className="text-right">{l.unitCost}</TableCell>
                          <TableCell className="text-right">{(l.qtyOrdered * l.unitCost).toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            {canReceive ? (
                              <Button size="sm" variant="outline" onClick={() => openReceive(l)}>
                                <PackagePlus className="mr-1 h-3 w-3" /> {remaining}
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {remaining === 0 ? "Done" : "—"}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {(detailFor.status === "draft" || detailFor.status === "sent" || detailFor.status === "acknowledged") && (
                  <div>
                    <Label>Cancellation reason (required to cancel)</Label>
                    <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={255} />
                  </div>
                )}
              </div>
              <DialogFooter className="flex-wrap gap-2">
                {detailFor.status === "draft" && (
                  <Button onClick={() => void transition("sent")}>Send to supplier</Button>
                )}
                {detailFor.status === "sent" && (
                  <Button onClick={() => void transition("acknowledged")}>Mark acknowledged</Button>
                )}
                {(detailFor.status === "acknowledged" || detailFor.status === "partially_received") && (
                  <span className="text-xs text-muted-foreground">
                    Use the <strong>Receive</strong> button on each line to post receipts. Status updates automatically.
                  </span>
                )}
                {detailFor.status === "received" && (
                  <Button onClick={() => void transition("closed")}>Close PO</Button>
                )}
                {(detailFor.status === "draft" || detailFor.status === "sent" || detailFor.status === "acknowledged") && (
                  <Button variant="destructive" onClick={() => void transition("cancelled")} disabled={cancelReason.trim().length < 3}>
                    Cancel PO
                  </Button>
                )}
                {(detailFor.status === "closed" || detailFor.status === "cancelled") && (
                  <span className="text-sm text-muted-foreground">No further actions for this PO.</span>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Receive line dialog */}
      <Dialog open={Boolean(receiveLine)} onOpenChange={(o) => !o && setReceiveLine(null)}>
        <DialogContent className="max-w-md">
          {receiveLine && (
            <>
              <DialogHeader>
                <DialogTitle>Receive PO line</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="font-medium">
                    {materialMap.get(receiveLine.materialId)?.code ?? receiveLine.materialId.slice(0, 8)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Ordered {receiveLine.qtyOrdered} {receiveLine.uom} · Already received {receiveLine.qtyReceived} ·
                    Remaining {Math.max(0, receiveLine.qtyOrdered - receiveLine.qtyReceived)}
                  </div>
                </div>
                <div>
                  <Label>Quantity to receive *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={receiveQty}
                    onChange={(e) => setReceiveQty(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Stock location *</Label>
                  <Select value={receiveLocation} onValueChange={setReceiveLocation}>
                    <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                    <SelectContent>
                      {stockLocations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {stockLocations.length === 0 && (
                    <p className="mt-1 text-xs text-destructive">
                      No active stock locations configured. Add one in Inventory settings.
                    </p>
                  )}
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)} maxLength={255} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setReceiveLine(null)}>Cancel</Button>
                <Button
                  onClick={() => void handleReceive()}
                  disabled={receiving || !receiveLocation || !receiveQty}
                >
                  {receiving ? "Posting…" : "Post receipt"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
