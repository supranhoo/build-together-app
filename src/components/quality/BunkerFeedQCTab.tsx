/**
 * Bunker Feed QC — Quality Phase B.
 *
 * Pre-consumption test of ore and reductant per bunker (stock location).
 * Observed values are compared to `materials.specs` via evaluateBunkerTest().
 * Verdict: pass | conditional | fail. Recorded with the deviation list so
 * downstream consumption decisions are auditable.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MaterialPicker } from "@/components/MaterialPicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { fetchMaterials, fetchStockLocations, type Material, type StockLocation } from "@/lib/inventory";
import {
  createBunkerTest,
  evaluateBunkerTest,
  fetchBunkerTests,
  fetchMaterialSpecs,
  type BunkerFeedTest,
  type BunkerResult,
  type BunkerSpecMap,
} from "@/lib/quality";

const RESULT_VARIANT: Record<BunkerResult, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  pass:        { label: "Pass",        className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", Icon: CheckCircle2 },
  conditional: { label: "Conditional", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",     Icon: AlertTriangle },
  fail:        { label: "Fail",        className: "bg-destructive/10 text-destructive",                     Icon: XCircle },
};

function ResultBadge({ result }: { result: BunkerResult }) {
  const v = RESULT_VARIANT[result];
  const I = v.Icon;
  return <Badge className={`${v.className} gap-1 border-0`}><I className="h-3 w-3" />{v.label}</Badge>;
}

function numOrNull(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function BunkerFeedQCTab() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();

  const [tests, setTests] = useState<BunkerFeedTest[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [loading, setLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [materialId, setMaterialId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [mnStr, setMnStr] = useState("");
  const [fcStr, setFcStr] = useState("");
  const [moistureStr, setMoistureStr] = useState("");
  const [sizeRange, setSizeRange] = useState("");
  const [notes, setNotes] = useState("");
  const [specs, setSpecs] = useState<BunkerSpecMap>({});
  const [specsLoading, setSpecsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const pcId = activeProfitCenter?.id;
  const userId = session?.user?.id;

  useEffect(() => {
    if (!pcId) return;
    setLoading(true);
    Promise.all([fetchBunkerTests(pcId), fetchMaterials(pcId), fetchStockLocations(pcId)])
      .then(([t, m, l]) => { setTests(t); setMaterials(m); setLocations(l); })
      .catch((e: any) => toast({ title: "Failed to load bunker tests", description: e?.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [pcId, toast]);

  // Refresh material spec book whenever the operator picks a different material.
  useEffect(() => {
    if (!materialId) { setSpecs({}); return; }
    setSpecsLoading(true);
    fetchMaterialSpecs(materialId)
      .then(setSpecs)
      .catch(() => setSpecs({}))
      .finally(() => setSpecsLoading(false));
  }, [materialId]);

  const matById = useMemo(() => new Map(materials.map(m => [m.id, m])), [materials]);
  const locById = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations]);

  // Live preview of the verdict so the operator sees the consequence before saving.
  const livePreview = useMemo(() => {
    if (!materialId) return null;
    return evaluateBunkerTest(
      { mnPct: numOrNull(mnStr), fcPct: numOrNull(fcStr), moisturePct: numOrNull(moistureStr) },
      specs
    );
  }, [materialId, mnStr, fcStr, moistureStr, specs]);

  async function reload() {
    if (!pcId) return;
    setTests(await fetchBunkerTests(pcId));
  }

  function resetForm() {
    setMaterialId(""); setLocationId("");
    setMnStr(""); setFcStr(""); setMoistureStr("");
    setSizeRange(""); setNotes(""); setSpecs({});
  }

  async function handleCreate() {
    if (!pcId || !userId) return;
    if (!materialId || !locationId) {
      toast({ title: "Material and bunker required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createBunkerTest({
        profitCenterId: pcId,
        createdBy: userId,
        materialId,
        stockLocationId: locationId,
        mnPct: numOrNull(mnStr),
        fcPct: numOrNull(fcStr),
        moisturePct: numOrNull(moistureStr),
        sizeRange: sizeRange.trim() || null,
        notes: notes.trim() || null,
        specs,
      });
      toast({ title: "Bunker test recorded" });
      setCreateOpen(false);
      resetForm();
      await reload();
    } catch (e: any) {
      toast({ title: "Create failed", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!pcId) {
    return <p className="text-sm text-muted-foreground">Select a workspace to record bunker feed tests.</p>;
  }

  const hasSpecs = Object.keys(specs).length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>Bunker Feed QC</CardTitle>
          <CardDescription>
            Test ore and reductant per bunker before charging. Verdict is computed from the material's spec book.
          </CardDescription>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New test
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tested</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Bunker</TableHead>
                <TableHead className="text-right">Mn %</TableHead>
                <TableHead className="text-right">FC %</TableHead>
                <TableHead className="text-right">Moisture %</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Deviations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!loading && tests.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">No bunker tests recorded.</TableCell></TableRow>
              )}
              {tests.map(t => {
                const m = matById.get(t.materialId);
                const l = locById.get(t.stockLocationId);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(t.testedAt).toLocaleString()}</TableCell>
                    <TableCell>{m ? `${m.code} — ${m.name}` : "—"}</TableCell>
                    <TableCell>{l ? l.code : "—"}</TableCell>
                    <TableCell className="text-right">{t.mnPct ?? "—"}</TableCell>
                    <TableCell className="text-right">{t.fcPct ?? "—"}</TableCell>
                    <TableCell className="text-right">{t.moisturePct ?? "—"}</TableCell>
                    <TableCell>{t.sizeRange ?? "—"}</TableCell>
                    <TableCell><ResultBadge result={t.result} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t.deviations.length === 0 ? "—" :
                        t.deviations.map(d => (
                          <div key={d.field}>
                            <span className="font-medium">{d.field}</span>: {d.observed ?? "n/a"}
                            {d.expectedMin != null || d.expectedMax != null
                              ? ` (spec ${d.expectedMin ?? "−∞"}…${d.expectedMax ?? "+∞"})` : ""}
                          </div>
                        ))
                      }
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>New Bunker Feed Test</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Material *</Label>
                <MaterialPicker
                  contextKey="quality.bunker"
                  profitCenterId={activeProfitCenter?.id ?? null}
                  materials={materials}
                  value={materialId}
                  onChange={setMaterialId}
                />
              </div>
              <div className="space-y-1">
                <Label>Bunker (location) *</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger><SelectValue placeholder="Pick bunker" /></SelectTrigger>
                  <SelectContent>
                    {locations.map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {materialId && (
              <div className="rounded-md border border-dashed bg-muted/30 p-2 text-xs text-muted-foreground">
                {specsLoading
                  ? "Loading material spec…"
                  : hasSpecs
                    ? <>Spec book loaded: {Object.entries(specs).map(([k, v]) =>
                        <span key={k} className="mr-2">
                          <span className="font-medium text-foreground">{k}</span>{" "}
                          {v?.min ?? "−∞"}…{v?.max ?? "+∞"}
                          {v?.criticalMin != null || v?.criticalMax != null
                            ? <> (crit {v?.criticalMin ?? "−∞"}…{v?.criticalMax ?? "+∞"})</> : null}
                        </span>
                      )}</>
                    : "No spec book on this material — verdict will default to pass."}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Mn %</Label>
                <Input value={mnStr} onChange={e => setMnStr(e.target.value)} inputMode="decimal" />
              </div>
              <div className="space-y-1">
                <Label>FC %</Label>
                <Input value={fcStr} onChange={e => setFcStr(e.target.value)} inputMode="decimal" />
              </div>
              <div className="space-y-1">
                <Label>Moisture %</Label>
                <Input value={moistureStr} onChange={e => setMoistureStr(e.target.value)} inputMode="decimal" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Size range</Label>
                <Input value={sizeRange} onChange={e => setSizeRange(e.target.value)} placeholder="e.g. 6–25 mm" />
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
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
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Saving…" : "Record test"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
