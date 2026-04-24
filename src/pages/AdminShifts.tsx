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
import { fetchShifts, upsertShift, type Shift } from "@/lib/production";
import { createAuditLog } from "@/lib/workspace";
import { ProfitCenterSelectField } from "@/components/ProfitCenterSelectField";

interface FormState { id?: string; profitCenterId: string; code: string; name: string; startTime: string; endTime: string; sortOrder: string; isActive: boolean; }
const empty: FormState = { profitCenterId: "", code: "", name: "", startTime: "06:00", endTime: "14:00", sortOrder: "0", isActive: true };

export default function AdminShifts() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!activeProfitCenter) return;
    setShifts(await fetchShifts(activeProfitCenter.id));
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id]);

  const openNew = () => { setForm({ ...empty, profitCenterId: activeProfitCenter?.id ?? "" }); setOpen(true); };
  const openEdit = (s: Shift) => {
    setForm({ id: s.id, profitCenterId: s.profitCenterId ?? activeProfitCenter?.id ?? "", code: s.code, name: s.name, startTime: s.startTime.slice(0, 5), endTime: s.endTime.slice(0, 5), sortOrder: s.sortOrder.toString(), isActive: s.isActive });
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
      await upsertShift({
        id: form.id,
        profitCenterId: form.profitCenterId,
        code: form.code,
        name: form.name,
        startTime: form.startTime,
        endTime: form.endTime,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: form.profitCenterId,
        entityType: "shift",
        action: form.id ? "shift.updated" : "shift.created",
        changeSummary: { code: form.code, name: form.name, profit_center_id: form.profitCenterId },
      });
      toast({ title: "Shift saved" });
      setOpen(false);
      await load();
    } catch (error) {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>Shifts</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Shifts — {activeProfitCenter.name}</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}>New shift</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit shift" : "New shift"}</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <ProfitCenterSelectField
                  value={form.profitCenterId}
                  onChange={(v) => setForm({ ...form, profitCenterId: v })}
                  disabled={Boolean(form.id)}
                />
              </div>
              <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Start time</Label><Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></div>
              <div><Label>End time</Label><Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div>
              <div><Label>Sort order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></div>
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
            <TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {shifts.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.code}</TableCell>
                <TableCell>{s.name}</TableCell>
                <TableCell>{s.startTime.slice(0, 5)}</TableCell>
                <TableCell>{s.endTime.slice(0, 5)}</TableCell>
                <TableCell>{s.isActive ? "Yes" : "No"}</TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(s)}>Edit</Button></TableCell>
              </TableRow>
            ))}
            {shifts.length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No shifts yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
