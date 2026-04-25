import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { createAuditLog } from "@/lib/workspace";
import { fetchUomConversions, upsertUomConversion, type UomConversion } from "@/lib/master-data";

interface FormState { id?: string; fromUom: string; toUom: string; factor: string; notes: string; isActive: boolean; }
const empty: FormState = { fromUom: "kg", toUom: "MT", factor: "0.001", notes: "", isActive: true };

export default function AdminUomConversions() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<UomConversion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!activeProfitCenter) return;
    setLoading(true);
    try { setRows(await fetchUomConversions(activeProfitCenter.id)); } finally { setLoading(false); }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id]);

  const openNew = () => { setForm(empty); setOpen(true); };
  const openEdit = (c: UomConversion) => {
    setForm({ id: c.id, fromUom: c.fromUom, toUom: c.toUom, factor: c.factor.toString(), notes: c.notes ?? "", isActive: c.isActive });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    const factor = Number(form.factor);
    if (!form.fromUom.trim() || !form.toUom.trim()) {
      toast({ title: "From and To unit are required", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(factor) || factor <= 0) {
      toast({ title: "Factor must be a positive number", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await upsertUomConversion({
        id: form.id,
        profitCenterId: activeProfitCenter.id,
        fromUom: form.fromUom,
        toUom: form.toUom,
        factor,
        notes: form.notes.trim() || null,
        isActive: form.isActive,
      });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "uom_conversion",
        action: form.id ? "uom_conversion.updated" : "uom_conversion.created",
        changeSummary: { from: form.fromUom, to: form.toUom, factor, profit_center_id: activeProfitCenter.id },
      });
      toast({ title: "Conversion saved" });
      setOpen(false);
      await load();
    } catch (error) {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>UOM & Conversion</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>UOM & Conversion — {activeProfitCenter.name}</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}>New conversion</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit conversion" : "New conversion"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>From</Label><Input value={form.fromUom} onChange={(e) => setForm({ ...form, fromUom: e.target.value })} /></div>
              <div><Label>To</Label><Input value={form.toUom} onChange={(e) => setForm({ ...form, toUom: e.target.value })} /></div>
              <div className="col-span-2"><Label>Factor (1 From = factor × To)</Label><Input type="number" step="0.000001" value={form.factor} onChange={(e) => setForm({ ...form, factor: e.target.value })} /></div>
              <div className="col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="col-span-2 flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
                <span>Active</span>
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Factor</TableHead><TableHead>Notes</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={6} className="text-muted-foreground">Loading…</TableCell></TableRow>}
            {!loading && rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.fromUom}</TableCell>
                <TableCell>{c.toUom}</TableCell>
                <TableCell>{c.factor}</TableCell>
                <TableCell>{c.notes ?? "—"}</TableCell>
                <TableCell>{c.isActive ? "Yes" : "No"}</TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(c)}>Edit</Button></TableCell>
              </TableRow>
            ))}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No conversions yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
