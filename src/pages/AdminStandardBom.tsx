/**
 * Admin Standard BOM editor — Phase B.
 *
 * Append-only IDEAL recipe (grade × material × std qty per MT × std rate)
 * with effective-date tracking. Soft-deactivate via `is_active = false` so
 * historic snapshots remain reproducible.
 *
 * RLS: writes restricted by `Admins manage std bom` policy.
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
import { fetchMasterItems, type MasterItem } from "@/lib/master-data";
import { MaterialPicker } from "@/components/MaterialPicker";
import {
  createBomEntry,
  deactivateBomEntry,
  fetchStandardBom,
  type StandardCostBom,
} from "@/lib/finance";

interface FormState {
  grade: string;
  product: string;
  materialId: string;
  stdQtyPerMt: string;
  stdRate: string;
  uom: string;
  effectiveFrom: string;
  effectiveTo: string;
  notes: string;
}

const today = () => new Date().toISOString().slice(0, 10);

const empty = (): FormState => ({
  grade: "",
  product: "",
  materialId: "",
  stdQtyPerMt: "",
  stdRate: "",
  uom: "kg",
  effectiveFrom: today(),
  effectiveTo: "",
  notes: "",
});

export default function AdminStandardBom() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [bom, setBom] = useState<StandardCostBom[]>([]);
  const [items, setItems] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty());
  const [saving, setSaving] = useState(false);
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);

  const load = async () => {
    if (!activeProfitCenter) return;
    setLoading(true);
    try {
      const [b, i] = await Promise.all([
        fetchStandardBom(activeProfitCenter.id),
        fetchMasterItems(activeProfitCenter.id),
      ]);
      setBom(b);
      setItems(i);
    } catch (e) {
      toast({
        title: "Failed to load BOM",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfitCenter?.id]);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const grades = useMemo(
    () => Array.from(new Set(bom.map((b) => b.grade))).sort(),
    [bom],
  );

  const filtered = useMemo(() => {
    return bom.filter((b) => {
      if (!showInactive && !b.isActive) return false;
      if (gradeFilter !== "all" && b.grade !== gradeFilter) return false;
      return true;
    });
  }, [bom, gradeFilter, showInactive]);

  const openNew = () => {
    setForm({ ...empty(), materialId: items[0]?.id ?? "", uom: items[0]?.uom ?? "kg" });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (!form.grade.trim()) {
      toast({ title: "Grade is required", variant: "destructive" });
      return;
    }
    if (!form.materialId) {
      toast({ title: "Select a material", variant: "destructive" });
      return;
    }
    const stdQty = Number(form.stdQtyPerMt);
    if (!Number.isFinite(stdQty) || stdQty <= 0) {
      toast({ title: "Std qty per MT must be > 0", variant: "destructive" });
      return;
    }
    const stdRate = form.stdRate.trim() === "" ? null : Number(form.stdRate);
    if (stdRate !== null && !Number.isFinite(stdRate)) {
      toast({ title: "Std rate must be a number", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const created = await createBomEntry({
        profitCenterId: activeProfitCenter.id,
        grade: form.grade.trim(),
        product: form.product.trim() || null,
        materialId: form.materialId,
        stdQtyPerMt: stdQty,
        stdRate,
        uom: form.uom || "kg",
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || null,
        notes: form.notes.trim() || null,
        createdBy: session.user.id,
      });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "standard_cost_bom",
        entityId: created.id,
        action: "bom.created",
        changeSummary: {
          grade: created.grade,
          material_id: created.materialId,
          std_qty_per_mt: created.stdQtyPerMt,
          std_rate: created.stdRate,
          effective_from: created.effectiveFrom,
        },
      });
      toast({ title: "BOM row added" });
      setOpen(false);
      await load();
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (row: StandardCostBom) => {
    if (!session?.user || !activeProfitCenter) return;
    if (!confirm(`Deactivate BOM for ${row.grade} / ${itemMap.get(row.materialId)?.code ?? row.materialId}?`)) return;
    try {
      await deactivateBomEntry(row.id);
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "standard_cost_bom",
        entityId: row.id,
        action: "bom.deactivated",
        changeSummary: { grade: row.grade, material_id: row.materialId },
      });
      toast({ title: "BOM row deactivated" });
      await load();
    } catch (e) {
      toast({
        title: "Deactivate failed",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    }
  };

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardHeader><CardTitle>Standard BOM</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">Select a workspace first.</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Standard BOM — {activeProfitCenter.name}</CardTitle>
          <CardDescription>
            IDEAL recipe per grade. Drives the IDEAL column in the variance matrix.
            Rows are append-only; superseded entries can be deactivated to stop applying without losing history.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={gradeFilter} onValueChange={setGradeFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All grades</SelectItem>
              {grades.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant={showInactive ? "default" : "outline"}
            onClick={() => setShowInactive((v) => !v)}
          >
            {showInactive ? "Hiding none" : "Show inactive"}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew} disabled={items.length === 0}>New BOM row</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New BOM row (append-only)</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Grade</Label>
                  <Input
                    placeholder="e.g. Si-Mn-65"
                    value={form.grade}
                    onChange={(e) => setForm({ ...form, grade: e.target.value })}
                    list="bom-grade-suggest"
                  />
                  <datalist id="bom-grade-suggest">
                    {grades.map((g) => <option key={g} value={g} />)}
                  </datalist>
                </div>
                <div>
                  <Label>Product (optional)</Label>
                  <Input
                    placeholder="e.g. Si-Mn"
                    value={form.product}
                    onChange={(e) => setForm({ ...form, product: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Material</Label>
                  <MaterialPicker
                    contextKey="costing.bom.form"
                    profitCenterId={activeProfitCenter?.id ?? null}
                    materials={items}
                    value={form.materialId}
                    onChange={(v) => {
                      const m = items.find((i) => i.id === v);
                      setForm({ ...form, materialId: v, uom: m?.uom ?? form.uom });
                    }}
                  />
                </div>
                <div>
                  <Label>Std qty per MT</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={form.stdQtyPerMt}
                    onChange={(e) => setForm({ ...form, stdQtyPerMt: e.target.value })}
                  />
                </div>
                <div>
                  <Label>UOM</Label>
                  <Input value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} />
                </div>
                <div>
                  <Label>Std rate (optional)</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={form.stdRate}
                    onChange={(e) => setForm({ ...form, stdRate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Effective from</Label>
                  <Input
                    type="date"
                    value={form.effectiveFrom}
                    onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Effective to (optional)</Label>
                  <Input
                    type="date"
                    value={form.effectiveTo}
                    onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Notes</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => void handleSave()} disabled={saving}>
                  {saving ? "Saving…" : "Add BOM row"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Grade</TableHead>
              <TableHead>Material</TableHead>
              <TableHead className="text-right">Std qty / MT</TableHead>
              <TableHead>UOM</TableHead>
              <TableHead className="text-right">Std rate</TableHead>
              <TableHead>Effective from</TableHead>
              <TableHead>Effective to</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={9} className="text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!loading && filtered.map((b) => {
              const m = itemMap.get(b.materialId);
              return (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.grade}</TableCell>
                  <TableCell>{m ? `${m.code} — ${m.name}` : b.materialId}</TableCell>
                  <TableCell className="text-right">{b.stdQtyPerMt}</TableCell>
                  <TableCell>{b.uom}</TableCell>
                  <TableCell className="text-right">{b.stdRate ?? "—"}</TableCell>
                  <TableCell>{b.effectiveFrom}</TableCell>
                  <TableCell>{b.effectiveTo ?? "—"}</TableCell>
                  <TableCell>
                    {b.isActive
                      ? <Badge variant="default">Active</Badge>
                      : <Badge variant="outline">Inactive</Badge>}
                  </TableCell>
                  <TableCell>
                    {b.isActive && (
                      <Button size="sm" variant="ghost" onClick={() => void handleDeactivate(b)}>
                        Deactivate
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-muted-foreground">No BOM rows yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
