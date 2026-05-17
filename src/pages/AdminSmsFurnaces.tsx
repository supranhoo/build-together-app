import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  listSmsFurnaces,
  createSmsFurnace,
  updateSmsFurnace,
  validateFurnaceInput,
  type SmsFurnace,
  type SmsFurnaceType,
} from "@/lib/sms-production";
import { createAuditLog } from "@/lib/workspace";
import { resolveProcessProfile } from "@/lib/workspace-profiles";

// Admin master-data screen for SMS furnaces (EAF / LF / CCM).
// Gated to workspaces whose profile is `steel_melting`.

interface FormState {
  id?: string;
  code: string;
  name: string;
  furnaceType: SmsFurnaceType;
  capacityMt: string;
  powerRatingKw: string;
  isActive: boolean;
}

const empty: FormState = { code: "", name: "", furnaceType: "EAF", capacityMt: "", powerRatingKw: "", isActive: true };

export default function AdminSmsFurnaces() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<SmsFurnace[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const profile = resolveProcessProfile(activeProfitCenter?.processProfile);
  const isSms = profile === "steel_melting";

  const load = async () => {
    if (!activeProfitCenter || !isSms) return;
    setRows(await listSmsFurnaces(activeProfitCenter.id));
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id, isSms]);

  const openNew = () => { setForm(empty); setOpen(true); };
  const openEdit = (f: SmsFurnace) => {
    setForm({
      id: f.id,
      code: f.code,
      name: f.name,
      furnaceType: f.furnaceType,
      capacityMt: f.capacityMt?.toString() ?? "",
      powerRatingKw: f.powerRatingKw?.toString() ?? "",
      isActive: f.isActive,
    });
    setOpen(true);
  };

  const errors = useMemo(() => validateFurnaceInput({
    code: form.code,
    name: form.name,
    furnaceType: form.furnaceType,
    capacityMt: form.capacityMt ? Number(form.capacityMt) : null,
    powerRatingKw: form.powerRatingKw ? Number(form.powerRatingKw) : null,
  }), [form]);

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (errors.length) { toast({ title: errors[0].message, variant: "destructive" }); return; }
    setSaving(true);
    try {
      const capacity = form.capacityMt ? Number(form.capacityMt) : null;
      const power = form.powerRatingKw ? Number(form.powerRatingKw) : null;
      if (form.id) {
        await updateSmsFurnace(form.id, { code: form.code, name: form.name, furnaceType: form.furnaceType, capacityMt: capacity, powerRatingKw: power, isActive: form.isActive });
      } else {
        await createSmsFurnace({ profitCenterId: activeProfitCenter.id, code: form.code, name: form.name, furnaceType: form.furnaceType, capacityMt: capacity, powerRatingKw: power, isActive: form.isActive });
      }
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "sms_furnace",
        action: form.id ? "sms_furnace.updated" : "sms_furnace.created",
        changeSummary: { code: form.code, name: form.name, furnace_type: form.furnaceType, capacity_mt: capacity, power_rating_kw: power, is_active: form.isActive },
      });
      toast({ title: "Furnace saved" });
      setOpen(false);
      await load();
    } catch (error) {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>SMS Furnaces</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }
  if (!isSms) {
    return (
      <Card>
        <CardHeader><CardTitle>SMS Furnaces</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">
          SMS Furnaces are only available in Steel Melting workspaces. Active workspace profile: <span className="font-mono">{profile}</span>.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>SMS Furnaces — {activeProfitCenter.name}</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}>New furnace</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit furnace" : "New furnace"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="EAF-1" /></div>
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div>
                <Label>Type</Label>
                <Select value={form.furnaceType} onValueChange={(v) => setForm({ ...form, furnaceType: v as SmsFurnaceType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EAF">EAF — Electric Arc Furnace</SelectItem>
                    <SelectItem value="LF">LF — Ladle Furnace</SelectItem>
                    <SelectItem value="CCM">CCM — Continuous Casting Machine</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Capacity (MT / heat)</Label><Input type="number" step="0.01" value={form.capacityMt} onChange={(e) => setForm({ ...form, capacityMt: e.target.value })} /></div>
              <div><Label>Power rating (kW)</Label><Input type="number" step="0.01" value={form.powerRatingKw} onChange={(e) => setForm({ ...form, powerRatingKw: e.target.value })} /></div>
              <div className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
                <span>Active</span>
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              </div>
              {errors.length > 0 && (
                <ul className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  {errors.map((e) => <li key={e.field}>{e.message}</li>)}
                </ul>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleSave()} disabled={saving || errors.length > 0}>{saving ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Capacity MT</TableHead>
              <TableHead>Power kW</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">{f.code}</TableCell>
                <TableCell>{f.name}</TableCell>
                <TableCell>{f.furnaceType}</TableCell>
                <TableCell>{f.capacityMt ?? "—"}</TableCell>
                <TableCell>{f.powerRatingKw ?? "—"}</TableCell>
                <TableCell>{f.isActive ? "Yes" : "No"}</TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(f)}>Edit</Button></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">No furnaces yet. Create one to enable heat logging.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
