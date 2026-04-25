/**
 * Suppliers tab — Phase B.
 *
 * Workspace-scoped CRUD over `public.suppliers`. RLS already enforces
 * `has_profit_center_access`; this UI assumes the active workspace is the
 * supplier's workspace.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  fetchCurrencies,
  fetchSuppliers,
  upsertSupplier,
  type Currency,
  type Supplier,
} from "@/lib/procurement";

interface FormState {
  id?: string;
  code: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  defaultCurrency: string;
  paymentTerms: string;
  leadTimeDays: string;
  isPreferred: boolean;
  isActive: boolean;
  notes: string;
}

const empty: FormState = {
  code: "",
  name: "",
  contactPerson: "",
  email: "",
  phone: "",
  address: "",
  country: "",
  defaultCurrency: "INR",
  paymentTerms: "",
  leadTimeDays: "",
  isPreferred: false,
  isActive: true,
  notes: "",
};

export function SuppliersTab() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!activeProfitCenter) return;
    setLoading(true);
    try {
      const [s, c] = await Promise.all([fetchSuppliers(activeProfitCenter.id), fetchCurrencies()]);
      setSuppliers(s);
      setCurrencies(c);
    } catch (e) {
      toast({ title: "Failed to load suppliers", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfitCenter?.id]);

  const openNew = () => {
    setForm({ ...empty });
    setOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setForm({
      id: s.id,
      code: s.code,
      name: s.name,
      contactPerson: s.contactPerson ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      address: s.address ?? "",
      country: s.country ?? "",
      defaultCurrency: s.defaultCurrency,
      paymentTerms: s.paymentTerms ?? "",
      leadTimeDays: s.leadTimeDays != null ? String(s.leadTimeDays) : "",
      isPreferred: s.isPreferred,
      isActive: s.isActive,
      notes: s.notes ?? "",
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: "Code and name are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const leadTimeDays = form.leadTimeDays.trim() === "" ? null : Number(form.leadTimeDays);
      if (leadTimeDays !== null && (!Number.isFinite(leadTimeDays) || leadTimeDays < 0)) {
        throw new Error("Lead time must be a non-negative number");
      }
      await upsertSupplier({
        id: form.id,
        profitCenterId: activeProfitCenter.id,
        code: form.code,
        name: form.name,
        contactPerson: form.contactPerson.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        country: form.country.trim() || null,
        defaultCurrency: form.defaultCurrency,
        paymentTerms: form.paymentTerms.trim() || null,
        leadTimeDays,
        isPreferred: form.isPreferred,
        isActive: form.isActive,
        notes: form.notes.trim() || null,
        createdBy: session.user.id,
      });
      toast({ title: form.id ? "Supplier updated" : "Supplier created" });
      setOpen(false);
      await load();
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardHeader><CardTitle>Suppliers</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">Select a workspace first.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Suppliers — {activeProfitCenter.name}</CardTitle>
          <CardDescription>Vendor directory: contacts, payment terms, lead time and preferred status.</CardDescription>
        </div>
        <Button onClick={openNew}>New supplier</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Lead time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.code}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {s.name}
                    {s.isPreferred && <Badge variant="secondary">Preferred</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {s.contactPerson ?? "—"}{s.email ? ` · ${s.email}` : ""}
                </TableCell>
                <TableCell>{s.defaultCurrency}</TableCell>
                <TableCell>{s.leadTimeDays != null ? `${s.leadTimeDays} d` : "—"}</TableCell>
                <TableCell>
                  {s.isActive
                    ? <Badge variant="outline">Active</Badge>
                    : <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => openEdit(s)}>Edit</Button>
                </TableCell>
              </TableRow>
            ))}
            {suppliers.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No suppliers yet. Click <span className="font-medium">New supplier</span> to add one.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit supplier" : "New supplier"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Code *</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} maxLength={32} />
            </div>
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} />
            </div>
            <div>
              <Label>Contact person</Label>
              <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} maxLength={120} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={40} />
            </div>
            <div>
              <Label>Country</Label>
              <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} maxLength={64} />
            </div>
            <div className="sm:col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={255} />
            </div>
            <div>
              <Label>Default currency</Label>
              <Select value={form.defaultCurrency} onValueChange={(v) => setForm({ ...form, defaultCurrency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Payment terms</Label>
              <Input value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} placeholder="Net 30" maxLength={64} />
            </div>
            <div>
              <Label>Lead time (days)</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={form.leadTimeDays}
                onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })}
                min={0}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-2">
              <span className="text-sm">Preferred</span>
              <Switch checked={form.isPreferred} onCheckedChange={(v) => setForm({ ...form, isPreferred: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-2">
              <span className="text-sm">Active</span>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
