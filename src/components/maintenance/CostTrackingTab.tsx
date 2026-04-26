/**
 * Cost Tracking — record maintenance expenditures by type.
 */
import { useEffect, useMemo, useState } from "react";
import { Plus, DollarSign } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { fetchCosts, fetchEquipment, createCost, type MaintenanceCost, type Equipment, type CostType } from "@/lib/maintenance";

const TYPE_VARIANT: Record<CostType, string> = {
  labor: "bg-blue-50 text-blue-700",
  parts: "bg-violet-50 text-violet-700",
  contractor: "bg-amber-50 text-amber-700",
  other: "bg-slate-100 text-slate-700",
};

export function CostTrackingTab({ profitCenterId }: { profitCenterId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<MaintenanceCost[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    costDate: new Date().toISOString().slice(0, 10),
    costType: "labor" as CostType, equipmentId: "",
    description: "", amount: "", vendor: "", invoiceNo: "", notes: "",
  });

  const load = async () => {
    const [c, eq] = await Promise.all([fetchCosts(profitCenterId), fetchEquipment(profitCenterId)]);
    setItems(c); setEquipment(eq);
  };
  useEffect(() => { load(); }, [profitCenterId]);

  const totals = useMemo(() => {
    const t: Record<CostType, number> = { labor: 0, parts: 0, contractor: 0, other: 0 };
    items.forEach((c) => { t[c.costType] += c.amount; });
    return t;
  }, [items]);
  const grand = totals.labor + totals.parts + totals.contractor + totals.other;

  const submit = async () => {
    if (!user) return;
    if (!form.costDate || !form.description || !form.amount) {
      toast({ title: "Required fields missing", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createCost({
        profitCenterId, createdBy: user.id,
        costDate: form.costDate, costType: form.costType,
        equipmentId: form.equipmentId || null,
        description: form.description, amount: Number(form.amount),
        vendor: form.vendor || null, invoiceNo: form.invoiceNo || null,
        notes: form.notes || null,
      });
      toast({ title: "Cost recorded" });
      setOpen(false);
      setForm({ costDate: new Date().toISOString().slice(0, 10), costType: "labor", equipmentId: "", description: "", amount: "", vendor: "", invoiceNo: "", notes: "" });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">
        <SummaryCard label="Labor" value={totals.labor} accent="border-l-blue-500" />
        <SummaryCard label="Parts" value={totals.parts} accent="border-l-violet-500" />
        <SummaryCard label="Contractor" value={totals.contractor} accent="border-l-amber-500" />
        <SummaryCard label="Other" value={totals.other} accent="border-l-slate-400" />
        <SummaryCard label="Total" value={grand} accent="border-l-emerald-500" bold />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" /> Cost Tracking</CardTitle>
            <CardDescription>Maintenance spend by category.</CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New Cost</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Record Cost</DialogTitle></DialogHeader>
              <div className="grid gap-4 md:grid-cols-2 py-2">
                <div><Label>Date *</Label><Input type="date" value={form.costDate} onChange={(e) => setForm({ ...form, costDate: e.target.value })} /></div>
                <div><Label>Type *</Label>
                  <Select value={form.costType} onValueChange={(v) => setForm({ ...form, costType: v as CostType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="labor">Labor</SelectItem><SelectItem value="parts">Parts</SelectItem>
                      <SelectItem value="contractor">Contractor</SelectItem><SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2"><Label>Equipment</Label>
                  <Select value={form.equipmentId} onValueChange={(v) => setForm({ ...form, equipmentId: v })}>
                    <SelectTrigger><SelectValue placeholder="Optional…" /></SelectTrigger>
                    <SelectContent>{equipment.map((e) => <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2"><Label>Description *</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div><Label>Amount (₹) *</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
                <div><Label>Vendor</Label><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
                <div><Label>Invoice No</Label><Input value={form.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} /></div>
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
            <p className="text-sm text-muted-foreground py-8 text-center">No cost entries yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Description</TableHead>
                  <TableHead>Equipment</TableHead><TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Amount (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{new Date(c.costDate).toLocaleDateString()}</TableCell>
                    <TableCell><Badge variant="outline" className={TYPE_VARIANT[c.costType]}>{c.costType}</Badge></TableCell>
                    <TableCell className="max-w-xs truncate">{c.description}</TableCell>
                    <TableCell>{c.equipmentName ?? "—"}</TableCell>
                    <TableCell>{c.vendor ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">₹{c.amount.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, accent, bold }: { label: string; value: number; accent: string; bold?: boolean }) {
  return (
    <Card className={`border-l-4 ${accent}`}>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`mt-1 ${bold ? "text-xl font-bold" : "text-lg font-semibold"}`}>₹{value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}
