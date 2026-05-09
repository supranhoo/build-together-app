/**
 * CLU heat-entry sheet — drives the 21-step lifecycle for a single heat.
 *
 * Renders a left rail of steps (read-only navigation) and a right pane with
 * phase-specific forms (header / charge / blow / sample / output / energy /
 * delays / submit). Status transitions go through `transitionHeat` so RLS
 * stays the source of truth for who can approve/reject/void.
 *
 * Mn balance is computed live via `computeCluBalance` and is purely advisory
 * — it does not block submission (matching the FAD module behaviour).
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { CLU_LIFECYCLE, TOTAL_STEPS, phaseForStep, type CluPhase } from "@/lib/clu-lifecycle";
import { computeCluBalance } from "@/lib/clu-calc";
import {
  upsertHeat,
  fetchAdditions,
  fetchBlowingData,
  fetchSampling,
  fetchOutput,
  fetchDelays,
  addAddition,
  addBlowingTick,
  addSampling,
  saveOutput,
  logDelay,
  transitionHeat,
  type CluHeatRecord,
  type CluHeatStatus,
  type CluAdditionRecord,
  type CluBlowingRecord,
  type CluSamplingRecord,
  type CluOutputRecord,
  type CluDelayRecord,
  type CluAdditionCategory,
  type CluSampleType,
  type CluDelayCategory,
} from "@/lib/clu-production";

interface Props {
  open: boolean;
  heat: CluHeatRecord | null;
  profitCenterId: string;
  isAdmin: boolean;
  onClose: () => void;
  onChanged: () => void;
}

const ADDITION_CATEGORIES: CluAdditionCategory[] = ["flux", "reductant", "paste", "alloy", "ore"];
const SAMPLE_TYPES: CluSampleType[] = ["initial", "mid", "final"];
const DELAY_CATEGORIES: CluDelayCategory[] = ["MECHANICAL", "PROCESS", "MATERIAL", "POWER", "MANPOWER", "OTHER"];

const numOrNull = (v: string): number | null => {
  if (v === "" || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function CluHeatEntrySheet({ open, heat, profitCenterId, isAdmin, onClose, onChanged }: Props) {
  const { toast } = useToast();
  const { session } = useAuth();
  const userId = session?.user.id ?? "";

  const [stepIndex, setStepIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  // Header fields
  const [heatNumber, setHeatNumber] = useState("");
  const [heatDate, setHeatDate] = useState("");
  const [grade, setGrade] = useState("");
  const [productName, setProductName] = useState("");
  const [tappingNo, setTappingNo] = useState("");
  const [batchNo, setBatchNo] = useState("");

  // Energy fields
  const [tappingPower, setTappingPower] = useState("");
  const [furnacePower, setFurnacePower] = useState("");
  const [auxPower, setAuxPower] = useState("");
  const [powerFactor, setPowerFactor] = useState("");

  // Heat status (mirrors record once saved)
  const [status, setStatus] = useState<CluHeatStatus>("draft");
  const [heatId, setHeatId] = useState<string | null>(null);

  // Child collections
  const [additions, setAdditions] = useState<CluAdditionRecord[]>([]);
  const [blowing, setBlowing] = useState<CluBlowingRecord[]>([]);
  const [samples, setSamples] = useState<CluSamplingRecord[]>([]);
  const [output, setOutput] = useState<CluOutputRecord | null>(null);
  const [delays, setDelays] = useState<CluDelayRecord[]>([]);

  // Reset when heat changes
  useEffect(() => {
    if (!open) return;
    setStepIndex(heat?.currentStepIndex ?? 0);
    setHeatNumber(heat?.heatNumber ?? "");
    setHeatDate(heat?.heatDate ?? new Date().toISOString().slice(0, 10));
    setGrade(heat?.grade ?? "");
    setProductName(heat?.productName ?? "");
    setTappingNo(heat?.tappingNo ?? "");
    setBatchNo(heat?.batchNo ?? "");
    setTappingPower(heat?.tappingPowerMwh?.toString() ?? "");
    setFurnacePower(heat?.furnacePowerMwh?.toString() ?? "");
    setAuxPower(heat?.auxiliaryPowerMwh?.toString() ?? "");
    setPowerFactor(heat?.avgPowerFactor?.toString() ?? "");
    setStatus(heat?.status ?? "draft");
    setHeatId(heat?.id ?? null);
    if (!heat?.id) {
      setAdditions([]);
      setBlowing([]);
      setSamples([]);
      setOutput(null);
      setDelays([]);
      return;
    }
    setLoading(true);
    Promise.all([
      fetchAdditions(heat.id),
      fetchBlowingData(heat.id),
      fetchSampling(heat.id),
      fetchOutput(heat.id),
      fetchDelays(profitCenterId),
    ])
      .then(([a, b, s, o, d]) => {
        setAdditions(a);
        setBlowing(b);
        setSamples(s);
        setOutput(o);
        setDelays(d.filter((x) => x.heatId === heat.id));
      })
      .catch((e) => toast({ title: "Failed to load heat", description: String(e), variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [open, heat?.id, profitCenterId, toast]);

  const phase: CluPhase = phaseForStep(stepIndex);
  const readOnly = status !== "draft";

  const balance = useMemo(
    () =>
      computeCluBalance(
        additions
          .filter((a) => a.category !== "alloy")
          .map((a) => ({ qtyWet: a.quantity, moisturePct: a.moisturePct ?? 0, mnPct: a.mnPct ?? 0 })),
        {
          productionQtyMt: output?.productionQtyMt ?? 0,
          fgMnPct: output?.fgMnPct ?? 0,
          slagQtyMt: output?.slagQtyMt ?? 0,
          slagMnoPct: output?.slagMnoPct ?? 0,
          dustQtyMt: output?.dustQtyMt ?? 0,
          dustMnPct: output?.dustMnPct ?? 0,
        },
      ),
    [additions, output],
  );

  async function handleSaveDraft(advance: boolean) {
    if (!heatNumber.trim()) {
      toast({ title: "Heat number required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const id = await upsertHeat({
        id: heatId ?? undefined,
        profitCenterId,
        heatNumber: heatNumber.trim(),
        heatDate,
        grade: grade || null,
        productName: productName || null,
        tappingNo: tappingNo || null,
        batchNo: batchNo || null,
        currentStepIndex: advance ? Math.min(stepIndex + 1, TOTAL_STEPS - 1) : stepIndex,
        status,
        tappingPowerMwh: numOrNull(tappingPower),
        furnacePowerMwh: numOrNull(furnacePower),
        auxiliaryPowerMwh: numOrNull(auxPower),
        avgPowerFactor: numOrNull(powerFactor),
        createdBy: userId,
      });
      setHeatId(id);
      if (advance) setStepIndex((i) => Math.min(i + 1, TOTAL_STEPS - 1));
      toast({ title: "Draft saved" });
      onChanged();
    } catch (e) {
      toast({ title: "Save failed", description: String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function handleTransition(t: "submit" | "approve" | "reject" | "void", reason?: string) {
    if (!heatId) {
      toast({ title: "Save the draft first", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const next = await transitionHeat({
        heatId,
        currentStatus: status,
        transition: t,
        reason,
        actorUserId: userId,
      });
      setStatus(next);
      toast({ title: `Heat ${t}ed` });
      onChanged();
      if (t !== "submit") onClose();
    } catch (e) {
      toast({ title: "Action failed", description: String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function reloadChildren() {
    if (!heatId) return;
    const [a, b, s, o] = await Promise.all([
      fetchAdditions(heatId),
      fetchBlowingData(heatId),
      fetchSampling(heatId),
      fetchOutput(heatId),
    ]);
    setAdditions(a);
    setBlowing(b);
    setSamples(s);
    setOutput(o);
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="flex w-full max-w-5xl flex-col gap-4 overflow-y-auto sm:max-w-5xl">
        <SheetHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <SheetTitle>{heatId ? `Heat ${heatNumber || "(unsaved)"}` : "New CLU heat"}</SheetTitle>
              <SheetDescription>
                Step {stepIndex + 1} of {TOTAL_STEPS} · {CLU_LIFECYCLE[stepIndex].label}
              </SheetDescription>
            </div>
            <Badge variant={status === "approved" ? "default" : status === "draft" ? "outline" : "secondary"}>
              {status.replace("_", " ")}
            </Badge>
          </div>
        </SheetHeader>

        <div className="grid flex-1 gap-4 lg:grid-cols-[220px_1fr]">
          <StepRail stepIndex={stepIndex} onSelect={setStepIndex} />

          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <>
                {phase === "header" && (
                  <HeaderForm
                    heatNumber={heatNumber}
                    setHeatNumber={setHeatNumber}
                    heatDate={heatDate}
                    setHeatDate={setHeatDate}
                    grade={grade}
                    setGrade={setGrade}
                    productName={productName}
                    setProductName={setProductName}
                    tappingNo={tappingNo}
                    setTappingNo={setTappingNo}
                    batchNo={batchNo}
                    setBatchNo={setBatchNo}
                    readOnly={readOnly}
                  />
                )}

                {phase === "charge" && heatId && (
                  <AdditionsPanel
                    additions={additions}
                    onAdd={async (input) => {
                      await addAddition({ ...input, profitCenterId, heatId, createdBy: userId });
                      await reloadChildren();
                    }}
                    readOnly={readOnly}
                  />
                )}

                {phase === "blow" && heatId && (
                  <BlowingPanel
                    rows={blowing}
                    onAdd={async (oxygenFlow, temperatureC, carbonPct) => {
                      await addBlowingTick({
                        profitCenterId,
                        heatId,
                        oxygenFlow,
                        temperatureC,
                        carbonPct,
                        createdBy: userId,
                      });
                      await reloadChildren();
                    }}
                    readOnly={readOnly}
                  />
                )}

                {phase === "sample" && heatId && (
                  <SamplingPanel
                    rows={samples}
                    onAdd={async (input) => {
                      await addSampling({ ...input, profitCenterId, heatId, createdBy: userId });
                      await reloadChildren();
                    }}
                    readOnly={readOnly}
                  />
                )}

                {(phase === "tap" || phase === "output") && heatId && (
                  <OutputPanel
                    output={output}
                    balance={balance}
                    onSave={async (input) => {
                      await saveOutput({ ...input, profitCenterId, heatId, createdBy: userId });
                      await reloadChildren();
                    }}
                    readOnly={readOnly}
                  />
                )}

                {phase === "energy" && (
                  <EnergyForm
                    tappingPower={tappingPower}
                    setTappingPower={setTappingPower}
                    furnacePower={furnacePower}
                    setFurnacePower={setFurnacePower}
                    auxPower={auxPower}
                    setAuxPower={setAuxPower}
                    powerFactor={powerFactor}
                    setPowerFactor={setPowerFactor}
                    readOnly={readOnly}
                  />
                )}

                {phase === "delays" && heatId && (
                  <DelaysPanel
                    rows={delays}
                    onAdd={async (input) => {
                      await logDelay({ ...input, profitCenterId, heatId, createdBy: userId });
                      const all = await fetchDelays(profitCenterId);
                      setDelays(all.filter((x) => x.heatId === heatId));
                    }}
                    readOnly={readOnly}
                  />
                )}

                {phase === "submit" && (
                  <SubmitPanel
                    balance={balance}
                    additionsCount={additions.length}
                    samplesCount={samples.length}
                    hasOutput={Boolean(output)}
                    status={status}
                  />
                )}

                {!heatId && phase !== "header" && (
                  <Card><CardContent className="py-6 text-sm text-muted-foreground">Save the heat header first to unlock this step.</CardContent></Card>
                )}
              </>
            )}
          </div>
        </div>

        <ActionBar
          status={status}
          isAdmin={isAdmin}
          stepIndex={stepIndex}
          setStepIndex={setStepIndex}
          busy={busy}
          onSaveDraft={handleSaveDraft}
          onTransition={handleTransition}
          canSubmit={Boolean(heatId)}
        />
      </SheetContent>
    </Sheet>
  );
}

// ---------- Step rail ----------
function StepRail({ stepIndex, onSelect }: { stepIndex: number; onSelect: (i: number) => void }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2 text-sm">
      <ol className="space-y-1">
        {CLU_LIFECYCLE.map((s) => {
          const active = s.index === stepIndex;
          const done = s.index < stepIndex;
          return (
            <li key={s.index}>
              <button
                type="button"
                onClick={() => onSelect(s.index)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition ${
                  active ? "bg-primary text-primary-foreground" : done ? "text-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px]">
                  {s.index + 1}
                </span>
                <span className="truncate text-xs">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------- Header form ----------
function HeaderForm(props: {
  heatNumber: string; setHeatNumber: (v: string) => void;
  heatDate: string; setHeatDate: (v: string) => void;
  grade: string; setGrade: (v: string) => void;
  productName: string; setProductName: (v: string) => void;
  tappingNo: string; setTappingNo: (v: string) => void;
  batchNo: string; setBatchNo: (v: string) => void;
  readOnly: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Heat header</CardTitle>
        <CardDescription>Identifies the heat across blowing, sampling, output and approval steps.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Field label="Heat number *">
          <Input value={props.heatNumber} onChange={(e) => props.setHeatNumber(e.target.value)} disabled={props.readOnly} />
        </Field>
        <Field label="Heat date">
          <Input type="date" value={props.heatDate} onChange={(e) => props.setHeatDate(e.target.value)} disabled={props.readOnly} />
        </Field>
        <Field label="Grade">
          <Input value={props.grade} onChange={(e) => props.setGrade(e.target.value)} disabled={props.readOnly} />
        </Field>
        <Field label="Product name">
          <Input value={props.productName} onChange={(e) => props.setProductName(e.target.value)} disabled={props.readOnly} />
        </Field>
        <Field label="Tapping #">
          <Input value={props.tappingNo} onChange={(e) => props.setTappingNo(e.target.value)} disabled={props.readOnly} />
        </Field>
        <Field label="Batch #">
          <Input value={props.batchNo} onChange={(e) => props.setBatchNo(e.target.value)} disabled={props.readOnly} />
        </Field>
      </CardContent>
    </Card>
  );
}

// ---------- Energy ----------
function EnergyForm(props: {
  tappingPower: string; setTappingPower: (v: string) => void;
  furnacePower: string; setFurnacePower: (v: string) => void;
  auxPower: string; setAuxPower: (v: string) => void;
  powerFactor: string; setPowerFactor: (v: string) => void;
  readOnly: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Energy summary</CardTitle>
        <CardDescription>Saved with the heat header on next save.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Field label="Tapping power (MWh)">
          <Input type="number" step="0.01" value={props.tappingPower} onChange={(e) => props.setTappingPower(e.target.value)} disabled={props.readOnly} />
        </Field>
        <Field label="Furnace power (MWh)">
          <Input type="number" step="0.01" value={props.furnacePower} onChange={(e) => props.setFurnacePower(e.target.value)} disabled={props.readOnly} />
        </Field>
        <Field label="Auxiliary power (MWh)">
          <Input type="number" step="0.01" value={props.auxPower} onChange={(e) => props.setAuxPower(e.target.value)} disabled={props.readOnly} />
        </Field>
        <Field label="Avg power factor">
          <Input type="number" step="0.01" value={props.powerFactor} onChange={(e) => props.setPowerFactor(e.target.value)} disabled={props.readOnly} />
        </Field>
      </CardContent>
    </Card>
  );
}

// ---------- Additions ----------
function AdditionsPanel({
  additions,
  onAdd,
  readOnly,
}: {
  additions: CluAdditionRecord[];
  onAdd: (input: { category: CluAdditionCategory; materialName: string; quantity: number; uom: string; moisturePct: number | null; mnPct: number | null; fcPct: number | null }) => Promise<void>;
  readOnly: boolean;
}) {
  const [category, setCategory] = useState<CluAdditionCategory>("flux");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [moisture, setMoisture] = useState("");
  const [mn, setMn] = useState("");
  const [fc, setFc] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function submit() {
    const q = Number(qty);
    if (!name.trim() || !Number.isFinite(q) || q <= 0) {
      toast({ title: "Material name and positive quantity are required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await onAdd({
        category,
        materialName: name.trim(),
        quantity: q,
        uom: "kg",
        moisturePct: numOrNull(moisture),
        mnPct: numOrNull(mn),
        fcPct: numOrNull(fc),
      });
      setName(""); setQty(""); setMoisture(""); setMn(""); setFc("");
    } catch (e) {
      toast({ title: "Add failed", description: String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Additions</CardTitle>
        <CardDescription>Flux, reductant, paste, alloy and ore additions feed the live Mn balance.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readOnly && (
          <div className="grid gap-2 sm:grid-cols-7">
            <Select value={category} onValueChange={(v) => setCategory(v as CluAdditionCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ADDITION_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Material" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="Qty (kg)" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
            <Input placeholder="Moisture %" type="number" value={moisture} onChange={(e) => setMoisture(e.target.value)} />
            <Input placeholder="Mn %" type="number" value={mn} onChange={(e) => setMn(e.target.value)} />
            <Input placeholder="FC %" type="number" value={fc} onChange={(e) => setFc(e.target.value)} />
            <Button onClick={submit} disabled={busy} size="sm">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-4 w-4" />Add</>}
            </Button>
          </div>
        )}
        {additions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No additions logged yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Moist %</TableHead>
                <TableHead className="text-right">Mn %</TableHead>
                <TableHead className="text-right">FC %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {additions.map((a) => (
                <TableRow key={a.id}>
                  <TableCell><Badge variant="outline">{a.category}</Badge></TableCell>
                  <TableCell>{a.materialName}</TableCell>
                  <TableCell className="text-right">{a.quantity}</TableCell>
                  <TableCell className="text-right">{a.moisturePct ?? "—"}</TableCell>
                  <TableCell className="text-right">{a.mnPct ?? "—"}</TableCell>
                  <TableCell className="text-right">{a.fcPct ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Blowing ----------
function BlowingPanel({
  rows,
  onAdd,
  readOnly,
}: {
  rows: CluBlowingRecord[];
  onAdd: (oxygenFlow: number | null, temperatureC: number | null, carbonPct: number | null) => Promise<void>;
  readOnly: boolean;
}) {
  const [o2, setO2] = useState("");
  const [t, setT] = useState("");
  const [c, setC] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function submit() {
    setBusy(true);
    try {
      await onAdd(numOrNull(o2), numOrNull(t), numOrNull(c));
      setO2(""); setT(""); setC("");
    } catch (e) {
      toast({ title: "Failed to log tick", description: String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Blowing data</CardTitle>
        <CardDescription>Time-series oxygen, temperature and carbon readings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readOnly && (
          <div className="grid gap-2 sm:grid-cols-4">
            <Input placeholder="O₂ flow" type="number" value={o2} onChange={(e) => setO2(e.target.value)} />
            <Input placeholder="Temp °C" type="number" value={t} onChange={(e) => setT(e.target.value)} />
            <Input placeholder="C %" type="number" value={c} onChange={(e) => setC(e.target.value)} />
            <Button size="sm" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-4 w-4" />Tick</>}
            </Button>
          </div>
        )}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ticks recorded.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">O₂</TableHead>
                <TableHead className="text-right">Temp</TableHead>
                <TableHead className="text-right">C %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.recordedAt).toLocaleTimeString()}</TableCell>
                  <TableCell className="text-right">{r.oxygenFlow ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.temperatureC ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.carbonPct ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Sampling ----------
function SamplingPanel({
  rows,
  onAdd,
  readOnly,
}: {
  rows: CluSamplingRecord[];
  onAdd: (input: { sampleType: CluSampleType; mnPct: number | null; cPct: number | null; siPct: number | null; pPct: number | null; sPct: number | null; temperatureC: number | null }) => Promise<void>;
  readOnly: boolean;
}) {
  const [type, setType] = useState<CluSampleType>("initial");
  const [mn, setMn] = useState(""); const [c, setC] = useState(""); const [si, setSi] = useState("");
  const [p, setP] = useState(""); const [s, setS] = useState(""); const [t, setT] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await onAdd({
        sampleType: type,
        mnPct: numOrNull(mn), cPct: numOrNull(c), siPct: numOrNull(si),
        pPct: numOrNull(p), sPct: numOrNull(s), temperatureC: numOrNull(t),
      });
      setMn(""); setC(""); setSi(""); setP(""); setS(""); setT("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Sampling</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {!readOnly && (
          <div className="grid gap-2 sm:grid-cols-7">
            <Select value={type} onValueChange={(v) => setType(v as CluSampleType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SAMPLE_TYPES.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Mn %" type="number" value={mn} onChange={(e) => setMn(e.target.value)} />
            <Input placeholder="C %" type="number" value={c} onChange={(e) => setC(e.target.value)} />
            <Input placeholder="Si %" type="number" value={si} onChange={(e) => setSi(e.target.value)} />
            <Input placeholder="P %" type="number" value={p} onChange={(e) => setP(e.target.value)} />
            <Input placeholder="S %" type="number" value={s} onChange={(e) => setS(e.target.value)} />
            <Button size="sm" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        )}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No samples taken.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead><TableHead className="text-right">Mn</TableHead>
                <TableHead className="text-right">C</TableHead><TableHead className="text-right">Si</TableHead>
                <TableHead className="text-right">P</TableHead><TableHead className="text-right">S</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Badge variant="outline">{r.sampleType}</Badge></TableCell>
                  <TableCell className="text-right">{r.mnPct ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.cPct ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.siPct ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.pPct ?? "—"}</TableCell>
                  <TableCell className="text-right">{r.sPct ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Output + balance ----------
function OutputPanel({
  output,
  balance,
  onSave,
  readOnly,
}: {
  output: CluOutputRecord | null;
  balance: ReturnType<typeof computeCluBalance>;
  onSave: (input: { productionQtyMt: number; fgMnPct: number | null; slagQtyMt: number; slagMnoPct: number | null; dustQtyMt: number; dustMnPct: number | null }) => Promise<void>;
  readOnly: boolean;
}) {
  const [prod, setProd] = useState(output?.productionQtyMt?.toString() ?? "");
  const [fgMn, setFgMn] = useState(output?.fgMnPct?.toString() ?? "");
  const [slag, setSlag] = useState(output?.slagQtyMt?.toString() ?? "");
  const [slagMno, setSlagMno] = useState(output?.slagMnoPct?.toString() ?? "");
  const [dust, setDust] = useState(output?.dustQtyMt?.toString() ?? "");
  const [dustMn, setDustMn] = useState(output?.dustMnPct?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setProd(output?.productionQtyMt?.toString() ?? "");
    setFgMn(output?.fgMnPct?.toString() ?? "");
    setSlag(output?.slagQtyMt?.toString() ?? "");
    setSlagMno(output?.slagMnoPct?.toString() ?? "");
    setDust(output?.dustQtyMt?.toString() ?? "");
    setDustMn(output?.dustMnPct?.toString() ?? "");
  }, [output?.id]);

  async function submit() {
    const p = Number(prod), s = Number(slag), d = Number(dust);
    if (!Number.isFinite(p) || p < 0) {
      toast({ title: "Production qty must be ≥ 0", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await onSave({
        productionQtyMt: p,
        fgMnPct: numOrNull(fgMn),
        slagQtyMt: Number.isFinite(s) ? s : 0,
        slagMnoPct: numOrNull(slagMno),
        dustQtyMt: Number.isFinite(d) ? d : 0,
        dustMnPct: numOrNull(dustMn),
      });
      toast({ title: "Output saved" });
    } catch (e) {
      toast({ title: "Save failed", description: String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Output</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Production qty (MT) *">
            <Input type="number" step="0.001" value={prod} onChange={(e) => setProd(e.target.value)} disabled={readOnly} />
          </Field>
          <Field label="FG Mn %">
            <Input type="number" step="0.01" value={fgMn} onChange={(e) => setFgMn(e.target.value)} disabled={readOnly} />
          </Field>
          <Field label="Slag qty (MT)">
            <Input type="number" step="0.001" value={slag} onChange={(e) => setSlag(e.target.value)} disabled={readOnly} />
          </Field>
          <Field label="Slag MnO %">
            <Input type="number" step="0.01" value={slagMno} onChange={(e) => setSlagMno(e.target.value)} disabled={readOnly} />
          </Field>
          <Field label="Dust qty (MT)">
            <Input type="number" step="0.001" value={dust} onChange={(e) => setDust(e.target.value)} disabled={readOnly} />
          </Field>
          <Field label="Dust Mn %">
            <Input type="number" step="0.01" value={dustMn} onChange={(e) => setDustMn(e.target.value)} disabled={readOnly} />
          </Field>
          {!readOnly && (
            <div className="sm:col-span-2">
              <Button onClick={submit} disabled={busy} size="sm">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save output"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Mn balance</CardTitle>
          <CardDescription>Computed from additions and output. Advisory; does not block submit.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Stat label="Total Mn input" value={balance.totalMnInput.toFixed(2)} />
          <Stat label="Mn recovery %" value={balance.mnRecoveryPct.toFixed(2)} />
          <Stat label="Performance" value={balance.performanceTag} />
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Delays ----------
function DelaysPanel({
  rows,
  onAdd,
  readOnly,
}: {
  rows: CluDelayRecord[];
  onAdd: (input: { category: CluDelayCategory; startedAt: string; endedAt: string | null; reason: string }) => Promise<void>;
  readOnly: boolean;
}) {
  const [cat, setCat] = useState<CluDelayCategory>("PROCESS");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 16));
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  async function submit() {
    if (reason.trim().length < 3) {
      toast({ title: "Reason is required (min 3 chars)", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await onAdd({
        category: cat,
        startedAt: new Date(start).toISOString(),
        endedAt: end ? new Date(end).toISOString() : null,
        reason: reason.trim(),
      });
      setReason(""); setEnd("");
    } catch (e) {
      toast({ title: "Log failed", description: String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Delays for this heat</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {!readOnly && (
          <div className="grid gap-2 sm:grid-cols-5">
            <Select value={cat} onValueChange={(v) => setCat(v as CluDelayCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DELAY_CATEGORIES.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Log"}
            </Button>
          </div>
        )}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No delays for this heat.</p>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Started</TableHead><TableHead>Cat</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Min</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.startedAt).toLocaleString()}</TableCell>
                  <TableCell><Badge variant="outline">{r.category}</Badge></TableCell>
                  <TableCell className="max-w-md truncate">{r.reason}</TableCell>
                  <TableCell className="text-right">{r.durationMin ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Submit panel ----------
function SubmitPanel({
  balance,
  additionsCount,
  samplesCount,
  hasOutput,
  status,
}: {
  balance: ReturnType<typeof computeCluBalance>;
  additionsCount: number;
  samplesCount: number;
  hasOutput: boolean;
  status: CluHeatStatus;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review &amp; submit</CardTitle>
        <CardDescription>Status: {status.replace("_", " ")}.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <Stat label="Additions" value={additionsCount.toString()} />
        <Stat label="Samples" value={samplesCount.toString()} />
        <Stat label="Output saved" value={hasOutput ? "Yes" : "No"} />
        <Stat label="Mn recovery %" value={balance.mnRecoveryPct.toFixed(2)} />
        <Stat label="Total balance %" value={balance.totalBalancePct.toFixed(2)} />
        <Stat label="Performance" value={balance.performanceTag} />
      </CardContent>
    </Card>
  );
}

// ---------- Action bar ----------
function ActionBar({
  status,
  isAdmin,
  stepIndex,
  setStepIndex,
  busy,
  onSaveDraft,
  onTransition,
  canSubmit,
}: {
  status: CluHeatStatus;
  isAdmin: boolean;
  stepIndex: number;
  setStepIndex: (i: number) => void;
  busy: boolean;
  onSaveDraft: (advance: boolean) => Promise<void>;
  onTransition: (t: "submit" | "approve" | "reject" | "void", reason?: string) => Promise<void>;
  canSubmit: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setStepIndex(Math.max(0, stepIndex - 1))} disabled={stepIndex === 0}>
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>
        <Button variant="outline" size="sm" onClick={() => setStepIndex(Math.min(TOTAL_STEPS - 1, stepIndex + 1))} disabled={stepIndex === TOTAL_STEPS - 1}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {status === "draft" && (
          <>
            <Button variant="outline" size="sm" onClick={() => onSaveDraft(false)} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save draft"}
            </Button>
            <Button size="sm" onClick={() => onSaveDraft(true)} disabled={busy}>
              Save &amp; advance
            </Button>
            <Button size="sm" variant="default" onClick={() => onTransition("submit")} disabled={busy || !canSubmit}>
              Submit for approval
            </Button>
          </>
        )}
        {status === "pending_approval" && isAdmin && (
          <>
            <Button size="sm" onClick={() => onTransition("approve")} disabled={busy}>Approve</Button>
            <Button size="sm" variant="destructive" onClick={() => {
              const reason = window.prompt("Rejection reason (min 3 chars)");
              if (reason) onTransition("reject", reason);
            }} disabled={busy}>Reject</Button>
          </>
        )}
        {status === "approved" && isAdmin && (
          <Button size="sm" variant="destructive" onClick={() => {
            const reason = window.prompt("Void reason (min 3 chars)");
            if (reason) onTransition("void", reason);
          }} disabled={busy}>Void</Button>
        )}
      </div>
    </div>
  );
}

// ---------- Small helpers ----------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}
