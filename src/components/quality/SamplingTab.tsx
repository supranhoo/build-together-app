/**
 * Sampling Management — Quality Phase B.
 *
 * Lifecycle (single source of truth in src/lib/quality.ts):
 *   planned → collected → tested → released | rejected
 *
 * UI keeps the table dense and one click away from action; transitions are
 * gated by canTransitionSample() so disallowed paths can't be issued.
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
import { Plus } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { fetchMaterials, fetchStockLocations, type Material, type StockLocation } from "@/lib/inventory";
import {
  createSample,
  fetchSamples,
  nextSampleStatuses,
  transitionSample,
  type QualitySample,
  type SampleStatus,
} from "@/lib/quality";

const STATUS_VARIANT: Record<SampleStatus, { label: string; className: string }> = {
  planned:   { label: "Planned",   className: "bg-muted text-muted-foreground" },
  collected: { label: "Collected", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  tested:    { label: "Tested",    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  released:  { label: "Released",  className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  rejected:  { label: "Rejected",  className: "bg-destructive/10 text-destructive" },
};

function StatusBadge({ status }: { status: SampleStatus }) {
  const v = STATUS_VARIANT[status];
  return <Badge className={`${v.className} border-0`}>{v.label}</Badge>;
}

export function SamplingTab() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();

  const [samples, setSamples] = useState<QualitySample[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [loading, setLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [sampleNo, setSampleNo] = useState("");
  const [materialId, setMaterialId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [lotRef, setLotRef] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const pcId = activeProfitCenter?.id;
  const userId = session?.user?.id;

  useEffect(() => {
    if (!pcId) return;
    setLoading(true);
    Promise.all([fetchSamples(pcId), fetchMaterials(pcId), fetchStockLocations(pcId)])
      .then(([s, m, l]) => { setSamples(s); setMaterials(m); setLocations(l); })
      .catch((e: any) => toast({ title: "Failed to load samples", description: e?.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [pcId, toast]);

  const matById = useMemo(() => new Map(materials.map(m => [m.id, m])), [materials]);
  const locById = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations]);

  async function reload() {
    if (!pcId) return;
    setSamples(await fetchSamples(pcId));
  }

  async function handleCreate() {
    if (!pcId || !userId) return;
    if (!sampleNo.trim()) {
      toast({ title: "Sample number required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createSample({
        profitCenterId: pcId,
        createdBy: userId,
        sampleNo: sampleNo.trim(),
        materialId: materialId || null,
        stockLocationId: locationId || null,
        lotReference: lotRef.trim() || null,
        notes: notes.trim() || null,
      });
      toast({ title: "Sample created" });
      setCreateOpen(false);
      setSampleNo(""); setMaterialId(""); setLocationId(""); setLotRef(""); setNotes("");
      await reload();
    } catch (e: any) {
      toast({ title: "Create failed", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTransition(s: QualitySample, next: SampleStatus) {
    try {
      await transitionSample({ id: s.id, current: s.status, next });
      toast({ title: `Sample ${next}` });
      await reload();
    } catch (e: any) {
      toast({ title: "Transition failed", description: e?.message, variant: "destructive" });
    }
  }

  if (!pcId) {
    return <p className="text-sm text-muted-foreground">Select a workspace to manage samples.</p>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>Sampling Management</CardTitle>
          <CardDescription>
            Plan, collect, test and release lot samples. Released samples are locked.
          </CardDescription>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New sample
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sample #</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Planned</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!loading && samples.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">No samples yet.</TableCell></TableRow>
              )}
              {samples.map(s => {
                const next = nextSampleStatuses(s.status);
                const mat = s.materialId ? matById.get(s.materialId) : null;
                const loc = s.stockLocationId ? locById.get(s.stockLocationId) : null;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.sampleNo}</TableCell>
                    <TableCell>{mat ? `${mat.code} — ${mat.name}` : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>{loc ? loc.code : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>{s.lotReference ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell><StatusBadge status={s.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(s.plannedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {next.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      {next.map(n => (
                        <Button
                          key={n}
                          size="sm"
                          variant={n === "rejected" ? "destructive" : "outline"}
                          onClick={() => handleTransition(s, n)}
                        >
                          {STATUS_VARIANT[n].label}
                        </Button>
                      ))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Sample</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Sample number *</Label>
              <Input value={sampleNo} onChange={e => setSampleNo(e.target.value)} placeholder="QS-2026-0001" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Material</Label>
                <MaterialPicker
                  contextKey="quality.sampling"
                  profitCenterId={activeProfitCenter?.id ?? null}
                  materials={materials}
                  value={materialId}
                  onChange={setMaterialId}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1">
                <Label>Location</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {locations.map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Lot reference</Label>
              <Input value={lotRef} onChange={e => setLotRef(e.target.value)} placeholder="GRN no., heat no., etc." />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Saving…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
