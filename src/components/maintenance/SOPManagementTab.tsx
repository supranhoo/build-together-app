/**
 * SOP Management — standard operating procedures library.
 */
import { useEffect, useState } from "react";
import { Plus, FileCheck, ExternalLink } from "lucide-react";
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
import { fetchSOPs, fetchEquipment, createSOP, type SOP, type Equipment } from "@/lib/maintenance";

export function SOPManagementTab({ profitCenterId }: { profitCenterId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<SOP[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "", version: "1.0", equipmentType: "", equipmentId: "",
    description: "", fileUrl: "", effectiveDate: "", reviewDate: "",
  });

  const load = async () => {
    const [s, eq] = await Promise.all([fetchSOPs(profitCenterId), fetchEquipment(profitCenterId)]);
    setItems(s); setEquipment(eq);
  };
  useEffect(() => { load(); }, [profitCenterId]);

  const submit = async () => {
    if (!user) return;
    if (!form.title) { toast({ title: "Title required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await createSOP({
        profitCenterId, createdBy: user.id,
        title: form.title, version: form.version,
        equipmentType: form.equipmentType || null,
        equipmentId: form.equipmentId || null,
        description: form.description || null,
        fileUrl: form.fileUrl || null,
        effectiveDate: form.effectiveDate || null,
        reviewDate: form.reviewDate || null,
      });
      toast({ title: "SOP added" });
      setOpen(false);
      setForm({ title: "", version: "1.0", equipmentType: "", equipmentId: "", description: "", fileUrl: "", effectiveDate: "", reviewDate: "" });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><FileCheck className="h-5 w-5" /> SOP Management</CardTitle>
          <CardDescription>Standard operating procedures linked to equipment.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New SOP</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Add SOP</DialogTitle></DialogHeader>
            <div className="grid gap-4 md:grid-cols-2 py-2">
              <div className="md:col-span-2"><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>Version</Label><Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} /></div>
              <div><Label>Equipment Type</Label><Input value={form.equipmentType} onChange={(e) => setForm({ ...form, equipmentType: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Specific Equipment (optional)</Label>
                <Select value={form.equipmentId} onValueChange={(v) => setForm({ ...form, equipmentId: v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>{equipment.map((e) => <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Effective Date</Label><Input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} /></div>
              <div><Label>Review Date</Label><Input type="date" value={form.reviewDate} onChange={(e) => setForm({ ...form, reviewDate: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Document URL</Label><Input value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} placeholder="https://…" /></div>
              <div className="md:col-span-2"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
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
          <p className="text-sm text-muted-foreground py-8 text-center">No SOPs yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SOP No.</TableHead><TableHead>Title</TableHead><TableHead>Version</TableHead>
                <TableHead>Equipment Type</TableHead><TableHead>Effective</TableHead><TableHead>Doc</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.sopNumber}</TableCell>
                  <TableCell className="font-medium">{s.title}</TableCell>
                  <TableCell><Badge variant="outline">v{s.version}</Badge></TableCell>
                  <TableCell>{s.equipmentType ?? "—"}</TableCell>
                  <TableCell>{s.effectiveDate ? new Date(s.effectiveDate).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>{s.fileUrl ? <a href={s.fileUrl} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" /> Open</a> : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
