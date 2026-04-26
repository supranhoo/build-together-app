/**
 * Downtime Tracking — start/end times, planned/unplanned, production loss.
 */
import { useEffect, useState } from "react";
import { Plus, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { fetchDowntime, fetchEquipment, createDowntime, type Downtime, type Equipment } from "@/lib/maintenance";

const REASONS = ["mechanical", "electrical", "hydraulic", "operator", "material_shortage", "power_failure", "planned_pm", "other"];

export function DowntimeTrackingTab({ profitCenterId }: { profitCenterId: string }) {
  const { session } = useAuth();
  const user = session?.user;
  const { toast } = useToast();
  const [items, setItems] = useState<Downtime[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    equipmentId: "", startTime: "", endTime: "", reasonCategory: "mechanical",
    reasonDetail: "", productionLossMt: "", isPlanned: false, notes: "",
  });

  const load = async () => {
    const [dt, eq] = await Promise.all([fetchDowntime(profitCenterId), fetchEquipment(profitCenterId)]);
    setItems(dt); setEquipment(eq);
  };
  useEffect(() => { load(); }, [profitCenterId]);

  const submit = async () => {
    if (!user) return;
    if (!form.equipmentId || !form.startTime || !form.reasonCategory) {
      toast({ title: "Required fields missing", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createDowntime({
        profitCenterId, createdBy: user.id,
        equipmentId: form.equipmentId,
        startTime: new Date(form.startTime).toISOString(),
        endTime: form.endTime ? new Date(form.endTime).toISOString() : null,
        reasonCategory: form.reasonCategory,
        reasonDetail: form.reasonDetail || null,
        productionLossMt: form.productionLossMt ? Number(form.productionLossMt) : null,
        isPlanned: form.isPlanned, notes: form.notes || null,
      });
      toast({ title: "Downtime logged" });
      setOpen(false);
      setForm({ equipmentId: "", startTime: "", endTime: "", reasonCategory: "mechanical", reasonDetail: "", productionLossMt: "", isPlanned: false, notes: "" });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Downtime Tracking</CardTitle>
          <CardDescription>Planned and unplanned equipment downtime with production-loss impact.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Log Downtime</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Record Downtime</DialogTitle></DialogHeader>
            <div className="grid gap-4 md:grid-cols-2 py-2">
              <div className="md:col-span-2"><Label>Equipment *</Label>
                <Select value={form.equipmentId} onValueChange={(v) => setForm({ ...form, equipmentId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{equipment.map((e) => <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Start *</Label><Input type="datetime-local" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></div>
              <div><Label>End</Label><Input type="datetime-local" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div>
              <div><Label>Reason Category *</Label>
                <Select value={form.reasonCategory} onValueChange={(v) => setForm({ ...form, reasonCategory: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Production Loss (MT)</Label><Input type="number" step="0.01" value={form.productionLossMt} onChange={(e) => setForm({ ...form, productionLossMt: e.target.value })} /></div>
              <div className="flex items-center gap-2 md:col-span-2">
                <Switch checked={form.isPlanned} onCheckedChange={(v) => setForm({ ...form, isPlanned: v })} />
                <Label>Planned downtime</Label>
              </div>
              <div className="md:col-span-2"><Label>Reason Detail</Label><Textarea rows={2} value={form.reasonDetail} onChange={(e) => setForm({ ...form, reasonDetail: e.target.value })} /></div>
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
          <p className="text-sm text-muted-foreground py-8 text-center">No downtime entries yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipment</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead>
                <TableHead className="text-right">Mins</TableHead><TableHead>Reason</TableHead>
                <TableHead className="text-right">Loss MT</TableHead><TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{d.equipmentName ?? "—"}</TableCell>
                  <TableCell>{new Date(d.startTime).toLocaleString()}</TableCell>
                  <TableCell>{d.endTime ? new Date(d.endTime).toLocaleString() : <Badge variant="destructive">Ongoing</Badge>}</TableCell>
                  <TableCell className="text-right">{d.durationMinutes ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{d.reasonCategory}</Badge></TableCell>
                  <TableCell className="text-right">{d.productionLossMt ?? "—"}</TableCell>
                  <TableCell>{d.isPlanned ? <Badge variant="outline" className="bg-blue-50 text-blue-700">Planned</Badge> : <Badge variant="outline" className="bg-amber-50 text-amber-700">Unplanned</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
