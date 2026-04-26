/**
 * Breakdown Maintenance — log breakdown incidents.
 */
import { useEffect, useState } from "react";
import { Plus, AlertTriangle } from "lucide-react";
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
import { fetchBreakdowns, fetchEquipment, createBreakdown, type Breakdown, type Equipment, type BreakdownSeverity } from "@/lib/maintenance";

const SEVERITY_VARIANT: Record<BreakdownSeverity, string> = {
  minor: "bg-blue-50 text-blue-700 border-blue-200",
  moderate: "bg-amber-50 text-amber-700 border-amber-200",
  major: "bg-orange-50 text-orange-700 border-orange-200",
  critical: "bg-red-50 text-red-700 border-red-200",
};

export function BreakdownMaintenanceTab({ profitCenterId }: { profitCenterId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Breakdown[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    equipmentId: "", severity: "minor" as BreakdownSeverity, symptom: "",
    rootCause: "", correctiveAction: "", reportedBy: "", notes: "",
  });

  const load = async () => {
    const [bd, eq] = await Promise.all([fetchBreakdowns(profitCenterId), fetchEquipment(profitCenterId)]);
    setItems(bd); setEquipment(eq);
  };
  useEffect(() => { load(); }, [profitCenterId]);

  const submit = async () => {
    if (!user) return;
    if (!form.equipmentId || !form.symptom) {
      toast({ title: "Required", description: "Equipment and symptom required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createBreakdown({ ...form, profitCenterId, createdBy: user.id,
        rootCause: form.rootCause || null, correctiveAction: form.correctiveAction || null,
        reportedBy: form.reportedBy || null, notes: form.notes || null });
      toast({ title: "Breakdown logged" });
      setOpen(false);
      setForm({ equipmentId: "", severity: "minor", symptom: "", rootCause: "", correctiveAction: "", reportedBy: "", notes: "" });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Breakdown Reports</CardTitle>
          <CardDescription>Log unplanned equipment failures and root causes.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Log Breakdown</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Report Breakdown</DialogTitle></DialogHeader>
            <div className="grid gap-4 md:grid-cols-2 py-2">
              <div className="md:col-span-2"><Label>Equipment *</Label>
                <Select value={form.equipmentId} onValueChange={(v) => setForm({ ...form, equipmentId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{equipment.map((e) => <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v as BreakdownSeverity })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minor">Minor</SelectItem><SelectItem value="moderate">Moderate</SelectItem>
                    <SelectItem value="major">Major</SelectItem><SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Reported By</Label><Input value={form.reportedBy} onChange={(e) => setForm({ ...form, reportedBy: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Symptom *</Label><Textarea rows={2} value={form.symptom} onChange={(e) => setForm({ ...form, symptom: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Root Cause</Label><Textarea rows={2} value={form.rootCause} onChange={(e) => setForm({ ...form, rootCause: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Corrective Action</Label><Textarea rows={2} value={form.correctiveAction} onChange={(e) => setForm({ ...form, correctiveAction: e.target.value })} /></div>
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
          <p className="text-sm text-muted-foreground py-8 text-center">No breakdowns logged.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>BD No.</TableHead><TableHead>Equipment</TableHead><TableHead>Occurred</TableHead>
                <TableHead>Severity</TableHead><TableHead>Symptom</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">{b.breakdownNo}</TableCell>
                  <TableCell>{b.equipmentName ?? "—"}</TableCell>
                  <TableCell>{new Date(b.occurredAt).toLocaleString()}</TableCell>
                  <TableCell><Badge variant="outline" className={SEVERITY_VARIANT[b.severity]}>{b.severity}</Badge></TableCell>
                  <TableCell className="max-w-xs truncate">{b.symptom}</TableCell>
                  <TableCell>{b.resolvedAt ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Resolved</Badge> : <Badge variant="destructive">Open</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
