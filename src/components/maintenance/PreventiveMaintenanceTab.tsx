/**
 * Preventive Maintenance — schedule recurring tasks.
 */
import { useEffect, useState } from "react";
import { Plus, Calendar } from "lucide-react";
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
import {
  fetchPMSchedules, fetchEquipment, createPMSchedule,
  type PMSchedule, type Equipment, type PMFrequency,
} from "@/lib/maintenance";

export function PreventiveMaintenanceTab({ profitCenterId }: { profitCenterId: string }) {
  const { session } = useAuth();
  const user = session?.user;
  const { toast } = useToast();
  const [items, setItems] = useState<PMSchedule[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    equipmentId: "", taskName: "", frequency: "monthly" as PMFrequency,
    estimatedHours: "", nextDue: "", assignedTo: "", notes: "",
  });

  const load = async () => {
    const [pm, eq] = await Promise.all([fetchPMSchedules(profitCenterId), fetchEquipment(profitCenterId)]);
    setItems(pm); setEquipment(eq);
  };
  useEffect(() => { load(); }, [profitCenterId]);

  const submit = async () => {
    if (!user) return;
    if (!form.equipmentId || !form.taskName || !form.nextDue) {
      toast({ title: "Required fields", description: "Equipment, task name and next-due are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createPMSchedule({
        profitCenterId, createdBy: user.id,
        equipmentId: form.equipmentId, taskName: form.taskName,
        frequency: form.frequency, nextDue: form.nextDue,
        estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : null,
        assignedTo: form.assignedTo || null, notes: form.notes || null,
      });
      toast({ title: "PM schedule added" });
      setOpen(false);
      setForm({ equipmentId: "", taskName: "", frequency: "monthly", estimatedHours: "", nextDue: "", assignedTo: "", notes: "" });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" /> Preventive Maintenance Schedules</CardTitle>
          <CardDescription>Plan and track recurring maintenance tasks.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New PM Schedule</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Add PM Schedule</DialogTitle></DialogHeader>
            <div className="grid gap-4 md:grid-cols-2 py-2">
              <div className="md:col-span-2"><Label>Equipment *</Label>
                <Select value={form.equipmentId} onValueChange={(v) => setForm({ ...form, equipmentId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select equipment…" /></SelectTrigger>
                  <SelectContent>
                    {equipment.map((e) => <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2"><Label>Task Name *</Label><Input value={form.taskName} onChange={(e) => setForm({ ...form, taskName: e.target.value })} placeholder="e.g. Oil change, Vibration check" /></div>
              <div><Label>Frequency *</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v as PMFrequency })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="half_yearly">Half-yearly</SelectItem><SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Next Due *</Label><Input type="date" value={form.nextDue} onChange={(e) => setForm({ ...form, nextDue: e.target.value })} /></div>
              <div><Label>Estimated Hours</Label><Input type="number" step="0.5" value={form.estimatedHours} onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })} /></div>
              <div><Label>Assigned To</Label><Input value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} /></div>
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
          <p className="text-sm text-muted-foreground py-8 text-center">No PM schedules yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead><TableHead>Equipment</TableHead><TableHead>Frequency</TableHead>
                <TableHead>Last Done</TableHead><TableHead>Next Due</TableHead><TableHead>Assigned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => {
                const overdue = new Date(p.nextDue) < new Date();
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.taskName}</TableCell>
                    <TableCell>{p.equipmentName ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{p.frequency}</Badge></TableCell>
                    <TableCell>{p.lastDone ? new Date(p.lastDone).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className={overdue ? "text-red-600 font-medium" : ""}>
                      {new Date(p.nextDue).toLocaleDateString()} {overdue && <Badge variant="destructive" className="ml-1">overdue</Badge>}
                    </TableCell>
                    <TableCell>{p.assignedTo ?? "—"}</TableCell>
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
