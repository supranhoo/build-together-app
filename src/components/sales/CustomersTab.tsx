/**
 * Customers tab — list + create + deactivate. Workspace-scoped via parent.
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
  createCustomer, deactivateCustomer, fetchCustomers,
  type SalesCustomer, type SalesCustomerType,
} from "@/lib/sales";

interface Props { profitCenterId: string; isExport: boolean; }

const TYPES: SalesCustomerType[] = ["steel_mill", "trader", "foundry", "distributor", "other"];

export function CustomersTab({ profitCenterId, isExport }: Props) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<SalesCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", customerType: "steel_mill" as SalesCustomerType,
    country: "", region: "", contactEmail: "", contactPhone: "",
    paymentTermsDays: "30", currencyCode: isExport ? "USD" : "INR",
  });

  const load = async () => {
    setLoading(true);
    try { setRows(await fetchCustomers(profitCenterId, { isExport })); }
    catch (e) { toast({ title: "Failed to load customers", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [profitCenterId, isExport]);

  const handleSave = async () => {
    if (!session?.user) return;
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const created = await createCustomer({
        profitCenterId, name: form.name.trim(), customerType: form.customerType, isExport,
        country: form.country.trim() || null, region: form.region.trim() || null,
        contactEmail: form.contactEmail.trim() || null, contactPhone: form.contactPhone.trim() || null,
        paymentTermsDays: Number(form.paymentTermsDays) || 30,
        currencyCode: form.currencyCode.trim() || (isExport ? "USD" : "INR"),
        createdBy: session.user.id,
      });
      await createAuditLog({
        actorUserId: session.user.id, profitCenterId,
        entityType: "sales_customers", entityId: created.id,
        action: "sales_customer.created",
        changeSummary: { code: created.code, name: created.name, is_export: created.isExport },
      });
      toast({ title: "Customer added", description: created.code });
      setOpen(false);
      setForm({ ...form, name: "", country: "", region: "", contactEmail: "", contactPhone: "" });
      await load();
    } catch (e) { toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDeactivate = async (row: SalesCustomer) => {
    if (!session?.user) return;
    if (!confirm(`Deactivate ${row.name}?`)) return;
    try {
      await deactivateCustomer(row.id);
      await createAuditLog({
        actorUserId: session.user.id, profitCenterId,
        entityType: "sales_customers", entityId: row.id,
        action: "sales_customer.deactivated", changeSummary: { code: row.code },
      });
      toast({ title: "Customer deactivated" });
      await load();
    } catch (e) { toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{isExport ? "Export" : "Domestic"} Customers</CardTitle>
          <CardDescription>Customer master for this workspace. Codes auto-generated.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New customer</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New {isExport ? "export" : "domestic"} customer</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.customerType} onValueChange={(v) => setForm({ ...form, customerType: v as SalesCustomerType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Currency</Label>
                <Input value={form.currencyCode} onChange={(e) => setForm({ ...form, currencyCode: e.target.value.toUpperCase() })} />
              </div>
              {isExport ? (
                <div>
                  <Label>Country</Label>
                  <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                </div>
              ) : (
                <div>
                  <Label>Region</Label>
                  <Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} />
                </div>
              )}
              <div>
                <Label>Payment terms (days)</Label>
                <Input type="number" value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value })} />
              </div>
              <div>
                <Label>Contact email</Label>
                <Input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
              </div>
              <div>
                <Label>Contact phone</Label>
                <Input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving…" : "Add"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Code</TableHead><TableHead>Name</TableHead>
            <TableHead>Type</TableHead><TableHead>{isExport ? "Country" : "Region"}</TableHead>
            <TableHead>Currency</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={7} className="text-muted-foreground">Loading…</TableCell></TableRow>}
            {!loading && rows.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-muted-foreground">No customers yet.</TableCell></TableRow>
            )}
            {!loading && rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.code}</TableCell>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.customerType.replace("_", " ")}</TableCell>
                <TableCell>{(isExport ? c.country : c.region) ?? "—"}</TableCell>
                <TableCell>{c.currencyCode}</TableCell>
                <TableCell>{c.isActive ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                <TableCell className="text-right">
                  {c.isActive && <Button variant="ghost" size="sm" onClick={() => void handleDeactivate(c)}>Deactivate</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
