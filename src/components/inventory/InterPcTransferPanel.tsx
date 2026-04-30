import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import { fetchMaterials, fetchStockLocations, type Material, type StockLocation } from "@/lib/inventory";
import {
  acceptPcTransfer,
  cancelPcTransfer,
  describeRpcError,
  fetchInboundTransfers,
  fetchOutboundTransfers,
  rejectPcTransfer,
  requestPcTransfer,
  type PcTransfer,
} from "@/lib/pc-transfers";

/**
 * Inter-Profit-Center transfer panel.
 *
 * Shows three sub-cards:
 *  1. Send: request stock from the active PC to another PC the user has access to.
 *  2. Inbox: pending transfers where the active PC is the destination — accept (map
 *     to local material + location) or reject (with reason).
 *  3. Outbox: transfers the active PC sent (cancel while pending).
 *
 * Stock effect: sender debited at request time; receiver credited on accept.
 * Reject / cancel post a reversing entry at the source.
 */
export function InterPcTransferPanel() {
  const { activeProfitCenter, assignments, allProfitCenters, isSuperAdmin } = useWorkspace();
  const { toast } = useToast();

  // PCs the user can transfer to/from (excludes the active one for the destination dropdown).
  const reachablePcs = useMemo(() => {
    const list = isSuperAdmin
      ? allProfitCenters.filter((pc) => pc.isActive)
      : assignments.filter((a) => a.isActive && a.profitCenter.isActive).map((a) => a.profitCenter);
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments, allProfitCenters, isSuperAdmin]);

  const otherPcs = useMemo(
    () => reachablePcs.filter((pc) => pc.id !== activeProfitCenter?.id),
    [reachablePcs, activeProfitCenter?.id],
  );

  // Source-side master data (active PC).
  const [sourceMaterials, setSourceMaterials] = useState<Material[]>([]);
  const [sourceLocations, setSourceLocations] = useState<StockLocation[]>([]);

  // Destination-side master data (per accept dialog — fetched lazily by destination PC).
  const [destMaterials, setDestMaterials] = useState<Record<string, Material[]>>({});
  const [destLocations, setDestLocations] = useState<Record<string, StockLocation[]>>({});

  // Form state for request.
  const [destPcId, setDestPcId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Lists.
  const [inbound, setInbound] = useState<PcTransfer[]>([]);
  const [outbound, setOutbound] = useState<PcTransfer[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);

  // Accept dialog state (per row, simple inline mapping).
  const [activeAccept, setActiveAccept] = useState<string | null>(null);
  const [acceptMaterial, setAcceptMaterial] = useState("");
  const [acceptLocation, setAcceptLocation] = useState("");
  const [acceptNotes, setAcceptNotes] = useState("");
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const refreshLists = async () => {
    if (!activeProfitCenter) return;
    setLoadingLists(true);
    try {
      const [inb, outb] = await Promise.all([
        fetchInboundTransfers(activeProfitCenter.id),
        fetchOutboundTransfers(activeProfitCenter.id),
      ]);
      setInbound(inb);
      setOutbound(outb);
    } catch (e) {
      toast({ title: "Failed to load transfers", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setLoadingLists(false);
    }
  };

  useEffect(() => {
    if (!activeProfitCenter) return;
    Promise.all([
      fetchMaterials(activeProfitCenter.id),
      fetchStockLocations(activeProfitCenter.id),
    ])
      .then(([m, l]) => { setSourceMaterials(m); setSourceLocations(l); })
      .catch((e) => toast({ title: "Failed to load master data", description: e instanceof Error ? e.message : "", variant: "destructive" }));
    void refreshLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfitCenter?.id]);

  // Lazy-fetch destination master data when an inbound row is opened for accept.
  const ensureDestData = async (destPc: string) => {
    if (destMaterials[destPc] && destLocations[destPc]) return;
    try {
      const [m, l] = await Promise.all([fetchMaterials(destPc), fetchStockLocations(destPc)]);
      setDestMaterials((prev) => ({ ...prev, [destPc]: m }));
      setDestLocations((prev) => ({ ...prev, [destPc]: l }));
    } catch (e) {
      toast({ title: "Failed to load destination master data", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  const handleRequest = async () => {
    if (!activeProfitCenter) return;
    if (!destPcId || !materialId || !locationId) {
      toast({ title: "Destination PC, material and source location are required", variant: "destructive" }); return;
    }
    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) {
      toast({ title: "Quantity must be > 0", variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      const res = await requestPcTransfer({
        sourceProfitCenterId: activeProfitCenter.id,
        destinationProfitCenterId: destPcId,
        sourceMaterialId: materialId,
        sourceStockLocationId: locationId,
        quantity: q,
        notes: notes || null,
      });
      if (!res.ok) {
        toast({ title: "Request failed", description: describeRpcError(res.error), variant: "destructive" }); return;
      }
      toast({ title: "Transfer requested", description: "Stock debited from this PC. Awaiting receiver acceptance." });
      setDestPcId(""); setMaterialId(""); setLocationId(""); setQuantity(""); setNotes("");
      void refreshLists();
    } catch (e) {
      toast({ title: "Request failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = async (t: PcTransfer) => {
    if (!acceptMaterial || !acceptLocation) {
      toast({ title: "Pick destination material and location", variant: "destructive" }); return;
    }
    setBusyId(t.id);
    try {
      const res = await acceptPcTransfer({
        transferId: t.id,
        destinationMaterialId: acceptMaterial,
        destinationStockLocationId: acceptLocation,
        decisionNotes: acceptNotes || null,
      });
      if (!res.ok) { toast({ title: "Accept failed", description: describeRpcError(res.error), variant: "destructive" }); return; }
      toast({ title: "Transfer accepted" });
      setActiveAccept(null); setAcceptMaterial(""); setAcceptLocation(""); setAcceptNotes("");
      void refreshLists();
    } finally { setBusyId(null); }
  };

  const handleReject = async (t: PcTransfer) => {
    const reason = (rejectReason[t.id] ?? "").trim();
    if (reason.length < 3) {
      toast({ title: "Reason required (min 3 chars)", variant: "destructive" }); return;
    }
    setBusyId(t.id);
    try {
      const res = await rejectPcTransfer({ transferId: t.id, decisionNotes: reason });
      if (!res.ok) { toast({ title: "Reject failed", description: describeRpcError(res.error), variant: "destructive" }); return; }
      toast({ title: "Transfer rejected", description: "Stock returned to source." });
      setRejectReason((prev) => ({ ...prev, [t.id]: "" }));
      void refreshLists();
    } finally { setBusyId(null); }
  };

  const handleCancel = async (t: PcTransfer) => {
    const reason = (rejectReason[t.id] ?? "Cancelled by requester").trim();
    setBusyId(t.id);
    try {
      const res = await cancelPcTransfer({ transferId: t.id, decisionNotes: reason });
      if (!res.ok) { toast({ title: "Cancel failed", description: describeRpcError(res.error), variant: "destructive" }); return; }
      toast({ title: "Transfer cancelled", description: "Stock returned to source." });
      void refreshLists();
    } finally { setBusyId(null); }
  };

  const pcName = (id: string) => reachablePcs.find((p) => p.id === id)?.name ?? id.slice(0, 8);
  const matName = (id: string) => sourceMaterials.find((m) => m.id === id)?.code ?? id.slice(0, 8);
  const locName = (id: string) => sourceLocations.find((l) => l.id === id)?.code ?? id.slice(0, 8);

  const statusBadge = (s: PcTransfer["status"]) => {
    const variant: Record<PcTransfer["status"], "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary", accepted: "default", rejected: "destructive", cancelled: "outline",
    };
    return <Badge variant={variant[s]}>{s}</Badge>;
  };

  if (!activeProfitCenter) return null;

  return (
    <div className="space-y-6">
      {/* REQUEST */}
      <Card className="border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>Inter–profit-center transfer (send)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Destination profit center</Label>
              <Select value={destPcId} onValueChange={setDestPcId}>
                <SelectTrigger><SelectValue placeholder={otherPcs.length ? "Choose PC…" : "No other accessible PCs"} /></SelectTrigger>
                <SelectContent>
                  {otherPcs.map((pc) => (<SelectItem key={pc.id} value={pc.id}>{pc.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity</Label>
              <Input type="number" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div>
              <Label>Material (this PC)</Label>
              <Select value={materialId} onValueChange={setMaterialId}>
                <SelectTrigger><SelectValue placeholder="Choose material…" /></SelectTrigger>
                <SelectContent>
                  {sourceMaterials.filter((m) => m.isActive).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.code} — {m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>From location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue placeholder="Source location" /></SelectTrigger>
                <SelectContent>
                  {sourceLocations.filter((l) => l.isActive).map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context for the receiver" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Stock is debited from this PC immediately. The receiver picks the material and location at accept time.
            </p>
            <Button onClick={() => void handleRequest()} disabled={submitting || otherPcs.length === 0}>
              {submitting ? "Sending…" : "Send request"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* INBOX */}
      <Card className="border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>Incoming requests (this PC = destination)</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingLists ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : inbound.length === 0 ? (
            <p className="text-sm text-muted-foreground">No incoming transfers.</p>
          ) : (
            <div className="space-y-3">
              {inbound.map((t) => {
                const isOpen = activeAccept === t.id;
                const mats = destMaterials[t.destinationProfitCenterId] ?? [];
                const locs = destLocations[t.destinationProfitCenterId] ?? [];
                return (
                  <div key={t.id} className="rounded-md border border-border p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {statusBadge(t.status)}
                      <span className="font-medium">{t.quantity}</span>
                      <span className="text-muted-foreground">from</span>
                      <span className="font-medium">{pcName(t.sourceProfitCenterId)}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{new Date(t.createdAt).toLocaleString()}</span>
                    </div>
                    {t.requestNotes && <p className="text-xs text-muted-foreground">Note: {t.requestNotes}</p>}
                    {t.status === "pending" && (
                      <div className="space-y-2">
                        {!isOpen ? (
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => { setActiveAccept(t.id); void ensureDestData(t.destinationProfitCenterId); }}>
                              Accept…
                            </Button>
                            <Input
                              className="w-72"
                              placeholder="Reason to reject"
                              value={rejectReason[t.id] ?? ""}
                              onChange={(e) => setRejectReason((p) => ({ ...p, [t.id]: e.target.value }))}
                            />
                            <Button size="sm" variant="destructive" disabled={busyId === t.id} onClick={() => void handleReject(t)}>
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div>
                              <Label>Map to local material</Label>
                              <Select value={acceptMaterial} onValueChange={setAcceptMaterial}>
                                <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                                <SelectContent>
                                  {mats.filter((m) => m.isActive).map((m) => (
                                    <SelectItem key={m.id} value={m.id}>{m.code} — {m.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Receive into location</Label>
                              <Select value={acceptLocation} onValueChange={setAcceptLocation}>
                                <SelectTrigger><SelectValue placeholder="Destination location" /></SelectTrigger>
                                <SelectContent>
                                  {locs.filter((l) => l.isActive).map((l) => (
                                    <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="sm:col-span-2">
                              <Label>Notes</Label>
                              <Input value={acceptNotes} onChange={(e) => setAcceptNotes(e.target.value)} />
                            </div>
                            <div className="sm:col-span-2 flex justify-end gap-2">
                              <Button size="sm" variant="ghost" onClick={() => setActiveAccept(null)}>Close</Button>
                              <Button size="sm" disabled={busyId === t.id} onClick={() => void handleAccept(t)}>Confirm accept</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {t.status !== "pending" && t.decisionNotes && (
                      <p className="text-xs text-muted-foreground">Decision: {t.decisionNotes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* OUTBOX */}
      <Card className="border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>Outgoing requests (this PC = source)</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingLists ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : outbound.length === 0 ? (
            <p className="text-sm text-muted-foreground">No outgoing transfers.</p>
          ) : (
            <div className="space-y-3">
              {outbound.map((t) => (
                <div key={t.id} className="rounded-md border border-border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {statusBadge(t.status)}
                    <span className="font-medium">{t.quantity}</span> {matName(t.sourceMaterialId)}
                    <span className="text-muted-foreground">from</span> {locName(t.sourceStockLocationId)}
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium">{pcName(t.destinationProfitCenterId)}</span>
                    <span className="text-muted-foreground">·</span>
                    <span>{new Date(t.createdAt).toLocaleString()}</span>
                  </div>
                  {t.requestNotes && <p className="text-xs text-muted-foreground">Note: {t.requestNotes}</p>}
                  {t.status === "pending" && (
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" disabled={busyId === t.id} onClick={() => void handleCancel(t)}>
                        Cancel request
                      </Button>
                    </div>
                  )}
                  {t.status !== "pending" && t.decisionNotes && (
                    <p className="text-xs text-muted-foreground">Decision: {t.decisionNotes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
