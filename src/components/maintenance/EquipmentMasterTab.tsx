/**
 * Equipment Master — list + create equipment.
 */
import { useEffect, useState } from "react";
import { Plus, Settings } from "lucide-react";
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
import { fetchEquipment, createEquipment, type Equipment, type Criticality, type EquipmentStatus } from "@/lib/maintenance";

const STATUS_VARIANT: Record<EquipmentStatus, string> = {
  operational: "bg-emerald-50 text-emerald-700 border-emerald-200",
  maintenance: "bg-amber-50 text-amber-700 border-amber-200",
  breakdown: "bg-red-50 text-red-700 border-red-200",
  retired: "bg-slate-100 text-slate-700 border-slate-200",
};

const CRIT_VARIANT: Record<Criticality, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-50 text-blue-700",
  high: "bg-amber-50 text-amber-700",
  critical: "bg-red-50 text-red-700",
};

export function EquipmentMasterTab({ profitCenterId }: { profitCenterId: string }) {
  const { session } = useAuth();
  const user = session?.user;
  const { toast } = useToast();
  const [items, setItems] = useState<Equipment[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", equipmentType: "", criticality: "medium" as Criticality,
    location: "", manufacturer: "", modelNo: "", capacity: "",
    status: "operational" as EquipmentStatus, notes: "",
  });

  const load = async () => setItems(await fetchEquipment(profitCenterId));
  useEffect(() => { load(); }, [profitCenterId]);

  const submit = async () => {
    if (!user) return;
    if (!form.name || !form.equipmentType) {
      toast({ title: "Required fields", description: "Name and type are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createEquipment({ ...form, profitCenterId, createdBy: user.id });
      toast({ title: "Equipment added" });
      setOpen(false);
      setForm({ name: "", equipmentType: "", criticality: "medium", location: "", manufacturer: "", modelNo: "", capacity: "", status: "operational", notes: "" });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> Equipment Master</CardTitle>
          <CardDescription>Catalog of plant equipment, machines and assets.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> New Equipment</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Add Equipment</DialogTitle></DialogHeader>
            <div className="grid gap-4 md:grid-cols-2 py-2">
              <div className="md:col-span-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Equipment Type *</Label><Input placeholder="e.g. Furnace, Crane, Pump" value={form.equipmentType} onChange={(e) => setForm({ ...form, equipmentType: e.target.value })} /></div>
              <div><Label>Criticality</Label>
                <Select value={form.criticality} onValueChange={(v) => setForm({ ...form, criticality: v as Criticality })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as EquipmentStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operational">Operational</SelectItem><SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="breakdown">Breakdown</SelectItem><SelectItem value="retired">Retired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
              <div><Label>Capacity</Label><Input value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></div>
              <div><Label>Manufacturer</Label><Input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></div>
              <div><Label>Model No</Label><Input value={form.modelNo} onChange={(e) => setForm({ ...form, modelNo: e.target.value })} /></div>
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
          <p className="text-sm text-muted-foreground py-8 text-center">No equipment yet. Add your first asset above.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead>
                <TableHead>Criticality</TableHead><TableHead>Status</TableHead><TableHead>Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{e.code}</TableCell>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>{e.equipmentType}</TableCell>
                  <TableCell><Badge variant="outline" className={CRIT_VARIANT[e.criticality]}>{e.criticality}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_VARIANT[e.status]}>{e.status}</Badge></TableCell>
                  <TableCell>{e.location ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
