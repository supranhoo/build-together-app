import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { createAuditLog } from "@/lib/workspace";
import {
  ALLOCATION_BASES,
  COST_TYPES,
  createCostRate,
  fetchCostRates,
  fetchMasterItems,
  type AllocationBasis,
  type CostRate,
  type CostType,
  type MasterItem,
} from "@/lib/master-data";
import { MaterialPicker } from "@/components/MaterialPicker";

interface FormState {
  materialId: string;
  rate: string;
  costType: CostType;
  allocationBasis: AllocationBasis | "";
  status: "ACTIVE" | "INACTIVE";
  effectiveFrom: string;
  effectiveTo: string;
  notes: string;
}
const today = () => new Date().toISOString().slice(0, 10);
const empty = (): FormState => ({
  materialId: "",
  rate: "",
  costType: "variable",
  allocationBasis: "",
  status: "ACTIVE",
  effectiveFrom: today(),
  effectiveTo: "",
  notes: "",
});

export default function AdminCostRates() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [rates, setRates] = useState<CostRate[]>([]);
  const [items, setItems] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty());
  const [saving, setSaving] = useState(false);
  const [materialFilter, setMaterialFilter] = useState<string>("all");

  const load = async () => {
    if (!activeProfitCenter) return;
    setLoading(true);
    try {
      const [r, i] = await Promise.all([
        fetchCostRates(activeProfitCenter.id),
        fetchMasterItems(activeProfitCenter.id),
      ]);
      setRates(r);
      setItems(i);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id]);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const filtered = materialFilter === "all" ? rates : rates.filter((r) => r.materialId === materialFilter);

  const openNew = () => { setForm({ ...empty(), materialId: items[0]?.id ?? "" }); setOpen(true); };

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (!form.materialId) {
      toast({ title: "Select a material", variant: "destructive" });
      return;
    }
    const rate = Number(form.rate);
    if (!Number.isFinite(rate)) {
      toast({ title: "Rate must be a number", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createCostRate({
        profitCenterId: activeProfitCenter.id,
        materialId: form.materialId,
        rate,
        costType: form.costType,
        allocationBasis: form.allocationBasis || null,
        status: form.status,
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || null,
        notes: form.notes.trim() || null,
        createdBy: session.user.id,
      });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "cost_rate",
        action: "cost_rate.created",
        changeSummary: {
          material_id: form.materialId,
          rate,
          cost_type: form.costType,
          allocation_basis: form.allocationBasis || null,
          status: form.status,
          effective_from: form.effectiveFrom,
        },
      });
      toast({ title: "Rate posted" });
      setOpen(false);
      await load();
    } catch (error) {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>Rate & Cost Pool</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Rate & Cost Pool — {activeProfitCenter.name}</CardTitle>
        <div className="flex gap-2">
          <div className="w-56">
            <MaterialPicker
              contextKey="costing.rates.filter"
              profitCenterId={activeProfitCenter.id}
              materials={items}
              value={materialFilter === "all" ? "" : materialFilter}
              onChange={(v) => setMaterialFilter(v || "all")}
              placeholder="All materials"
            />
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openNew} disabled={items.length === 0}>New rate</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New rate (append-only)</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Material</Label>
                  <MaterialPicker
                    contextKey="costing.rates.form"
                    profitCenterId={activeProfitCenter.id}
                    materials={items}
                    value={form.materialId}
                    onChange={(v) => setForm({ ...form, materialId: v })}
                  />
                </div>
                <div><Label>Rate</Label><Input type="number" step="0.0001" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></div>
                <div>
                  <Label>Cost type</Label>
                  <Select value={form.costType} onValueChange={(v) => setForm({ ...form, costType: v as CostType, allocationBasis: v === "utility" ? (form.allocationBasis || "per_kwh") : "" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COST_TYPES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {(form.costType === "utility" || form.costType === "fixed") && (
                  <div>
                    <Label>Allocation basis</Label>
                    <Select value={form.allocationBasis || "per_mt"} onValueChange={(v) => setForm({ ...form, allocationBasis: v as AllocationBasis })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ALLOCATION_BASES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "ACTIVE" | "INACTIVE" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                      <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Effective from</Label><Input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} /></div>
                <div><Label>Effective to (optional)</Label><Input type="date" value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} /></div>
                <div className="col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving…" : "Post rate"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Material</TableHead><TableHead>Rate</TableHead><TableHead>Type</TableHead><TableHead>Basis</TableHead><TableHead>Status</TableHead><TableHead>Effective from</TableHead><TableHead>Effective to</TableHead><TableHead>Notes</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={8} className="text-muted-foreground">Loading…</TableCell></TableRow>}
            {!loading && filtered.map((r) => {
              const m = itemMap.get(r.materialId);
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{m ? `${m.code} — ${m.name}` : r.materialId}</TableCell>
                  <TableCell>{r.rate}</TableCell>
                  <TableCell>{r.costType}</TableCell>
                  <TableCell>{r.allocationBasis ?? "—"}</TableCell>
                  <TableCell>{r.status}</TableCell>
                  <TableCell>{r.effectiveFrom}</TableCell>
                  <TableCell>{r.effectiveTo ?? "—"}</TableCell>
                  <TableCell>{r.notes ?? "—"}</TableCell>
                </TableRow>
              );
            })}
            {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-muted-foreground">No rates posted yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
