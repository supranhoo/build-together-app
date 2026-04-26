/**
 * Orders tab — list + create (optionally from inquiry) + status update.
 * Converting from an inquiry locks the inquiry to status='won'.
 */
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { createAuditLog } from "@/lib/workspace";
import {
  convertInquiryToOrder, createOrder, fetchCustomers, fetchInquiries, fetchOrders,
  updateInquiryStatus, updateOrderStatus,
  type SalesCustomer, type SalesInquiry, type SalesOrder, type SalesOrderStatus,
} from "@/lib/sales";

interface Props { profitCenterId: string; isExport: boolean; }
const STATUSES: SalesOrderStatus[] = [
  "draft", "confirmed", "in_production", "ready_for_dispatch",
  "dispatched", "sailed", "delivered", "invoiced", "paid", "cancelled",
];

export function OrdersTab({ profitCenterId, isExport }: Props) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<SalesOrder[]>([]);
  const [customers, setCustomers] = useState<SalesCustomer[]>([]);
  const [openInq, setOpenInq] = useState<SalesInquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customerId: "", inquiryId: "", product: "", grade: "", qtyMt: "",
    pricePerMt: "", currencyCode: isExport ? "USD" : "INR", fxRate: "",
    incoterms: isExport ? "CIF" : "", portOfLoading: "", portOfDischarge: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const [ord, cust, inq] = await Promise.all([
        fetchOrders(profitCenterId, { isExport }),
        fetchCustomers(profitCenterId, { isExport, activeOnly: true }),
        fetchInquiries(profitCenterId, { isExport, status: "open" }),
      ]);
      setRows(ord); setCustomers(cust); setOpenInq(inq);
    } catch (e) { toast({ title: "Load failed", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [profitCenterId, isExport]);

  const pickInquiry = (id: string) => {
    const inq = openInq.find((i) => i.id === id);
    if (!inq) return;
    setForm({
      ...form,
      inquiryId: id, customerId: inq.customerId, product: inq.product,
      grade: inq.grade ?? "", qtyMt: String(inq.qtyMt),
      currencyCode: inq.currencyCode, incoterms: inq.incoterms ?? form.incoterms,
      portOfDischarge: inq.port ?? "",
      pricePerMt: inq.expectedPrice ? String(inq.expectedPrice) : form.pricePerMt,
    });
  };

  const handleSave = async () => {
    if (!session?.user) return;
    if (!form.customerId) { toast({ title: "Pick a customer", variant: "destructive" }); return; }
    const qty = Number(form.qtyMt); const price = Number(form.pricePerMt);
    if (!Number.isFinite(qty) || qty <= 0) { toast({ title: "Quantity must be > 0", variant: "destructive" }); return; }
    if (!Number.isFinite(price) || price < 0) { toast({ title: "Price must be ≥ 0", variant: "destructive" }); return; }
    setSaving(true);
    try {
      let payload;
      if (form.inquiryId) {
        const inq = openInq.find((i) => i.id === form.inquiryId)!;
        payload = convertInquiryToOrder(inq, {
          pricePerMt: price, createdBy: session.user.id,
          fxRate: form.fxRate ? Number(form.fxRate) : null,
        });
        // Allow user overrides on top
        payload.qtyMt = qty;
        payload.product = form.product.trim() || payload.product;
        payload.grade = form.grade.trim() || payload.grade;
        payload.currencyCode = form.currencyCode || payload.currencyCode;
        payload.portOfLoading = form.portOfLoading.trim() || null;
        payload.portOfDischarge = form.portOfDischarge.trim() || payload.portOfDischarge;
        payload.incoterms = form.incoterms.trim() || payload.incoterms;
      } else {
        payload = {
          profitCenterId, customerId: form.customerId, isExport,
          product: form.product.trim(), grade: form.grade.trim() || null,
          qtyMt: qty, pricePerMt: price,
          currencyCode: form.currencyCode || (isExport ? "USD" : "INR"),
          fxRate: form.fxRate ? Number(form.fxRate) : null,
          incoterms: form.incoterms.trim() || null,
          portOfLoading: form.portOfLoading.trim() || null,
          portOfDischarge: form.portOfDischarge.trim() || null,
          status: "confirmed" as SalesOrderStatus,
          createdBy: session.user.id,
        };
      }
      const created = await createOrder(payload);
      if (form.inquiryId) {
        await updateInquiryStatus(form.inquiryId, "won");
      }
      await createAuditLog({
        actorUserId: session.user.id, profitCenterId,
        entityType: "sales_orders", entityId: created.id,
        action: "sales_order.created",
        changeSummary: {
          so_number: created.soNumber, qty_mt: created.qtyMt,
          price_per_mt: created.pricePerMt, currency: created.currencyCode,
          inquiry_id: form.inquiryId || null,
        },
      });
      toast({ title: "Order created", description: created.soNumber });
      setOpen(false);
      setForm({ ...form, inquiryId: "", product: "", grade: "", qtyMt: "", pricePerMt: "", fxRate: "", portOfLoading: "", portOfDischarge: "" });
      await load();
    } catch (e) { toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleStatus = async (row: SalesOrder, status: SalesOrderStatus) => {
    if (!session?.user) return;
    try {
      await updateOrderStatus(row.id, status);
      await createAuditLog({
        actorUserId: session.user.id, profitCenterId,
        entityType: "sales_orders", entityId: row.id,
        action: "sales_order.status_changed",
        changeSummary: { from: row.status, to: status, so_number: row.soNumber },
      });
      toast({ title: `Order ${status}` });
      await load();
    } catch (e) { toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{isExport ? "Export" : "Domestic"} Sales Orders</CardTitle>
          <CardDescription>Auto-numbered. Convert an open inquiry to lock it as won.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New order</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>New sales order</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Convert from open inquiry (optional)</Label>
                <Select value={form.inquiryId || "__none"} onValueChange={(v) => v === "__none" ? setForm({ ...form, inquiryId: "" }) : pickInquiry(v)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— None —</SelectItem>
                    {openInq.map((i) => <SelectItem key={i.id} value={i.id}>{i.inquiryNo} — {i.customerName} — {i.product} {i.qtyMt} MT</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Customer</Label>
                <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Product</Label><Input value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} /></div>
              <div><Label>Grade</Label><Input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} /></div>
              <div><Label>Qty (MT)</Label><Input type="number" step="0.01" value={form.qtyMt} onChange={(e) => setForm({ ...form, qtyMt: e.target.value })} /></div>
              <div><Label>Price / MT</Label><Input type="number" step="0.01" value={form.pricePerMt} onChange={(e) => setForm({ ...form, pricePerMt: e.target.value })} /></div>
              <div><Label>Currency</Label><Input value={form.currencyCode} onChange={(e) => setForm({ ...form, currencyCode: e.target.value.toUpperCase() })} /></div>
              {isExport && <div><Label>FX → INR</Label><Input type="number" step="0.0001" value={form.fxRate} onChange={(e) => setForm({ ...form, fxRate: e.target.value })} /></div>}
              {isExport && <>
                <div><Label>Incoterms</Label><Input value={form.incoterms} onChange={(e) => setForm({ ...form, incoterms: e.target.value })} /></div>
                <div><Label>Port of loading</Label><Input value={form.portOfLoading} onChange={(e) => setForm({ ...form, portOfLoading: e.target.value })} /></div>
                <div className="col-span-2"><Label>Port of discharge</Label><Input value={form.portOfDischarge} onChange={(e) => setForm({ ...form, portOfDischarge: e.target.value })} /></div>
              </>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving…" : "Create order"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>SO #</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead>
            <TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Value</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={8} className="text-muted-foreground">Loading…</TableCell></TableRow>}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-muted-foreground">No orders yet.</TableCell></TableRow>
            )}
            {!loading && rows.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">{o.soNumber}</TableCell>
                <TableCell>{o.orderDate}</TableCell>
                <TableCell>{o.customerName ?? "—"}</TableCell>
                <TableCell>{o.product}{o.grade ? ` (${o.grade})` : ""}</TableCell>
                <TableCell className="text-right">{o.qtyMt.toLocaleString()}</TableCell>
                <TableCell className="text-right">{o.currencyCode} {o.totalValue.toLocaleString()}</TableCell>
                <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                <TableCell>
                  <Select value={o.status} onValueChange={(v) => void handleStatus(o, v as SalesOrderStatus)}>
                    <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
