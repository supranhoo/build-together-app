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
import { fetchMaterialGroups, upsertMaterialGroup, type MaterialGroup } from "@/lib/master-data";

interface FormState { id?: string; parentGroup: string; subgroup: string; description: string; isActive: boolean; }
const empty: FormState = { parentGroup: "", subgroup: "", description: "", isActive: true };

export default function AdminMaterialGroups() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<MaterialGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!activeProfitCenter) return;
    setLoading(true);
    try { setRows(await fetchMaterialGroups(activeProfitCenter.id)); } finally { setLoading(false); }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id]);

  const openNew = () => { setForm(empty); setOpen(true); };
  const openEdit = (g: MaterialGroup) => {
    setForm({ id: g.id, parentGroup: g.parentGroup, subgroup: g.subgroup ?? "", description: g.description ?? "", isActive: g.isActive });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (!form.parentGroup.trim()) {
      toast({ title: "Parent group is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await upsertMaterialGroup({
        id: form.id,
        profitCenterId: activeProfitCenter.id,
        parentGroup: form.parentGroup.trim(),
        subgroup: form.subgroup.trim() || null,
        description: form.description.trim() || null,
        isActive: form.isActive,
      });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "material_group",
        action: form.id ? "material_group.updated" : "material_group.created",
        changeSummary: { parent: form.parentGroup, subgroup: form.subgroup, profit_center_id: activeProfitCenter.id },
      });
      toast({ title: "Group saved" });
      setOpen(false);
      await load();
    } catch (error) {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>Group & Hierarchy</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Group & Hierarchy — {activeProfitCenter.name}</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}>New group</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit group" : "New group"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Parent group</Label><Input value={form.parentGroup} onChange={(e) => setForm({ ...form, parentGroup: e.target.value })} /></div>
              <div><Label>Subgroup (optional)</Label><Input value={form.subgroup} onChange={(e) => setForm({ ...form, subgroup: e.target.value })} /></div>
              <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
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
            <TableRow><TableHead>Parent</TableHead><TableHead>Subgroup</TableHead><TableHead>Description</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={5} className="text-muted-foreground">Loading…</TableCell></TableRow>}
            {!loading && rows.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-medium">{g.parentGroup}</TableCell>
                <TableCell>{g.subgroup ?? "—"}</TableCell>
                <TableCell>{g.description ?? "—"}</TableCell>
                <TableCell>{g.isActive ? "Yes" : "No"}</TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(g)}>Edit</Button></TableCell>
              </TableRow>
            ))}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No groups defined yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
