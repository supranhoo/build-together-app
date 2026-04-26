/**
 * Condition Monitoring — record vibration/temperature/oil readings with thresholds.
 */
import { useEffect, useState } from "react";
import { Plus, Activity } from "lucide-react";
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
import { fetchConditionReadings, fetchEquipment, createConditionReading, type ConditionReading, type Equipment, type ConditionStatus } from "@/lib/maintenance";

const STATUS_VARIANT: Record<ConditionStatus, string> = {
  normal: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  critical: "bg-red-50 text-red-700 border-red-200",
};

export function ConditionMonitoringTab({ profitCenterId }: { profitCenterId: string }) {
  const { session } = useAuth();
  const user = session?.user;
  const { toast } = useToast();
  const [items, setItems] = useState<ConditionReading[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    equipmentId: "", parameter: "Vibration", readingValue: "", unit: "mm/s",
    thresholdWarning: "", thresholdCritical: "", recordedBy: "", notes: "",
  });

  const load = async () => {
    const [r, eq] = await Promise.all([fetchConditionReadings(profitCenterId), fetchEquipment(profitCenterId)]);
    setItems(r); setEquipment(eq);
  };
  useEffect(() => { load(); }, [profitCenterId]);

  const submit = async () => {
    if (!user) return;
    if (!form.equipmentId || !form.parameter || form.readingValue === "") {
      toast({ title: "Required fields missing", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createConditionReading({
        profitCenterId, createdBy: user.id,
        equipmentId: form.equipmentId, parameter: form.parameter,
        readingValue: Number(form.readingValue), unit: form.unit || null,
        thresholdWarning: form.thresholdWarning ? Number(form.thresholdWarning) : null,
        thresholdCritical: form.thresholdCritical ? Number(form.thresholdCritical) : null,
        recordedBy: form.recordedBy || null, notes: form.notes || null,
      });
      toast({ title: "Reading saved" });
      setOpen(false);
      setForm({ equipmentId: "", parameter: "Vibration", readingValue: "", unit: "mm/s", thresholdWarning: "", thresholdCritical: "", recordedBy: "", notes: "" });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Condition Monitoring</CardTitle>
          <CardDescription>Track equipment-health parameters with threshold-based status.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New Reading</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Record Reading</DialogTitle></DialogHeader>
            <div className="grid gap-4 md:grid-cols-2 py-2">
              <div className="md:col-span-2"><Label>Equipment *</Label>
                <Select value={form.equipmentId} onValueChange={(v) => setForm({ ...form, equipmentId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{equipment.map((e) => <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Parameter *</Label><Input value={form.parameter} onChange={(e) => setForm({ ...form, parameter: e.target.value })} /></div>
              <div><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
              <div><Label>Reading Value *</Label><Input type="number" step="0.001" value={form.readingValue} onChange={(e) => setForm({ ...form, readingValue: e.target.value })} /></div>
              <div><Label>Recorded By</Label><Input value={form.recordedBy} onChange={(e) => setForm({ ...form, recordedBy: e.target.value })} /></div>
              <div><Label>Warning Threshold</Label><Input type="number" step="0.001" value={form.thresholdWarning} onChange={(e) => setForm({ ...form, thresholdWarning: e.target.value })} /></div>
              <div><Label>Critical Threshold</Label><Input type="number" step="0.001" value={form.thresholdCritical} onChange={(e) => setForm({ ...form, thresholdCritical: e.target.value })} /></div>
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
          <p className="text-sm text-muted-foreground py-8 text-center">No readings yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead><TableHead>Equipment</TableHead><TableHead>Parameter</TableHead>
                <TableHead className="text-right">Value</TableHead><TableHead>Unit</TableHead>
                <TableHead>Status</TableHead><TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{new Date(r.readingAt).toLocaleString()}</TableCell>
                  <TableCell>{r.equipmentName ?? "—"}</TableCell>
                  <TableCell>{r.parameter}</TableCell>
                  <TableCell className="text-right font-mono">{r.readingValue}</TableCell>
                  <TableCell>{r.unit ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_VARIANT[r.status]}>{r.status}</Badge></TableCell>
                  <TableCell>{r.recordedBy ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
