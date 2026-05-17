import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  listKilns,
  createKiln,
  updateKiln,
  validateKilnInput,
  type Kiln,
} from "@/lib/dri-production";
import { createAuditLog } from "@/lib/workspace";
import { resolveProcessProfile } from "@/lib/workspace-profiles";

// Admin master-data screen for DRI kilns.
// Gated to workspaces whose profile is `dri` per WORKSPACE_PROFILES.md §8.
interface FormState {
  id?: string;
  code: string;
  name: string;
  ratedCapacityMtPerDay: string;
  isActive: boolean;
}

const empty: FormState = { code: "", name: "", ratedCapacityMtPerDay: "", isActive: true };

export default function AdminKilns() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Kiln[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const profile = resolveProcessProfile(activeProfitCenter?.processProfile);
  const isDri = profile === "dri";

  const load = async () => {
    if (!activeProfitCenter || !isDri) return;
    setRows(await listKilns(activeProfitCenter.id));
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id, isDri]);

  const openNew = () => { setForm(empty); setOpen(true); };
  const openEdit = (k: Kiln) => {
    setForm({
      id: k.id,
      code: k.code,
      name: k.name,
      ratedCapacityMtPerDay: k.ratedCapacityMtPerDay?.toString() ?? "",
      isActive: k.isActive,
    });
    setOpen(true);
  };

  const errors = useMemo(() => validateKilnInput({
    code: form.code,
    name: form.name,
    ratedCapacityMtPerDay: form.ratedCapacityMtPerDay ? Number(form.ratedCapacityMtPerDay) : null,
  }), [form]);

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (errors.length) {
      toast({ title: errors[0].message, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const capacity = form.ratedCapacityMtPerDay ? Number(form.ratedCapacityMtPerDay) : null;
      if (form.id) {
        await updateKiln(form.id, {
          code: form.code,
          name: form.name,
          ratedCapacityMtPerDay: capacity,
          isActive: form.isActive,
        });
      } else {
        await createKiln({
          profitCenterId: activeProfitCenter.id,
          code: form.code,
          name: form.name,
          ratedCapacityMtPerDay: capacity,
          isActive: form.isActive,
        });
      }
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "kiln",
        action: form.id ? "kiln.updated" : "kiln.created",
        changeSummary: { code: form.code, name: form.name, rated_capacity_mt_per_day: capacity, is_active: form.isActive },
      });
      toast({ title: "Kiln saved" });
      setOpen(false);
      await load();
    } catch (error) {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>Kilns</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }
  if (!isDri) {
    return (
      <Card>
        <CardHeader><CardTitle>Kilns</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">
          Kilns are only available in DRI workspaces. Active workspace profile: <span className="font-mono">{profile}</span>.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Kilns — {activeProfitCenter.name}</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}>New kiln</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit kiln" : "New kiln"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="KILN-1" /></div>
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Rated capacity (MT / day)</Label><Input type="number" step="0.01" value={form.ratedCapacityMtPerDay} onChange={(e) => setForm({ ...form, ratedCapacityMtPerDay: e.target.value })} /></div>
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
              <TableHead>Rated MT/day</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.code}</TableCell>
                <TableCell>{k.name}</TableCell>
                <TableCell>{k.ratedCapacityMtPerDay ?? "—"}</TableCell>
                <TableCell>{k.isActive ? "Yes" : "No"}</TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(k)}>Edit</Button></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-muted-foreground">No kilns yet. Create one to enable shift logging.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
