/**
 * Supplier Performance tab — Phase D.
 *
 * Periodic supplier scorecards. Each evaluation captures three sub-scores
 * (on-time %, quality %, price score) for a [periodStart, periodEnd] window.
 * The overall score is computed as the equally-weighted mean of the present
 * sub-scores (see `computeOverallScore` and POLICY.md Phase 25/D).
 *
 * Evaluations are append-only — a correction is added as a new row covering
 * the same period rather than mutating history.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  computeOverallScore,
  createSupplierEvaluation,
  fetchSupplierEvaluations,
  fetchSuppliers,
  type Supplier,
  type SupplierEvaluation,
} from "@/lib/procurement";

interface FormState {
  supplierId: string;
  periodStart: string;
  periodEnd: string;
  onTimePct: string;
  qualityPct: string;
  priceScore: string;
  notes: string;
}

const empty: FormState = {
  supplierId: "",
  periodStart: "",
  periodEnd: "",
  onTimePct: "",
  qualityPct: "",
  priceScore: "",
  notes: "",
};

function scoreBadge(score: number | null): { label: string; className: string } {
  if (score === null) return { label: "—", className: "bg-muted text-muted-foreground" };
  if (score >= 85) return { label: score.toFixed(1), className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
  if (score >= 70) return { label: score.toFixed(1), className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" };
  return { label: score.toFixed(1), className: "bg-destructive/10 text-destructive" };
}

export function SupplierPerformanceTab() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [evaluations, setEvaluations] = useState<SupplierEvaluation[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const supplierMap = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);

  const previewOverall = useMemo(() => {
    const parse = (v: string): number | null => (v === "" ? null : Number(v));
    return computeOverallScore(parse(form.onTimePct), parse(form.qualityPct), parse(form.priceScore));
  }, [form.onTimePct, form.qualityPct, form.priceScore]);

  const load = async () => {
    if (!activeProfitCenter) return;
    setLoading(true);
    try {
      const [s, e] = await Promise.all([
        fetchSuppliers(activeProfitCenter.id),
        fetchSupplierEvaluations(activeProfitCenter.id),
      ]);
      setSuppliers(s);
      setEvaluations(e);
    } catch (err) {
      toast({ title: "Failed to load evaluations", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfitCenter?.id]);

  const openNew = () => { setForm(empty); setFormOpen(true); };

  const save = async () => {
    if (!activeProfitCenter || !session?.user) return;
    setSaving(true);
    try {
      const parse = (v: string): number | null => (v === "" ? null : Number(v));
      await createSupplierEvaluation({
        profitCenterId: activeProfitCenter.id,
        supplierId: form.supplierId,
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        onTimePct: parse(form.onTimePct),
        qualityPct: parse(form.qualityPct),
        priceScore: parse(form.priceScore),
        notes: form.notes.trim() || null,
        createdBy: session.user.id,
      });
      toast({ title: "Evaluation recorded" });
      setFormOpen(false);
      await load();
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardHeader><CardTitle>Supplier Performance</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">Select a workspace first.</CardContent>
      </Card>
    );
  }

  // Latest evaluation per supplier — leaderboard
  const latestBySupplier = new Map<string, SupplierEvaluation>();
  for (const ev of evaluations) {
    const existing = latestBySupplier.get(ev.supplierId);
    if (!existing || ev.periodEnd > existing.periodEnd) latestBySupplier.set(ev.supplierId, ev);
  }
  const leaderboard = Array.from(latestBySupplier.values()).sort(
    (a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1),
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" /> Supplier Performance — {activeProfitCenter.name}
            </CardTitle>
            <CardDescription>
              Latest scorecard per supplier. Overall = equally-weighted mean of available sub-scores.
            </CardDescription>
          </div>
          <Button onClick={openNew} disabled={suppliers.length === 0}>New Evaluation</Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : leaderboard.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
              No evaluations recorded yet. Add one to start the supplier scorecard.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">On-time %</TableHead>
                  <TableHead className="text-right">Quality %</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Overall</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.map((ev) => {
                  const s = supplierMap.get(ev.supplierId);
                  const b = scoreBadge(ev.overallScore);
                  return (
                    <TableRow key={ev.id}>
                      <TableCell>
                        <div className="font-medium">{s?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{s?.code ?? ""}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {ev.periodStart} → {ev.periodEnd}
                      </TableCell>
                      <TableCell className="text-right">{ev.onTimePct?.toFixed(1) ?? "—"}</TableCell>
                      <TableCell className="text-right">{ev.qualityPct?.toFixed(1) ?? "—"}</TableCell>
                      <TableCell className="text-right">{ev.priceScore?.toFixed(1) ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Badge className={`${b.className} border-0`}>{b.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {evaluations.length > leaderboard.length && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
            <CardDescription>All evaluations including older periods.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">On-time</TableHead>
                  <TableHead className="text-right">Quality</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Overall</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evaluations.map((ev) => {
                  const s = supplierMap.get(ev.supplierId);
                  return (
                    <TableRow key={ev.id}>
                      <TableCell className="text-sm">{s?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{ev.periodStart} → {ev.periodEnd}</TableCell>
                      <TableCell className="text-right">{ev.onTimePct?.toFixed(1) ?? "—"}</TableCell>
                      <TableCell className="text-right">{ev.qualityPct?.toFixed(1) ?? "—"}</TableCell>
                      <TableCell className="text-right">{ev.priceScore?.toFixed(1) ?? "—"}</TableCell>
                      <TableCell className="text-right">{ev.overallScore?.toFixed(1) ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{ev.notes ?? ""}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Supplier Evaluation</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Supplier</Label>
              <Select value={form.supplierId} onValueChange={(v) => setForm({ ...form, supplierId: v })}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.filter((s) => s.isActive).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Period Start</Label>
                <Input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Period End</Label>
                <Input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label>On-time %</Label>
                <Input type="number" min="0" max="100" step="0.1" value={form.onTimePct} onChange={(e) => setForm({ ...form, onTimePct: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Quality %</Label>
                <Input type="number" min="0" max="100" step="0.1" value={form.qualityPct} onChange={(e) => setForm({ ...form, qualityPct: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Price (0-100)</Label>
                <Input type="number" min="0" max="100" step="0.1" value={form.priceScore} onChange={(e) => setForm({ ...form, priceScore: e.target.value })} />
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              Computed overall score:{" "}
              <span className="font-medium text-foreground">
                {previewOverall === null ? "— (enter at least one sub-score)" : previewOverall.toFixed(1)}
              </span>
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving || !form.supplierId || !form.periodStart || !form.periodEnd}>
              {saving ? "Saving…" : "Record Evaluation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
