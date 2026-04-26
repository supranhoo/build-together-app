/**
 * Admin Power Tariff Slabs editor — Phase C.
 *
 * Append-only Time-Of-Day power tariff (slab name × hour range × rate × season)
 * with effective-date tracking. Soft-deactivate via `is_active = false`.
 * Overlapping slabs only emit a non-blocking warning (matches the workspace's
 * "warn but allow" rate-change policy).
 *
 * RLS: writes restricted by `Admins manage power tariff slabs`.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { createAuditLog } from "@/lib/workspace";
import {
  createPowerTariffSlab,
  deactivatePowerTariffSlab,
  fetchPowerTariffSlabs,
  type PowerTariffSlab,
} from "@/lib/finance";

interface FormState {
  slabName: string;
  startHour: string;
  endHour: string;
  ratePerMwh: string;
  season: string;
  effectiveFrom: string;
  effectiveTo: string;
  notes: string;
}

const today = () => new Date().toISOString().slice(0, 10);

const empty = (): FormState => ({
  slabName: "",
  startHour: "0",
  endHour: "24",
  ratePerMwh: "",
  season: "all",
  effectiveFrom: today(),
  effectiveTo: "",
  notes: "",
});

export default function AdminPowerTariff() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [slabs, setSlabs] = useState<PowerTariffSlab[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty());
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const load = async () => {
    if (!activeProfitCenter) return;
    setLoading(true);
    try {
      setSlabs(await fetchPowerTariffSlabs(activeProfitCenter.id));
    } catch (e) {
      toast({ title: "Failed to load slabs", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeProfitCenter?.id]);

  const filtered = useMemo(
    () => slabs.filter((s) => showInactive || s.isActive),
    [slabs, showInactive],
  );

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (!form.slabName.trim()) { toast({ title: "Slab name required", variant: "destructive" }); return; }
    const startHour = Number(form.startHour);
    const endHour = Number(form.endHour);
    if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
      toast({ title: "Start hour must be 0–23", variant: "destructive" }); return;
    }
    if (!Number.isInteger(endHour) || endHour < 1 || endHour > 24 || endHour <= startHour) {
      toast({ title: "End hour must be 1–24 and greater than start", variant: "destructive" }); return;
    }
    const rate = Number(form.ratePerMwh);
    if (!Number.isFinite(rate) || rate < 0) {
      toast({ title: "Rate per MWh must be ≥ 0", variant: "destructive" }); return;
    }

    // Overlap warning (non-blocking).
    const seasonKey = form.season === "all" ? null : form.season;
    const overlap = slabs.find((s) =>
      s.isActive
      && (s.season ?? null) === seasonKey
      && (!s.effectiveTo || s.effectiveTo >= form.effectiveFrom)
      && s.effectiveFrom <= (form.effectiveTo || "9999-12-31")
      && s.startHour < endHour && startHour < s.endHour,
    );

    setSaving(true);
    try {
      const created = await createPowerTariffSlab({
        profitCenterId: activeProfitCenter.id,
        slabName: form.slabName.trim(),
        startHour, endHour, ratePerMwh: rate,
        season: seasonKey,
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || null,
        notes: form.notes.trim() || null,
        createdBy: session.user.id,
      });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "power_tariff_slabs",
        entityId: created.id,
        action: "tariff.created",
        changeSummary: { slab: created.slabName, start: created.startHour, end: created.endHour, rate: created.ratePerMwh },
      });
      toast({
        title: "Slab added",
        description: overlap ? `Warning: overlaps existing slab "${overlap.slabName}".` : undefined,
      });
      setOpen(false);
      setForm(empty());
      await load();
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDeactivate = async (row: PowerTariffSlab) => {
    if (!session?.user || !activeProfitCenter) return;
    if (!confirm(`Deactivate slab "${row.slabName}" (${row.startHour}–${row.endHour}h)?`)) return;
    try {
      await deactivatePowerTariffSlab(row.id);
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "power_tariff_slabs",
        entityId: row.id,
        action: "tariff.deactivated",
        changeSummary: { slab: row.slabName },
      });
      toast({ title: "Slab deactivated" });
      await load();
    } catch (e) {
      toast({ title: "Deactivate failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>Power Tariff</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Power Tariff Slabs — {activeProfitCenter.name}</CardTitle>
          <CardDescription>
            Time-Of-Day power rates per slab. Use slab name "demand_charge" with 0–24h for a flat demand charge.
            Slabs are append-only; overlapping slabs only warn — they do not block.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={showInactive ? "default" : "outline"} onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? "Hiding none" : "Show inactive"}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button>New slab</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New power tariff slab</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Slab name</Label>
                  <Input placeholder="e.g. Off-peak / Normal / Peak / demand_charge" value={form.slabName} onChange={(e) => setForm({ ...form, slabName: e.target.value })} />
                </div>
                <div>
                  <Label>Start hour (0–23)</Label>
                  <Input type="number" min={0} max={23} value={form.startHour} onChange={(e) => setForm({ ...form, startHour: e.target.value })} />
                </div>
                <div>
                  <Label>End hour (1–24, exclusive)</Label>
                  <Input type="number" min={1} max={24} value={form.endHour} onChange={(e) => setForm({ ...form, endHour: e.target.value })} />
                </div>
                <div>
                  <Label>Rate per MWh (₹)</Label>
                  <Input type="number" step="0.01" value={form.ratePerMwh} onChange={(e) => setForm({ ...form, ratePerMwh: e.target.value })} />
                </div>
                <div>
                  <Label>Season</Label>
                  <Select value={form.season} onValueChange={(v) => setForm({ ...form, season: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All year</SelectItem>
                      <SelectItem value="summer">Summer</SelectItem>
                      <SelectItem value="monsoon">Monsoon</SelectItem>
                      <SelectItem value="winter">Winter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Effective from</Label>
                  <Input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
                </div>
                <div>
                  <Label>Effective to (optional)</Label>
                  <Input type="date" value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label>Notes</Label>
                  <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving…" : "Add slab"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Slab</TableHead>
            <TableHead>Hours</TableHead>
            <TableHead className="text-right">Rate / MWh</TableHead>
            <TableHead>Season</TableHead>
            <TableHead>Effective from</TableHead>
            <TableHead>Effective to</TableHead>
            <TableHead>Status</TableHead>
            <TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={8} className="text-muted-foreground">Loading…</TableCell></TableRow>}
            {!loading && filtered.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.slabName}</TableCell>
                <TableCell>{s.startHour}–{s.endHour}h</TableCell>
                <TableCell className="text-right">{s.ratePerMwh.toLocaleString()}</TableCell>
                <TableCell>{s.season ?? "All year"}</TableCell>
                <TableCell>{s.effectiveFrom}</TableCell>
                <TableCell>{s.effectiveTo ?? "—"}</TableCell>
                <TableCell>{s.isActive ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                <TableCell>{s.isActive && <Button size="sm" variant="ghost" onClick={() => void handleDeactivate(s)}>Deactivate</Button>}</TableCell>
              </TableRow>
            ))}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-muted-foreground">No slabs configured yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
