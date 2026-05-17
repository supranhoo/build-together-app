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
  listCppUnits,
  createCppUnit,
  updateCppUnit,
  validateUnitInput,
  type CppUnit,
  type CppUnitType,
} from "@/lib/cpp-production";
import { createAuditLog } from "@/lib/workspace";
import { resolveProcessProfile } from "@/lib/workspace-profiles";

// Admin master-data screen for CPP units (Boiler / Turbine / Generator).
// Gated to workspaces whose profile is `power`.

interface FormState {
  id?: string;
  code: string;
  name: string;
  unitType: CppUnitType;
  capacityMw: string;
  heatRateKcalPerKwh: string;
  isActive: boolean;
}

const empty: FormState = { code: "", name: "", unitType: "GENERATOR", capacityMw: "", heatRateKcalPerKwh: "", isActive: true };

export default function AdminCppUnits() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<CppUnit[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const profile = resolveProcessProfile(activeProfitCenter?.processProfile);
  const isPower = profile === "power";

  const load = async () => {
    if (!activeProfitCenter || !isPower) return;
    setRows(await listCppUnits(activeProfitCenter.id));
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id, isPower]);

  const openNew = () => { setForm(empty); setOpen(true); };
  const openEdit = (u: CppUnit) => {
    setForm({
      id: u.id,
      code: u.code,
      name: u.name,
      unitType: u.unitType,
      capacityMw: u.capacityMw?.toString() ?? "",
      heatRateKcalPerKwh: u.heatRateKcalPerKwh?.toString() ?? "",
      isActive: u.isActive,
    });
    setOpen(true);
  };

  const errors = useMemo(() => validateUnitInput({
    code: form.code,
    name: form.name,
    unitType: form.unitType,
    capacityMw: form.capacityMw ? Number(form.capacityMw) : null,
    heatRateKcalPerKwh: form.heatRateKcalPerKwh ? Number(form.heatRateKcalPerKwh) : null,
  }), [form]);

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (errors.length) { toast({ title: errors[0].message, variant: "destructive" }); return; }
    setSaving(true);
    try {
      const capacity = form.capacityMw ? Number(form.capacityMw) : null;
      const heatRate = form.heatRateKcalPerKwh ? Number(form.heatRateKcalPerKwh) : null;
      if (form.id) {
        await updateCppUnit(form.id, { code: form.code, name: form.name, unitType: form.unitType, capacityMw: capacity, heatRateKcalPerKwh: heatRate, isActive: form.isActive });
      } else {
        await createCppUnit({ profitCenterId: activeProfitCenter.id, code: form.code, name: form.name, unitType: form.unitType, capacityMw: capacity, heatRateKcalPerKwh: heatRate, isActive: form.isActive });
      }
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "cpp_unit",
        action: form.id ? "cpp_unit.updated" : "cpp_unit.created",
        changeSummary: { code: form.code, name: form.name, unit_type: form.unitType, capacity_mw: capacity, heat_rate_kcal_per_kwh: heatRate, is_active: form.isActive },
      });
      toast({ title: "Unit saved" });
      setOpen(false);
      await load();
    } catch (error) {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>CPP Units</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }
  if (!isPower) {
    return (
      <Card>
        <CardHeader><CardTitle>CPP Units</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">
          CPP Units are only available in Captive Power workspaces. Active workspace profile: <span className="font-mono">{profile}</span>.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>CPP Units — {activeProfitCenter.name}</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}>New unit</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit unit" : "New unit"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="TG-1" /></div>
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div>
                <Label>Type</Label>
                <Select value={form.unitType} onValueChange={(v) => setForm({ ...form, unitType: v as CppUnitType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOILER">BOILER</SelectItem>
                    <SelectItem value="TURBINE">TURBINE</SelectItem>
                    <SelectItem value="GENERATOR">GENERATOR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Capacity (MW)</Label><Input type="number" step="0.001" value={form.capacityMw} onChange={(e) => setForm({ ...form, capacityMw: e.target.value })} /></div>
              <div><Label>Heat rate (kcal / kWh)</Label><Input type="number" step="0.01" value={form.heatRateKcalPerKwh} onChange={(e) => setForm({ ...form, heatRateKcalPerKwh: e.target.value })} /></div>
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
              <TableHead>Capacity MW</TableHead>
              <TableHead>Heat rate</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.code}</TableCell>
                <TableCell>{u.name}</TableCell>
                <TableCell>{u.unitType}</TableCell>
                <TableCell>{u.capacityMw ?? "—"}</TableCell>
                <TableCell>{u.heatRateKcalPerKwh ?? "—"}</TableCell>
                <TableCell>{u.isActive ? "Yes" : "No"}</TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(u)}>Edit</Button></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-muted-foreground">No CPP units yet. Create one to enable generation logging.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
