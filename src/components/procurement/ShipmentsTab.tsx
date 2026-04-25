/**
 * Import Shipments tab — Phase C.
 *
 * CRUD for international transit records, optionally linked to a PO.
 * Status workflow: planned → in_transit → customs → delivered  (cancelled is terminal).
 *
 * Cost fields (freight, customs) are captured in the shipment's currency. They
 * are NOT auto-rolled into the PO total — landed-cost rollup is a Phase D task.
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
import { Ship } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  fetchCurrencies,
  fetchImportShipments,
  fetchPurchaseOrders,
  transitionShipment,
  upsertImportShipment,
  type Currency,
  type ImportShipment,
  type PurchaseOrder,
  type ShipmentStatus,
} from "@/lib/procurement";

const STATUS_VARIANT: Record<ShipmentStatus, { label: string; className: string }> = {
  planned:    { label: "Planned",    className: "bg-muted text-muted-foreground" },
  in_transit: { label: "In Transit", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  customs:    { label: "Customs",    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  delivered:  { label: "Delivered",  className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  cancelled:  { label: "Cancelled",  className: "bg-destructive/10 text-destructive" },
};

interface FormState {
  id?: string;
  shipmentNo: string;
  poId: string;
  originCountry: string;
  destinationPort: string;
  vessel: string;
  blNumber: string;
  etd: string;
  eta: string;
  freightCost: string;
  customsCost: string;
  currencyCode: string;
  notes: string;
}

const empty: FormState = {
  shipmentNo: "", poId: "", originCountry: "", destinationPort: "",
  vessel: "", blNumber: "", etd: "", eta: "",
  freightCost: "", customsCost: "", currencyCode: "USD", notes: "",
};

export function ShipmentsTab() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();

  const [shipments, setShipments] = useState<ImportShipment[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState<string | null>(null);

  const poMap = useMemo(() => new Map(pos.map((p) => [p.id, p])), [pos]);

  const load = async () => {
    if (!activeProfitCenter) return;
    setLoading(true);
    try {
      const [list, poList, cur] = await Promise.all([
        fetchImportShipments(activeProfitCenter.id),
        fetchPurchaseOrders(activeProfitCenter.id),
        fetchCurrencies(),
      ]);
      setShipments(list);
      setPos(poList);
      setCurrencies(cur);
    } catch (e) {
      toast({ title: "Failed to load shipments", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfitCenter?.id]);

  const openNew = () => { setForm(empty); setFormOpen(true); };
  const openEdit = (s: ImportShipment) => {
    setForm({
      id: s.id,
      shipmentNo: s.shipmentNo,
      poId: s.poId ?? "",
      originCountry: s.originCountry ?? "",
      destinationPort: s.destinationPort ?? "",
      vessel: s.vessel ?? "",
      blNumber: s.blNumber ?? "",
      etd: s.etd ?? "",
      eta: s.eta ?? "",
      freightCost: s.freightCost?.toString() ?? "",
      customsCost: s.customsCost?.toString() ?? "",
      currencyCode: s.currencyCode,
      notes: s.notes ?? "",
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!activeProfitCenter || !session?.user) return;
    setSaving(true);
    try {
      await upsertImportShipment({
        id: form.id,
        profitCenterId: activeProfitCenter.id,
        shipmentNo: form.shipmentNo,
        poId: form.poId || null,
        originCountry: form.originCountry.trim() || null,
        destinationPort: form.destinationPort.trim() || null,
        vessel: form.vessel.trim() || null,
        blNumber: form.blNumber.trim() || null,
        etd: form.etd || null,
        eta: form.eta || null,
        freightCost: form.freightCost ? Number(form.freightCost) : null,
        customsCost: form.customsCost ? Number(form.customsCost) : null,
        currencyCode: form.currencyCode,
        notes: form.notes.trim() || null,
        createdBy: session.user.id,
      });
      toast({ title: form.id ? "Shipment updated" : "Shipment created" });
      setFormOpen(false);
      await load();
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const advance = async (s: ImportShipment, to: ShipmentStatus) => {
    setTransitioning(s.id);
    try {
      await transitionShipment({ shipmentId: s.id, fromStatus: s.status, toStatus: to });
      toast({ title: `Shipment ${STATUS_VARIANT[to].label}` });
      await load();
    } catch (e) {
      toast({ title: "Transition failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setTransitioning(null);
    }
  };

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardHeader><CardTitle>Import Shipments</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">Select a workspace first.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Ship className="h-5 w-5 text-primary" /> Import Shipments — {activeProfitCenter.name}
          </CardTitle>
          <CardDescription>
            International transit tracking: vessel, BL, ETA, freight & customs costs.
          </CardDescription>
        </div>
        <Button onClick={openNew}>New Shipment</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shipment #</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>PO</TableHead>
              <TableHead>Origin → Port</TableHead>
              <TableHead>Vessel / BL</TableHead>
              <TableHead>ETD</TableHead>
              <TableHead>ETA</TableHead>
              <TableHead className="text-right">Costs</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shipments.map((s) => {
              const po = s.poId ? poMap.get(s.poId) : null;
              const next: ShipmentStatus | null =
                s.status === "planned" ? "in_transit" :
                s.status === "in_transit" ? "customs" :
                s.status === "customs" ? "delivered" : null;
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.shipmentNo}</TableCell>
                  <TableCell>
                    <Badge className={`${STATUS_VARIANT[s.status].className} border-0`}>
                      {STATUS_VARIANT[s.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell>{po ? po.poNumber : "—"}</TableCell>
                  <TableCell className="text-sm">
                    {(s.originCountry ?? "—")} → {(s.destinationPort ?? "—")}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{s.vessel ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{s.blNumber ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.etd ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{s.eta ?? "—"}</TableCell>
                  <TableCell className="text-right text-sm">
                    {s.currencyCode}{" "}
                    {((s.freightCost ?? 0) + (s.customsCost ?? 0)).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>Edit</Button>
                    {next && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={transitioning === s.id}
                        onClick={() => void advance(s, next)}
                      >
                        → {STATUS_VARIANT[next].label}
                      </Button>
                    )}
                    {s.status !== "delivered" && s.status !== "cancelled" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={transitioning === s.id}
                        onClick={() => void advance(s, "cancelled")}
                      >
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {shipments.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground">
                  No shipments yet. Click <span className="font-medium">New Shipment</span> to create one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      {/* Form dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit shipment" : "New shipment"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Shipment number *</Label>
              <Input value={form.shipmentNo} onChange={(e) => setForm({ ...form, shipmentNo: e.target.value })} maxLength={64} />
            </div>
            <div>
              <Label>Linked PO (optional)</Label>
              <Select value={form.poId || "__none__"} onValueChange={(v) => setForm({ ...form, poId: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {pos
                    .filter((p) => p.status !== "closed" && p.status !== "cancelled")
                    .map((p) => <SelectItem key={p.id} value={p.id}>{p.poNumber}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Origin country</Label>
              <Input value={form.originCountry} onChange={(e) => setForm({ ...form, originCountry: e.target.value })} maxLength={64} />
            </div>
            <div>
              <Label>Destination port</Label>
              <Input value={form.destinationPort} onChange={(e) => setForm({ ...form, destinationPort: e.target.value })} maxLength={64} />
            </div>
            <div>
              <Label>Vessel</Label>
              <Input value={form.vessel} onChange={(e) => setForm({ ...form, vessel: e.target.value })} maxLength={64} />
            </div>
            <div>
              <Label>BL number</Label>
              <Input value={form.blNumber} onChange={(e) => setForm({ ...form, blNumber: e.target.value })} maxLength={64} />
            </div>
            <div>
              <Label>ETD</Label>
              <Input type="date" value={form.etd} onChange={(e) => setForm({ ...form, etd: e.target.value })} />
            </div>
            <div>
              <Label>ETA</Label>
              <Input type="date" value={form.eta} onChange={(e) => setForm({ ...form, eta: e.target.value })} />
            </div>
            <div>
              <Label>Currency *</Label>
              <Select value={form.currencyCode} onValueChange={(v) => setForm({ ...form, currencyCode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Freight cost</Label>
              <Input type="number" min="0" step="0.01" value={form.freightCost} onChange={(e) => setForm({ ...form, freightCost: e.target.value })} />
            </div>
            <div>
              <Label>Customs cost</Label>
              <Input type="number" min="0" step="0.01" value={form.customsCost} onChange={(e) => setForm({ ...form, customsCost: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
