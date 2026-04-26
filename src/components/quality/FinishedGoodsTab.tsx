/**
 * Finished Goods Inspection — Quality Phase C.
 *
 * Captures FG chemistry per batch / heat and computes a verdict
 * (pass | conditional | fail) using the same ladder as Bunker Feed QC.
 * A new inspection may be saved as `pending` when no spec is supplied;
 * the operator can score it later from the row's "Score" action while
 * RLS keeps non-pending rows immutable.
 *
 * No business numbers are hardcoded: spec values are entered ad-hoc in
 * this phase. Product/grade master integration is tracked in the plan.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, AlertTriangle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  createFgInspection,
  evaluateFgInspection,
  fetchFgInspections,
  scoreFgInspection,
  type FgInspection,
  type FgSpecMap,
  type InspectionResult,
} from "@/lib/quality";

const RESULT_VARIANT: Record<InspectionResult, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  pending:     { label: "Pending",     className: "bg-muted text-muted-foreground",                          Icon: Clock },
  pass:        { label: "Pass",        className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", Icon: CheckCircle2 },
  conditional: { label: "Conditional", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",      Icon: AlertTriangle },
  fail:        { label: "Fail",        className: "bg-destructive/10 text-destructive",                      Icon: XCircle },
};

function ResultBadge({ result }: { result: InspectionResult }) {
  const v = RESULT_VARIANT[result];
  const I = v.Icon;
  return <Badge className={`${v.className} gap-1 border-0`}><I className="h-3 w-3" />{v.label}</Badge>;
}

function numOrNull(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

interface SpecField {
  key: keyof FgSpecMap;
  label: string;
}
const FG_FIELDS: SpecField[] = [
  { key: "fgMnPct", label: "Mn %" },
  { key: "fgSiPct", label: "Si %" },
  { key: "fgCPct",  label: "C %" },
  { key: "fgPPct",  label: "P %" },
  { key: "fgSPct",  label: "S %" },
];

interface SpecRow { min: string; max: string }
type SpecRowMap = Record<keyof FgSpecMap, SpecRow>;
const EMPTY_SPEC_ROW: SpecRow = { min: "", max: "" };
function emptySpecRowMap(): SpecRowMap {
  return FG_FIELDS.reduce((acc, f) => { acc[f.key] = { ...EMPTY_SPEC_ROW }; return acc; }, {} as SpecRowMap);
}

function rowsToSpecMap(rows: SpecRowMap): FgSpecMap {
  const out: FgSpecMap = {};
  for (const f of FG_FIELDS) {
    const min = numOrNull(rows[f.key].min);
    const max = numOrNull(rows[f.key].max);
    if (min === null && max === null) continue;
    out[f.key] = { min, max };
  }
  return out;
}

export function FinishedGoodsTab() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<FgInspection[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [scoreTarget, setScoreTarget] = useState<FgInspection | null>(null);
  const [saving, setSaving] = useState(false);

  // Create form
  const [inspectionNo, setInspectionNo] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [product, setProduct] = useState("");
  const [grade, setGrade] = useState("");
  const [obs, setObs] = useState<Record<keyof FgSpecMap, string>>(() =>
    FG_FIELDS.reduce((a, f) => ({ ...a, [f.key]: "" }), {} as Record<keyof FgSpecMap, string>));
  const [specRows, setSpecRows] = useState<SpecRowMap>(emptySpecRowMap);
  const [notes, setNotes] = useState("");

  // Score form (re-uses observation + spec rows for a pending row)
  const [scoreObs, setScoreObs] = useState<Record<keyof FgSpecMap, string>>({} as any);
  const [scoreSpecs, setScoreSpecs] = useState<SpecRowMap>(emptySpecRowMap);
  const [scoreNotes, setScoreNotes] = useState("");

  const pcId = activeProfitCenter?.id;
  const userId = session?.user?.id;

  useEffect(() => {
    if (!pcId) return;
    setLoading(true);
    fetchFgInspections(pcId)
      .then(setItems)
      .catch((e: any) => toast({ title: "Failed to load inspections", description: e?.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [pcId, toast]);

  const livePreview = useMemo(() => {
    const specs = rowsToSpecMap(specRows);
    if (Object.keys(specs).length === 0) return null;
    const observed = FG_FIELDS.reduce((a, f) => ({ ...a, [f.key]: numOrNull(obs[f.key]) }),
      {} as Record<keyof FgSpecMap, number | null>);
    return evaluateFgInspection(observed, specs);
  }, [obs, specRows]);

  const scorePreview = useMemo(() => {
    if (!scoreTarget) return null;
    const specs = rowsToSpecMap(scoreSpecs);
    if (Object.keys(specs).length === 0) return null;
    const observed = FG_FIELDS.reduce((a, f) => ({ ...a, [f.key]: numOrNull(scoreObs[f.key] ?? "") }),
      {} as Record<keyof FgSpecMap, number | null>);
    return evaluateFgInspection(observed, specs);
  }, [scoreTarget, scoreObs, scoreSpecs]);

  function resetCreate() {
    setInspectionNo(""); setBatchNo(""); setProduct(""); setGrade(""); setNotes("");
    setObs(FG_FIELDS.reduce((a, f) => ({ ...a, [f.key]: "" }), {} as Record<keyof FgSpecMap, string>));
    setSpecRows(emptySpecRowMap());
  }

  async function reload() {
    if (!pcId) return;
    setItems(await fetchFgInspections(pcId));
  }

  async function handleCreate() {
    if (!pcId || !userId) return;
    if (!inspectionNo.trim()) {
      toast({ title: "Inspection number required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const observed = FG_FIELDS.reduce((a, f) => ({ ...a, [f.key]: numOrNull(obs[f.key]) }),
        {} as Record<keyof FgSpecMap, number | null>);
      await createFgInspection({
        profitCenterId: pcId,
        createdBy: userId,
        inspectionNo: inspectionNo.trim(),
        batchNo: batchNo.trim() || null,
        product: product.trim() || null,
        grade: grade.trim() || null,
        notes: notes.trim() || null,
        ...observed,
        specs: rowsToSpecMap(specRows),
      });
      toast({ title: "FG inspection recorded" });
      setCreateOpen(false);
      resetCreate();
      await reload();
    } catch (e: any) {
      toast({ title: "Create failed", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function openScore(row: FgInspection) {
    setScoreTarget(row);
    setScoreObs({
      fgMnPct: row.fgMnPct?.toString() ?? "",
      fgSiPct: row.fgSiPct?.toString() ?? "",
      fgCPct:  row.fgCPct?.toString()  ?? "",
      fgPPct:  row.fgPPct?.toString()  ?? "",
      fgSPct:  row.fgSPct?.toString()  ?? "",
    });
    setScoreSpecs(emptySpecRowMap());
    setScoreNotes(row.notes ?? "");
  }

  async function handleScore() {
    if (!scoreTarget) return;
    const specs = rowsToSpecMap(scoreSpecs);
    if (Object.keys(specs).length === 0) {
      toast({ title: "Provide a spec for at least one field", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const observed = FG_FIELDS.reduce((a, f) => ({ ...a, [f.key]: numOrNull(scoreObs[f.key] ?? "") }),
        {} as Record<keyof FgSpecMap, number | null>);
      await scoreFgInspection({
        id: scoreTarget.id,
        current: scoreTarget.result,
        observed,
        specs,
        notes: scoreNotes.trim() || null,
      });
      toast({ title: "Inspection scored" });
      setScoreTarget(null);
      await reload();
    } catch (e: any) {
      toast({ title: "Score failed", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!pcId) {
    return <p className="text-sm text-muted-foreground">Select a workspace to manage FG inspections.</p>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>Finished Goods Inspection</CardTitle>
          <CardDescription>
            Batch-level FG chemistry vs. spec. Verdict ladder mirrors Bunker Feed QC; pending rows can be scored.
          </CardDescription>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New inspection
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inspected</TableHead>
                <TableHead>Inspection #</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Product / Grade</TableHead>
                <TableHead className="text-right">Mn</TableHead>
                <TableHead className="text-right">Si</TableHead>
                <TableHead className="text-right">C</TableHead>
                <TableHead className="text-right">P</TableHead>
                <TableHead className="text-right">S</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={11} className="text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!loading && items.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center text-sm text-muted-foreground">No inspections recorded.</TableCell></TableRow>
              )}
              {items.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(r.inspectedAt).toLocaleString()}</TableCell>
                  <TableCell className="font-medium">{r.inspectionNo}</TableCell>
                  <TableCell>{r.batchNo ?? "—"}</TableCell>
                  <TableCell className="text-xs">{[r.product, r.grade].filter(Boolean).join(" / ") || "—"}</TableCell>
                  <TableCell className="text-right">{r.fgMnPct ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.fgSiPct ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.fgCPct ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.fgPPct ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.fgSPct ?? "—"}</TableCell>
                  <TableCell><ResultBadge result={r.result} /></TableCell>
                  <TableCell className="text-right">
                    {r.result === "pending"
                      ? <Button size="sm" variant="outline" onClick={() => openScore(r)}>Score</Button>
                      : <span className="text-xs text-muted-foreground">Locked</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) resetCreate(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New FG Inspection</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Inspection # *</Label>
                <Input value={inspectionNo} onChange={e => setInspectionNo(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Batch #</Label>
                <Input value={batchNo} onChange={e => setBatchNo(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Product</Label>
                <Input value={product} onChange={e => setProduct(e.target.value)} placeholder="e.g. SiMn" />
              </div>
              <div className="space-y-1">
                <Label>Grade</Label>
                <Input value={grade} onChange={e => setGrade(e.target.value)} placeholder="e.g. Mn60" />
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">Observed (%)</div>
              <div className="grid grid-cols-5 gap-2">
                {FG_FIELDS.map(f => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-xs">{f.label}</Label>
                    <Input value={obs[f.key]} onChange={e => setObs({ ...obs, [f.key]: e.target.value })} inputMode="decimal" />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">
                Spec bounds (optional — leave empty to defer scoring as Pending)
              </div>
              <div className="grid grid-cols-5 gap-2">
                {FG_FIELDS.map(f => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-xs">{f.label} min / max</Label>
                    <div className="grid grid-cols-2 gap-1">
                      <Input value={specRows[f.key].min} onChange={e => setSpecRows({ ...specRows, [f.key]: { ...specRows[f.key], min: e.target.value } })} placeholder="min" inputMode="decimal" />
                      <Input value={specRows[f.key].max} onChange={e => setSpecRows({ ...specRows, [f.key]: { ...specRows[f.key], max: e.target.value } })} placeholder="max" inputMode="decimal" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            {livePreview && (
              <div className="flex items-center justify-between rounded-md border p-2">
                <span className="text-xs text-muted-foreground">Live verdict:</span>
                <ResultBadge result={livePreview.result} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Saving…" : "Record inspection"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Score dialog */}
      <Dialog open={!!scoreTarget} onOpenChange={(v) => { if (!v) setScoreTarget(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Score Inspection {scoreTarget?.inspectionNo}</DialogTitle></DialogHeader>
          {scoreTarget && (
            <div className="space-y-3">
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground">Observed (%)</div>
                <div className="grid grid-cols-5 gap-2">
                  {FG_FIELDS.map(f => (
                    <div key={f.key} className="space-y-1">
                      <Label className="text-xs">{f.label}</Label>
                      <Input value={scoreObs[f.key] ?? ""} onChange={e => setScoreObs({ ...scoreObs, [f.key]: e.target.value })} inputMode="decimal" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground">Spec bounds *</div>
                <div className="grid grid-cols-5 gap-2">
                  {FG_FIELDS.map(f => (
                    <div key={f.key} className="space-y-1">
                      <Label className="text-xs">{f.label} min / max</Label>
                      <div className="grid grid-cols-2 gap-1">
                        <Input value={scoreSpecs[f.key].min} onChange={e => setScoreSpecs({ ...scoreSpecs, [f.key]: { ...scoreSpecs[f.key], min: e.target.value } })} placeholder="min" inputMode="decimal" />
                        <Input value={scoreSpecs[f.key].max} onChange={e => setScoreSpecs({ ...scoreSpecs, [f.key]: { ...scoreSpecs[f.key], max: e.target.value } })} placeholder="max" inputMode="decimal" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Input value={scoreNotes} onChange={e => setScoreNotes(e.target.value)} />
              </div>
              {scorePreview && (
                <div className="flex items-center justify-between rounded-md border p-2">
                  <span className="text-xs text-muted-foreground">Verdict preview:</span>
                  <ResultBadge result={scorePreview.result} />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScoreTarget(null)} disabled={saving}>Cancel</Button>
            <Button onClick={handleScore} disabled={saving}>{saving ? "Saving…" : "Save verdict"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
