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
import { fetchFurnaces, upsertFurnace, type Furnace } from "@/lib/production";
import { createAuditLog } from "@/lib/workspace";
import { ProfitCenterSelectField } from "@/components/ProfitCenterSelectField";

interface FormState { id?: string; profitCenterId: string; code: string; name: string; capacityMt: string; isActive: boolean; }
const empty: FormState = { profitCenterId: "", code: "", name: "", capacityMt: "", isActive: true };

export default function AdminFurnaces() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [furnaces, setFurnaces] = useState<Furnace[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!activeProfitCenter) return;
    setFurnaces(await fetchFurnaces(activeProfitCenter.id));
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id]);

  const openNew = () => { setForm({ ...empty, profitCenterId: activeProfitCenter?.id ?? "" }); setOpen(true); };
  const openEdit = (f: Furnace) => {
    setForm({ id: f.id, profitCenterId: f.profitCenterId ?? activeProfitCenter?.id ?? "", code: f.code, name: f.name, capacityMt: f.capacityMt?.toString() ?? "", isActive: f.isActive });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (!form.profitCenterId) {
      toast({ title: "Profit Center mapping is mandatory", variant: "destructive" });
      return;
    }
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: "Code and name are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await upsertFurnace({
        id: form.id,
        profitCenterId: form.profitCenterId,
        code: form.code,
        name: form.name,
        capacityMt: form.capacityMt ? Number(form.capacityMt) : null,
        isActive: form.isActive,
      });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: form.profitCenterId,
        entityType: "furnace",
        action: form.id ? "furnace.updated" : "furnace.created",
        changeSummary: { code: form.code, name: form.name, profit_center_id: form.profitCenterId },
      });
      toast({ title: "Furnace saved" });
      setOpen(false);
      await load();
    } catch (error) {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>Furnaces</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Furnaces — {activeProfitCenter.name}</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}>New furnace</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit furnace" : "New furnace"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <ProfitCenterSelectField
                value={form.profitCenterId}
                onChange={(v) => setForm({ ...form, profitCenterId: v })}
                disabled={Boolean(form.id)}
              />
              <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Capacity (MT)</Label><Input type="number" step="0.001" value={form.capacityMt} onChange={(e) => setForm({ ...form, capacityMt: e.target.value })} /></div>
              <div className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
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
            <TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Capacity (MT)</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {furnaces.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.code}</TableCell>
                <TableCell>{f.name}</TableCell>
                <TableCell>{f.capacityMt ?? "—"}</TableCell>
                <TableCell>{f.isActive ? "Yes" : "No"}</TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(f)}>Edit</Button></TableCell>
              </TableRow>
            ))}
            {furnaces.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No furnaces yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
