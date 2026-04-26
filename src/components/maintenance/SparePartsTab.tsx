/**
 * Spare Parts — maintenance-specific spare catalog with min-stock alerts.
 */
import { useEffect, useState } from "react";
import { Plus, Package } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { fetchSpares, createSpare, type Spare } from "@/lib/maintenance";

export function SparePartsTab({ profitCenterId }: { profitCenterId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Spare[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: "", name: "", category: "", uom: "nos",
    currentStock: "0", minStock: "0", unitCost: "", supplier: "", location: "", notes: "",
  });

  const load = async () => setItems(await fetchSpares(profitCenterId));
  useEffect(() => { load(); }, [profitCenterId]);

  const submit = async () => {
    if (!user) return;
    if (!form.code || !form.name) {
      toast({ title: "Required", description: "Code and name required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createSpare({
        profitCenterId, createdBy: user.id,
        code: form.code, name: form.name, category: form.category || null,
        uom: form.uom, currentStock: Number(form.currentStock || 0),
        minStock: Number(form.minStock || 0),
        unitCost: form.unitCost ? Number(form.unitCost) : null,
        supplier: form.supplier || null, location: form.location || null,
        notes: form.notes || null,
      });
      toast({ title: "Spare added" });
      setOpen(false);
      setForm({ code: "", name: "", category: "", uom: "nos", currentStock: "0", minStock: "0", unitCost: "", supplier: "", location: "", notes: "" });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Spare Parts Catalog</CardTitle>
          <CardDescription>Maintenance-specific spares with min-stock alerts.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New Spare</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Add Spare Part</DialogTitle></DialogHeader>
            <div className="grid gap-4 md:grid-cols-2 py-2">
              <div><Label>Code *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
              <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="bearing, belt, filter…" /></div>
              <div><Label>UOM</Label><Input value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} /></div>
              <div><Label>Current Stock</Label><Input type="number" step="0.01" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} /></div>
              <div><Label>Min Stock</Label><Input type="number" step="0.01" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} /></div>
              <div><Label>Unit Cost (₹)</Label><Input type="number" step="0.01" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} /></div>
              <div><Label>Supplier</Label><Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No spare parts yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead>
                <TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Min</TableHead>
                <TableHead className="text-right">Unit ₹</TableHead><TableHead>Supplier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => {
                const low = s.currentStock <= s.minStock;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.code}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.category ?? "—"}</TableCell>
                    <TableCell className={`text-right ${low ? "text-red-600 font-medium" : ""}`}>
                      {s.currentStock} {s.uom} {low && <Badge variant="destructive" className="ml-1">low</Badge>}
                    </TableCell>
                    <TableCell className="text-right">{s.minStock}</TableCell>
                    <TableCell className="text-right">{s.unitCost !== null ? `₹${s.unitCost.toLocaleString()}` : "—"}</TableCell>
                    <TableCell>{s.supplier ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
