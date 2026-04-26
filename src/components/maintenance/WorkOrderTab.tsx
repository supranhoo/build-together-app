/**
 * Work Orders — create and progress through status lifecycle.
 */
import { useEffect, useState } from "react";
import { Plus, ClipboardList } from "lucide-react";
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
  fetchWorkOrders, fetchEquipment, createWorkOrder, updateWorkOrderStatus,
  type WorkOrder, type Equipment, type WorkOrderType, type WorkOrderStatus, type Priority,
} from "@/lib/maintenance";

const STATUS_VARIANT: Record<WorkOrderStatus, string> = {
  open: "bg-slate-100 text-slate-700",
  assigned: "bg-blue-50 text-blue-700",
  in_progress: "bg-amber-50 text-amber-700",
  on_hold: "bg-orange-50 text-orange-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
};
const PRI_VARIANT: Record<Priority, string> = {
  low: "bg-slate-100", medium: "bg-blue-50 text-blue-700",
  high: "bg-amber-50 text-amber-700", urgent: "bg-red-50 text-red-700",
};

export function WorkOrderTab({ profitCenterId }: { profitCenterId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<WorkOrder[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    woType: "preventive" as WorkOrderType, priority: "medium" as Priority,
    equipmentId: "", title: "", description: "", scheduledDate: "",
    assignedTo: "", estimatedCost: "", notes: "",
  });

  const load = async () => {
    const [wo, eq] = await Promise.all([fetchWorkOrders(profitCenterId), fetchEquipment(profitCenterId)]);
    setItems(wo); setEquipment(eq);
  };
  useEffect(() => { load(); }, [profitCenterId]);

  const submit = async () => {
    if (!user) return;
    if (!form.title) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createWorkOrder({
        profitCenterId, createdBy: user.id,
        woType: form.woType, priority: form.priority,
        equipmentId: form.equipmentId || null, title: form.title,
        description: form.description || null,
        scheduledDate: form.scheduledDate || null,
        assignedTo: form.assignedTo || null,
        estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : null,
        notes: form.notes || null,
      });
      toast({ title: "Work order created" });
      setOpen(false);
      setForm({ woType: "preventive", priority: "medium", equipmentId: "", title: "", description: "", scheduledDate: "", assignedTo: "", estimatedCost: "", notes: "" });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const advance = async (id: string, status: WorkOrderStatus) => {
    try {
      await updateWorkOrderStatus(id, status);
      toast({ title: `Status → ${status}` });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Work Orders</CardTitle>
          <CardDescription>Plan, assign and track maintenance work.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New Work Order</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Create Work Order</DialogTitle></DialogHeader>
            <div className="grid gap-4 md:grid-cols-2 py-2">
              <div><Label>Type *</Label>
                <Select value={form.woType} onValueChange={(v) => setForm({ ...form, woType: v as WorkOrderType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preventive">Preventive</SelectItem><SelectItem value="breakdown">Breakdown</SelectItem>
                    <SelectItem value="corrective">Corrective</SelectItem><SelectItem value="inspection">Inspection</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as Priority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2"><Label>Equipment</Label>
                <Select value={form.equipmentId} onValueChange={(v) => setForm({ ...form, equipmentId: v })}>
                  <SelectTrigger><SelectValue placeholder="Optional…" /></SelectTrigger>
                  <SelectContent>{equipment.map((e) => <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2"><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>Scheduled Date</Label><Input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} /></div>
              <div><Label>Assigned To</Label><Input value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} /></div>
              <div><Label>Estimated Cost (₹)</Label><Input type="number" value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No work orders yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>WO #</TableHead><TableHead>Type</TableHead><TableHead>Title</TableHead>
                <TableHead>Equipment</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-mono text-xs">{w.woNumber}</TableCell>
                  <TableCell><Badge variant="outline">{w.woType}</Badge></TableCell>
                  <TableCell className="font-medium max-w-xs truncate">{w.title}</TableCell>
                  <TableCell>{w.equipmentName ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={PRI_VARIANT[w.priority]}>{w.priority}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_VARIANT[w.status]}>{w.status}</Badge></TableCell>
                  <TableCell>
                    <Select value={w.status} onValueChange={(v) => advance(w.id, v as WorkOrderStatus)}>
                      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem><SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="on_hold">On Hold</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
