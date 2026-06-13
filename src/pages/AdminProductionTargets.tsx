/**
 * Phase 3 — Production Target Administration UI.
 *
 * Secure CRUD over `production_targets`. Manages Mn recovery, Si recovery,
 * power (kWh/MT) and electrode (Kg/MT) targets at four scopes — picked by
 * which fields are left blank when the target is saved:
 *
 *   Workspace default  → no furnace, no grade
 *   Furnace-level      → furnace set, no grade
 *   Grade-level        → grade set, no furnace
 *   Furnace + Grade    → both set (most specific)
 *
 * The resolver in `src/lib/production-targets.ts` picks the most specific
 * matching row at heat-validation time — this screen is the only place
 * targets are authored. RLS on `production_targets` already restricts
 * writes to workspace managers + super admins.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  fetchProductionTargets,
  upsertProductionTarget,
  deactivateProductionTarget,
  type ProductionTarget,
} from "@/lib/production-targets";
import { fetchFurnaces, type Furnace } from "@/lib/production";

interface FormState {
  id?: string;
  furnaceId: string; // "" = workspace-scoped
  grade: string;
  product: string;
  mnRecoveryTargetPct: string;
  siRecoveryTargetPct: string;
  kwhPerMtTarget: string;
  electrodeKgPerMtTarget: string;
  notes: string;
  isActive: boolean;
}

const EMPTY: FormState = {
  furnaceId: "",
  grade: "",
  product: "",
  mnRecoveryTargetPct: "",
  siRecoveryTargetPct: "",
  kwhPerMtTarget: "",
  electrodeKgPerMtTarget: "",
  notes: "",
  isActive: true,
};

function num(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function scopeLabel(t: ProductionTarget): string {
  if (t.furnaceId && t.grade) return "Furnace + Grade";
  if (t.furnaceId) return "Furnace";
  if (t.grade) return "Grade";
  return "Workspace";
}

export default function AdminProductionTargets() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const userId = session?.user?.id;

  const [targets, setTargets] = useState<ProductionTarget[]>([]);
  const [furnaces, setFurnaces] = useState<Furnace[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const furnaceById = useMemo(
    () => Object.fromEntries(furnaces.map((f) => [f.id, f])),
    [furnaces],
  );

  async function load() {
    if (!activeProfitCenter) return;
    setLoading(true);
    try {
      const [t, f] = await Promise.all([
        fetchProductionTargets(activeProfitCenter.id),
        fetchFurnaces(activeProfitCenter.id),
      ]);
      setTargets(t);
      setFurnaces(f);
    } catch (e) {
      toast({ title: "Failed to load targets", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfitCenter?.id]);

  function openNew() {
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(t: ProductionTarget) {
    setForm({
      id: t.id,
      furnaceId: t.furnaceId ?? "",
      grade: t.grade ?? "",
      product: t.product ?? "",
      mnRecoveryTargetPct: t.mnRecoveryTargetPct?.toString() ?? "",
      siRecoveryTargetPct: t.siRecoveryTargetPct?.toString() ?? "",
      kwhPerMtTarget: t.kwhPerMtTarget?.toString() ?? "",
      electrodeKgPerMtTarget: t.electrodeKgPerMtTarget?.toString() ?? "",
      notes: t.notes ?? "",
      isActive: t.isActive,
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!activeProfitCenter || !userId) return;
    const mn = num(form.mnRecoveryTargetPct);
    const si = num(form.siRecoveryTargetPct);
    const kwh = num(form.kwhPerMtTarget);
    const elec = num(form.electrodeKgPerMtTarget);
    if (mn == null && si == null && kwh == null && elec == null) {
      toast({
        title: "At least one target value is required",
        description: "Set Mn / Si / kWh / electrode — leaving all four blank is invalid.",
        variant: "destructive",
      });
      return;
    }
    for (const [label, v] of [["Mn recovery", mn], ["Si recovery", si]] as const) {
      if (v != null && (v < 0 || v > 100)) {
        toast({ title: `${label} target must be 0–100%`, variant: "destructive" });
        return;
      }
    }
    if (kwh != null && (kwh < 0 || kwh > 20000)) {
      toast({ title: "kWh/MT target must be 0–20000", variant: "destructive" });
      return;
    }
    if (elec != null && (elec < 0 || elec > 500)) {
      toast({ title: "Electrode Kg/MT target must be 0–500", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      await upsertProductionTarget({
        id: form.id,
        profitCenterId: activeProfitCenter.id,
        furnaceId: form.furnaceId || null,
        grade: form.grade.trim() || null,
        product: form.product.trim() || null,
        mnRecoveryTargetPct: mn,
        siRecoveryTargetPct: si,
        kwhPerMtTarget: kwh,
        electrodeKgPerMtTarget: elec,
        notes: form.notes.trim() || null,
        isActive: form.isActive,
        createdBy: userId,
      });
      toast({ title: form.id ? "Target updated" : "Target created" });
      setOpen(false);
      await load();
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(t: ProductionTarget) {
    if (!confirm(`Deactivate target for ${scopeLabel(t)}? Heats will fall back to a less-specific target.`)) return;
    try {
      await deactivateProductionTarget(t.id);
      toast({ title: "Target deactivated" });
      await load();
    } catch (e) {
      toast({ title: "Deactivate failed", description: (e as Error).message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Production Targets</h1>
          <p className="text-sm text-muted-foreground">
            Recovery, energy and electrode targets — resolved most-specific first.
          </p>
        </div>
        <Button onClick={openNew} disabled={!activeProfitCenter}>+ New target</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active targets · {activeProfitCenter?.name ?? "—"}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No targets configured yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Furnace</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead className="text-right">Mn rec %</TableHead>
                  <TableHead className="text-right">Si rec %</TableHead>
                  <TableHead className="text-right">kWh/MT</TableHead>
                  <TableHead className="text-right">Electrode Kg/MT</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {targets.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell><Badge variant="outline">{scopeLabel(t)}</Badge></TableCell>
                    <TableCell>{t.furnaceId ? furnaceById[t.furnaceId]?.name ?? "—" : "—"}</TableCell>
                    <TableCell>{t.grade ?? "—"}</TableCell>
                    <TableCell className="text-right">{t.mnRecoveryTargetPct ?? "—"}</TableCell>
                    <TableCell className="text-right">{t.siRecoveryTargetPct ?? "—"}</TableCell>
                    <TableCell className="text-right">{t.kwhPerMtTarget ?? "—"}</TableCell>
                    <TableCell className="text-right">{t.electrodeKgPerMtTarget ?? "—"}</TableCell>
                    <TableCell>{t.isActive ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(t)}>Edit</Button>
                      {t.isActive && (
                        <Button size="sm" variant="ghost" onClick={() => handleDeactivate(t)}>Deactivate</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit target" : "New target"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Furnace (blank = workspace)</Label>
              <Select value={form.furnaceId || "_none"} onValueChange={(v) => setForm({ ...form, furnaceId: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Workspace-wide" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Workspace-wide</SelectItem>
                  {furnaces.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Grade (blank = any)</Label>
              <Input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} placeholder="e.g. SiMn 60/14" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Product (optional)</Label>
              <Input value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} placeholder="e.g. SiMn" />
            </div>
            <div className="space-y-1">
              <Label>Mn recovery target %</Label>
              <Input inputMode="decimal" value={form.mnRecoveryTargetPct} onChange={(e) => setForm({ ...form, mnRecoveryTargetPct: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Si recovery target %</Label>
              <Input inputMode="decimal" value={form.siRecoveryTargetPct} onChange={(e) => setForm({ ...form, siRecoveryTargetPct: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>kWh / MT target</Label>
              <Input inputMode="decimal" value={form.kwhPerMtTarget} onChange={(e) => setForm({ ...form, kwhPerMtTarget: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Electrode Kg / MT target</Label>
              <Input inputMode="decimal" value={form.electrodeKgPerMtTarget} onChange={(e) => setForm({ ...form, electrodeKgPerMtTarget: e.target.value })} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              <Label>Active</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
