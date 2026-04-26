/**
 * Inquiries tab — list + create + status update. Customer dropdown comes from
 * sales_customers filtered by Domestic/Export view.
 *
 * URL-driven filters (added 2026-04-26 with KPI drilldown rollout):
 *   ?status=quoted          → single status filter (Active Offers KPI)
 *   ?detail=<inquiry_id>    → opens the right-side detail sheet
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, Plus } from "lucide-react";
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
import { FilterBanner } from "@/components/ui/filter-banner";
import { RecordDetailSheet } from "@/components/ui/record-detail-sheet";
import { applyFilters } from "@/lib/url-filters";
import {
  createInquiry, fetchCustomers, fetchInquiries, updateInquiryStatus,
  type SalesCustomer, type SalesInquiry, type SalesInquiryStatus,
} from "@/lib/sales";

interface Props { profitCenterId: string; isExport: boolean; }
const STATUSES: SalesInquiryStatus[] = ["open", "quoted", "won", "lost", "cancelled"];

export function InquiriesTab({ profitCenterId, isExport }: Props) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<SalesInquiry[]>([]);
  const [customers, setCustomers] = useState<SalesCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customerId: "", product: "", grade: "", qtyMt: "",
    expectedPrice: "", currencyCode: isExport ? "USD" : "INR",
    incoterms: isExport ? "CIF" : "", port: "",
  });

  // URL filters
  const statusParam = params.get("status") ?? "";
  const statusFilter = useMemo(
    () => statusParam.split(",").map((s) => s.trim()).filter(Boolean) as SalesInquiryStatus[],
    [statusParam],
  );
  const detailId = params.get("detail") ?? "";
  const filteredRows = useMemo(
    () => statusFilter.length === 0 ? rows : rows.filter((r) => statusFilter.includes(r.status)),
    [rows, statusFilter],
  );
  const detailRecord = useMemo(
    () => detailId ? rows.find((r) => r.id === detailId) ?? null : null,
    [rows, detailId],
  );

  const updateUrl = (updates: Record<string, string | null>) =>
    setParams((cur) => applyFilters(cur, updates), { replace: true });
  const clearStatusFilter = () => updateUrl({ status: null });
  const openDetail = (id: string) => updateUrl({ detail: id });
  const closeDetail = () => updateUrl({ detail: null });

  const load = async () => {
    setLoading(true);
    try {
      const [inq, cust] = await Promise.all([
        fetchInquiries(profitCenterId, { isExport }),
        fetchCustomers(profitCenterId, { isExport, activeOnly: true }),
      ]);
      setRows(inq); setCustomers(cust);
    } catch (e) { toast({ title: "Load failed", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [profitCenterId, isExport]);

  const handleSave = async () => {
    if (!session?.user) return;
    if (!form.customerId) { toast({ title: "Pick a customer", variant: "destructive" }); return; }
    const qty = Number(form.qtyMt);
    if (!Number.isFinite(qty) || qty <= 0) { toast({ title: "Quantity must be > 0", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const created = await createInquiry({
        profitCenterId, customerId: form.customerId, isExport,
        product: form.product.trim(), grade: form.grade.trim() || null, qtyMt: qty,
        expectedPrice: form.expectedPrice ? Number(form.expectedPrice) : null,
        currencyCode: form.currencyCode || (isExport ? "USD" : "INR"),
        incoterms: form.incoterms.trim() || null, port: form.port.trim() || null,
        createdBy: session.user.id,
      });
      await createAuditLog({
        actorUserId: session.user.id, profitCenterId,
        entityType: "sales_inquiries", entityId: created.id,
        action: "sales_inquiry.created",
        changeSummary: { inquiry_no: created.inquiryNo, qty_mt: created.qtyMt, is_export: created.isExport },
      });
      toast({ title: "Inquiry logged", description: created.inquiryNo });
      setOpen(false);
      setForm({ ...form, product: "", grade: "", qtyMt: "", expectedPrice: "", port: "" });
      await load();
    } catch (e) { toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleStatus = async (row: SalesInquiry, status: SalesInquiryStatus) => {
    if (!session?.user) return;
    try {
      await updateInquiryStatus(row.id, status);
      await createAuditLog({
        actorUserId: session.user.id, profitCenterId,
        entityType: "sales_inquiries", entityId: row.id,
        action: "sales_inquiry.status_changed",
        changeSummary: { from: row.status, to: status, inquiry_no: row.inquiryNo },
      });
      toast({ title: `Inquiry ${status}` });
      await load();
    } catch (e) { toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{isExport ? "Export" : "Domestic"} Inquiries</CardTitle>
          <CardDescription>Customer RFQs. Auto-numbered.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Log inquiry</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New inquiry</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Customer</Label>
                <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {customers.length === 0 && <SelectItem value="__none" disabled>No active customers — add one first</SelectItem>}
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Product</Label><Input value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} /></div>
              <div><Label>Grade</Label><Input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} /></div>
              <div><Label>Qty (MT)</Label><Input type="number" step="0.01" value={form.qtyMt} onChange={(e) => setForm({ ...form, qtyMt: e.target.value })} /></div>
              <div><Label>Expected price / MT</Label><Input type="number" step="0.01" value={form.expectedPrice} onChange={(e) => setForm({ ...form, expectedPrice: e.target.value })} /></div>
              <div><Label>Currency</Label><Input value={form.currencyCode} onChange={(e) => setForm({ ...form, currencyCode: e.target.value.toUpperCase() })} /></div>
              {isExport && <div><Label>Incoterms</Label><Input value={form.incoterms} onChange={(e) => setForm({ ...form, incoterms: e.target.value })} /></div>}
              <div className="col-span-2"><Label>Port / Destination</Label><Input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving…" : "Log"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Inquiry #</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead>
            <TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead>
            <TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={7} className="text-muted-foreground">Loading…</TableCell></TableRow>}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-muted-foreground">No inquiries yet.</TableCell></TableRow>
            )}
            {!loading && rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.inquiryNo}</TableCell>
                <TableCell>{r.inquiryDate}</TableCell>
                <TableCell>{r.customerName ?? "—"}</TableCell>
                <TableCell>{r.product}{r.grade ? ` (${r.grade})` : ""}</TableCell>
                <TableCell className="text-right">{r.qtyMt.toLocaleString()}</TableCell>
                <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                <TableCell>
                  <Select value={r.status} onValueChange={(v) => void handleStatus(r, v as SalesInquiryStatus)}>
                    <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
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
