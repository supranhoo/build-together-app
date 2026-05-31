import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { fetchMaterials, upsertMaterial, type Material } from "@/lib/inventory";
import { createAuditLog } from "@/lib/workspace";
import { ProfitCenterSelectField } from "@/components/ProfitCenterSelectField";

interface FormState { id?: string; profitCenterId: string; code: string; name: string; category: string; uom: string; isActive: boolean; }
const empty: FormState = { profitCenterId: "", code: "", name: "", category: "raw", uom: "MT", isActive: true };

const CATEGORIES = ["raw", "consumable", "finished"];
const UOMS = ["kg", "MT", "litre", "piece"];

export default function AdminMaterials() {
  const { activeProfitCenter, selectProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!activeProfitCenter) return;
    setMaterials(await fetchMaterials(activeProfitCenter.id));
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id]);

  const openNew = () => { setForm({ ...empty, profitCenterId: activeProfitCenter?.id ?? "" }); setOpen(true); };
  const openEdit = (m: Material) => {
    setForm({ id: m.id, profitCenterId: m.profitCenterId ?? activeProfitCenter?.id ?? "", code: m.code, name: m.name, category: m.category, uom: m.uom, isActive: m.isActive });
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
      await upsertMaterial({
        id: form.id,
        profitCenterId: form.profitCenterId,
        code: form.code,
        name: form.name,
        category: form.category,
        uom: form.uom,
        isActive: form.isActive,
      });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: form.profitCenterId,
        entityType: "material",
        action: form.id ? "material.updated" : "material.created",
        changeSummary: { code: form.code, name: form.name, category: form.category, uom: form.uom, profit_center_id: form.profitCenterId },
      });
      const targetPcId = form.profitCenterId;
      const isCrossWorkspace = targetPcId !== activeProfitCenter.id;
      toast({
        title: "Material saved",
        description: isCrossWorkspace ? "Switched workspace to show the new record." : undefined,
      });
      setOpen(false);
      if (isCrossWorkspace) {
        selectProfitCenter(targetPcId);
      } else {
        await load();
      }
    } catch (error) {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>Materials</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Materials — {activeProfitCenter.name}</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}>New material</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit material" : "New material"}</DialogTitle></DialogHeader>
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
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unit of measure</Label>
                <Select value={form.uom} onValueChange={(v) => setForm({ ...form, uom: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UOMS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
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
            <TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>UOM</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {materials.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.code}</TableCell>
                <TableCell>{m.name}</TableCell>
                <TableCell>{m.category}</TableCell>
                <TableCell>{m.uom}</TableCell>
                <TableCell>{m.isActive ? "Yes" : "No"}</TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(m)}>Edit</Button></TableCell>
              </TableRow>
            ))}
            {materials.length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No materials yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
