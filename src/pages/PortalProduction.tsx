import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PortalProductionHeatwise from "./PortalProductionHeatwise";
import PortalProductionFurnaceSummary from "./PortalProductionFurnaceSummary";
import PortalProductionMonthly from "./PortalProductionMonthly";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  createHeatLog,
  fetchFurnaces,
  fetchHeatLogs,
  fetchShifts,
  updateHeatLog,
  type Furnace,
  type HeatLog,
  type Shift,
} from "@/lib/production";
import { canEditHeatLogClient, fetchPermissionGrants, userRoleAllows, type PermissionGrant } from "@/lib/permissions";
import {
  fetchMaterials,
  fetchStockLocations,
  recordHeatConsumption,
  type ConsumptionInput,
  type Material,
  type StockLocation,
} from "@/lib/inventory";
import { bulkVoidHeatLogs, userCanAct } from "@/lib/reporting";
import { fetchMasterItems, type MasterItem } from "@/lib/master-data";
import {
  fetchMetallurgy,
  upsertMetallurgy,
  type HeatMetallurgy,
  type HeatMetallurgyStatus,
} from "@/lib/heat-metallurgy";
import { mnBalance, mnInput, type MaterialSpecLookup } from "@/lib/ferro-alloys";
import { fetchProductionAlertThresholds, DEFAULT_PRODUCTION_ALERTS, type ProductionAlertThresholds } from "@/lib/production-alerts";


interface FormState {
  furnaceId: string;
  shiftId: string;
  heatNumber: string;
  tapTime: string;
  weightMt: string;
  powerMwh: string;
  notes: string;
}

interface MetallurgyFormState {
  product: string;
  grade: string;
  tappingNo: string;
  batchNo: string;
  fgMnPct: string;
  slagQtyMt: string;
  slagMnoPct: string;
  dustQtyMt: string;
  dustMnPct: string;
  tappingPowerMwh: string;
  furnacePowerMwh: string;
  auxPowerMwh: string;
  avgPowerFactor: string;
  status: HeatMetallurgyStatus;
}

interface ConsumptionRow extends ConsumptionInput {
  key: string;
}

const emptyForm: FormState = { furnaceId: "", shiftId: "", heatNumber: "", tapTime: "", weightMt: "", powerMwh: "", notes: "" };
const emptyMetallurgy: MetallurgyFormState = {
  product: "", grade: "", tappingNo: "", batchNo: "",
  fgMnPct: "", slagQtyMt: "", slagMnoPct: "", dustQtyMt: "", dustMnPct: "",
  tappingPowerMwh: "", furnacePowerMwh: "", auxPowerMwh: "", avgPowerFactor: "",
  status: "draft",
};

function nowLocalForInput() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function PortalProduction() {
  const { activeProfitCenter } = useWorkspace();
  const { session, profile } = useAuth();
  const { toast } = useToast();

  const [furnaces, setFurnaces] = useState<Furnace[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [logs, setLogs] = useState<HeatLog[]>([]);
  const [grants, setGrants] = useState<PermissionGrant[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [stockLocations, setStockLocations] = useState<StockLocation[]>([]);
  const [filterFurnace, setFilterFurnace] = useState<string>("all");
  const [filterShift, setFilterShift] = useState<string>("all");
  const [filterDate, setFilterDate] = useState<string>("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<HeatLog | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [metallurgy, setMetallurgy] = useState<MetallurgyFormState>(emptyMetallurgy);
  const [existingMetallurgy, setExistingMetallurgy] = useState<HeatMetallurgy | null>(null);
  const [masterItems, setMasterItems] = useState<MasterItem[]>([]);
  const [thresholds, setThresholds] = useState<ProductionAlertThresholds>(DEFAULT_PRODUCTION_ALERTS);
  const [consumption, setConsumption] = useState<ConsumptionRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [canVoid, setCanVoid] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  const loadAll = async () => {
    if (!activeProfitCenter) return;
    setLoading(true);
    try {
      const [f, s, l, g, m, sl, mi, th] = await Promise.all([
        fetchFurnaces(activeProfitCenter.id),
        fetchShifts(activeProfitCenter.id),
        fetchHeatLogs(activeProfitCenter.id, {
          furnaceId: filterFurnace !== "all" ? filterFurnace : undefined,
          shiftId: filterShift !== "all" ? filterShift : undefined,
          date: filterDate || undefined,
        }),
        fetchPermissionGrants(),
        fetchMaterials(activeProfitCenter.id),
        fetchStockLocations(activeProfitCenter.id),
        fetchMasterItems(activeProfitCenter.id),
        fetchProductionAlertThresholds(activeProfitCenter.id).catch(() => DEFAULT_PRODUCTION_ALERTS),
      ]);
      setFurnaces(f);
      setShifts(s);
      setLogs(l);
      setGrants(g);
      setMaterials(m);
      setStockLocations(sl);
      setMasterItems(mi);
      setThresholds(th);
    } catch (error) {
      toast({ title: "Failed to load production data", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    setSelectedIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfitCenter?.id, filterFurnace, filterShift, filterDate]);

  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;
    (async () => {
      const ok = await userCanAct(session.user.id, "heat_log", "void");
      if (!cancelled) setCanVoid(ok);
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const canCreate = useMemo(() => userRoleAllows(grants, profile?.role, "heat_log", "create"), [grants, profile?.role]);
  const canConsume = useMemo(() => userRoleAllows(grants, profile?.role, "inventory", "consume"), [grants, profile?.role]);

  const furnaceLabel = (id: string) => furnaces.find((f) => f.id === id)?.code ?? "—";
  const shiftLabel = (id: string) => shifts.find((s) => s.id === id)?.code ?? "—";

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, tapTime: nowLocalForInput() });
    setMetallurgy(emptyMetallurgy);
    setExistingMetallurgy(null);
    setConsumption([]);
    setCreateOpen(true);
  };

  const openEdit = (log: HeatLog) => {
    setEditing(log);
    setForm({
      furnaceId: log.furnaceId,
      shiftId: log.shiftId,
      heatNumber: log.heatNumber,
      tapTime: log.tapTime.slice(0, 16),
      weightMt: log.weightMt?.toString() ?? "",
      powerMwh: log.powerMwh?.toString() ?? "",
      notes: log.notes ?? "",
    });
    setConsumption([]);
    // Lazy-load metallurgy for the selected heat
    setExistingMetallurgy(null);
    setMetallurgy(emptyMetallurgy);
    fetchMetallurgy(log.id)
      .then((m) => {
        if (!m) return;
        setExistingMetallurgy(m);
        setMetallurgy({
          product: m.product ?? "",
          grade: m.grade ?? "",
          tappingNo: m.tappingNo ?? "",
          batchNo: m.batchNo ?? "",
          fgMnPct: m.fgMnPct?.toString() ?? "",
          slagQtyMt: m.slagQtyMt?.toString() ?? "",
          slagMnoPct: m.slagMnoPct?.toString() ?? "",
          dustQtyMt: m.dustQtyMt?.toString() ?? "",
          dustMnPct: m.dustMnPct?.toString() ?? "",
          tappingPowerMwh: m.tappingPowerMwh?.toString() ?? "",
          furnacePowerMwh: m.furnacePowerMwh?.toString() ?? "",
          auxPowerMwh: m.auxPowerMwh?.toString() ?? "",
          avgPowerFactor: m.avgPowerFactor?.toString() ?? "",
          status: m.status,
        });
      })
      .catch((e) =>
        toast({ title: "Failed to load metallurgy", description: e instanceof Error ? e.message : "", variant: "destructive" }),
      );
    setCreateOpen(true);
  };

  const addConsumptionRow = () => {
    setConsumption((rows) => [...rows, { key: crypto.randomUUID(), materialId: "", stockLocationId: "", quantity: 0 }]);
  };
  const updateConsumptionRow = (key: string, patch: Partial<ConsumptionRow>) => {
    setConsumption((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const removeConsumptionRow = (key: string) => {
    setConsumption((rows) => rows.filter((r) => r.key !== key));
  };

  // Live Mn balance derived from current consumption rows + master item specs +
  // entered output. Pure read; never mutates state.
  const liveBalance = useMemo(() => {
    const specs: Record<string, MaterialSpecLookup> = {};
    for (const mi of masterItems) {
      const s = (mi.specs ?? {}) as Record<string, unknown>;
      specs[mi.id] = {
        mnPct: typeof s.mnPct === "number" ? s.mnPct : Number(s.mnPct ?? NaN),
        moisturePct: typeof s.moisturePct === "number" ? s.moisturePct : Number(s.moisturePct ?? NaN),
        fePct: typeof s.fePct === "number" ? s.fePct : Number(s.fePct ?? NaN),
      };
    }
    const inputMn = mnInput(
      consumption.map((c) => ({ materialId: c.materialId, quantity: Number(c.quantity) || 0 })),
      specs,
    );
    return mnBalance({
      inputMn,
      productionMt: Number(form.weightMt) || 0,
      fgMnPct: Number(metallurgy.fgMnPct) || 0,
      slagQty: Number(metallurgy.slagQtyMt) || 0,
      slagMnoPct: Number(metallurgy.slagMnoPct) || 0,
      dustQty: Number(metallurgy.dustQtyMt) || 0,
      dustMnPct: Number(metallurgy.dustMnPct) || 0,
    });
  }, [masterItems, consumption, form.weightMt, metallurgy]);

  const moistureWarn = useMemo(() => {
    const specsById = new Map(masterItems.map((m) => [m.id, m.specs as Record<string, unknown>]));
    return consumption.some((c) => {
      const s = specsById.get(c.materialId);
      const m = s ? Number(s.moisturePct) : NaN;
      return Number.isFinite(m) && m > thresholds.moistureMaxPct;
    });
  }, [consumption, masterItems, thresholds.moistureMaxPct]);

  const validate = (): string | null => {
    if (!form.furnaceId) return "Furnace is required";
    if (!form.shiftId) return "Shift is required";
    if (!form.heatNumber.trim()) return "Heat number is required";
    if (!form.tapTime) return "Tap time is required";
    for (const r of consumption) {
      if (!r.materialId || !r.stockLocationId) return "Each consumption row needs a material and location";
      if (!Number.isFinite(r.quantity) || r.quantity <= 0) return "Each consumption quantity must be > 0";
    }
    return null;
  };

  const hasMetallurgyInput = (): boolean => {
    return Boolean(
      metallurgy.product || metallurgy.grade || metallurgy.tappingNo || metallurgy.batchNo ||
      metallurgy.fgMnPct || metallurgy.slagQtyMt || metallurgy.slagMnoPct ||
      metallurgy.dustQtyMt || metallurgy.dustMnPct ||
      metallurgy.tappingPowerMwh || metallurgy.furnacePowerMwh || metallurgy.auxPowerMwh ||
      metallurgy.avgPowerFactor,
    );
  };

  const numOrNull = (v: string): number | null => (v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    const err = validate();
    if (err) {
      toast({ title: "Cannot save heat log", description: err, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const tapIso = new Date(form.tapTime).toISOString();
      const weightMt = form.weightMt ? Number(form.weightMt) : null;
      const powerMwh = form.powerMwh ? Number(form.powerMwh) : null;
      let heatLogId: string;
      if (editing) {
        await updateHeatLog(editing.id, {
          heatNumber: form.heatNumber,
          tapTime: tapIso,
          weightMt,
          powerMwh,
          notes: form.notes || null,
        });
        heatLogId = editing.id;
      } else {
        heatLogId = await createHeatLog({
          profitCenterId: activeProfitCenter.id,
          furnaceId: form.furnaceId,
          shiftId: form.shiftId,
          heatNumber: form.heatNumber,
          tapTime: tapIso,
          weightMt,
          powerMwh,
          notes: form.notes || null,
          createdBy: session.user.id,
        });
        if (consumption.length > 0) {
          await recordHeatConsumption({
            heatLogId,
            profitCenterId: activeProfitCenter.id,
            createdBy: session.user.id,
            rows: consumption.map((r) => ({ materialId: r.materialId, stockLocationId: r.stockLocationId, quantity: r.quantity })),
          });
        }
      }

      // Save metallurgy when any field provided OR when an existing draft row needs updating.
      if (hasMetallurgyInput() || existingMetallurgy) {
        await upsertMetallurgy({
          heatLogId,
          profitCenterId: activeProfitCenter.id,
          createdBy: session.user.id,
          product: metallurgy.product || null,
          grade: metallurgy.grade || null,
          tappingNo: metallurgy.tappingNo || null,
          batchNo: metallurgy.batchNo || null,
          fgMnPct: numOrNull(metallurgy.fgMnPct),
          slagQtyMt: numOrNull(metallurgy.slagQtyMt),
          slagMnoPct: numOrNull(metallurgy.slagMnoPct),
          dustQtyMt: numOrNull(metallurgy.dustQtyMt),
          dustMnPct: numOrNull(metallurgy.dustMnPct),
          tappingPowerMwh: numOrNull(metallurgy.tappingPowerMwh),
          furnacePowerMwh: numOrNull(metallurgy.furnacePowerMwh),
          auxPowerMwh: numOrNull(metallurgy.auxPowerMwh),
          avgPowerFactor: numOrNull(metallurgy.avgPowerFactor),
          status: metallurgy.status,
          notes: null,
        });
      }
      toast({ title: editing ? "Heat log updated" : "Heat log recorded" });
      setCreateOpen(false);
      await loadAll();
    } catch (error) {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardHeader><CardTitle>Production</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">Select a workspace to view heat logs.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="data-entry">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
          <TabsTrigger value="data-entry" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Data Entry</TabsTrigger>
          <TabsTrigger value="heatwise" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Heat-wise View</TabsTrigger>
          <TabsTrigger value="furnace" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Furnace Summary</TabsTrigger>
          <TabsTrigger value="monthly" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Monthly Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="data-entry" className="mt-4">
      <Card className="border-border bg-card shadow-panel">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Heat logs — {activeProfitCenter.name}</CardTitle>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} disabled={!canCreate || furnaces.length === 0 || shifts.length === 0}>
                New heat log
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit heat log" : "Record heat log"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Furnace</Label>
                  <Select value={form.furnaceId} onValueChange={(v) => setForm({ ...form, furnaceId: v })} disabled={!!editing}>
                    <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                    <SelectContent>
                      {furnaces.filter((f) => f.isActive).map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.code} — {f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Shift</Label>
                  <Select value={form.shiftId} onValueChange={(v) => setForm({ ...form, shiftId: v })} disabled={!!editing}>
                    <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                    <SelectContent>
                      {shifts.filter((s) => s.isActive).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Heat number</Label>
                  <Input value={form.heatNumber} onChange={(e) => setForm({ ...form, heatNumber: e.target.value })} />
                </div>
                <div>
                  <Label>Tap time</Label>
                  <Input type="datetime-local" value={form.tapTime} onChange={(e) => setForm({ ...form, tapTime: e.target.value })} />
                </div>
                <div>
                  <Label>Weight (MT)</Label>
                  <Input type="number" step="0.001" value={form.weightMt} onChange={(e) => setForm({ ...form, weightMt: e.target.value })} />
                </div>
                <div>
                  <Label>Power (MWh)</Label>
                  <Input type="number" step="0.001" value={form.powerMwh} onChange={(e) => setForm({ ...form, powerMwh: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              {!editing && canConsume && materials.length > 0 && stockLocations.length > 0 && (
                <div className="space-y-2 rounded-md border border-border bg-panel p-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Material consumption (optional)</Label>
                    <Button type="button" size="sm" variant="outline" onClick={addConsumptionRow}>Add row</Button>
                  </div>
                  {consumption.length === 0 && (
                    <p className="text-xs text-muted-foreground">No consumption recorded for this heat.</p>
                  )}
                  {consumption.map((row) => (
                    <div key={row.key} className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_40px]">
                      <Select value={row.materialId} onValueChange={(v) => updateConsumptionRow(row.key, { materialId: v })}>
                        <SelectTrigger><SelectValue placeholder="Material" /></SelectTrigger>
                        <SelectContent>
                          {materials.filter((m) => m.isActive).map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.code} ({m.uom})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={row.stockLocationId} onValueChange={(v) => updateConsumptionRow(row.key, { stockLocationId: v })}>
                        <SelectTrigger><SelectValue placeholder="Location" /></SelectTrigger>
                        <SelectContent>
                          {stockLocations.filter((l) => l.isActive).map((l) => (
                            <SelectItem key={l.id} value={l.id}>{l.code}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input type="number" step="0.001" placeholder="Qty" value={row.quantity || ""} onChange={(e) => updateConsumptionRow(row.key, { quantity: Number(e.target.value) })} />
                      <Button type="button" size="icon" variant="ghost" onClick={() => removeConsumptionRow(row.key)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Metallurgy & Mn balance (Phase 17 — Ferro Alloys) ── */}
              <div className="space-y-3 rounded-md border border-border bg-panel p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Metallurgy & output (optional)</Label>
                  <span className="text-xs text-muted-foreground">
                    Status: {metallurgy.status}
                    {existingMetallurgy?.status === "submitted" && " — read-only"}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div><Label className="text-xs">Product</Label><Input value={metallurgy.product} onChange={(e) => setMetallurgy({ ...metallurgy, product: e.target.value })} disabled={existingMetallurgy?.status === "submitted"} /></div>
                  <div><Label className="text-xs">Grade</Label><Input value={metallurgy.grade} onChange={(e) => setMetallurgy({ ...metallurgy, grade: e.target.value })} disabled={existingMetallurgy?.status === "submitted"} /></div>
                  <div><Label className="text-xs">Tapping #</Label><Input value={metallurgy.tappingNo} onChange={(e) => setMetallurgy({ ...metallurgy, tappingNo: e.target.value })} disabled={existingMetallurgy?.status === "submitted"} /></div>
                  <div><Label className="text-xs">Batch #</Label><Input value={metallurgy.batchNo} onChange={(e) => setMetallurgy({ ...metallurgy, batchNo: e.target.value })} disabled={existingMetallurgy?.status === "submitted"} /></div>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div><Label className="text-xs">FG Mn %</Label><Input type="number" step="0.01" value={metallurgy.fgMnPct} onChange={(e) => setMetallurgy({ ...metallurgy, fgMnPct: e.target.value })} disabled={existingMetallurgy?.status === "submitted"} /></div>
                  <div><Label className="text-xs">Slag (MT)</Label><Input type="number" step="0.001" value={metallurgy.slagQtyMt} onChange={(e) => setMetallurgy({ ...metallurgy, slagQtyMt: e.target.value })} disabled={existingMetallurgy?.status === "submitted"} /></div>
                  <div><Label className="text-xs">Slag MnO %</Label><Input type="number" step="0.01" value={metallurgy.slagMnoPct} onChange={(e) => setMetallurgy({ ...metallurgy, slagMnoPct: e.target.value })} disabled={existingMetallurgy?.status === "submitted"} /></div>
                  <div><Label className="text-xs">Dust (MT)</Label><Input type="number" step="0.001" value={metallurgy.dustQtyMt} onChange={(e) => setMetallurgy({ ...metallurgy, dustQtyMt: e.target.value })} disabled={existingMetallurgy?.status === "submitted"} /></div>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div><Label className="text-xs">Dust Mn %</Label><Input type="number" step="0.01" value={metallurgy.dustMnPct} onChange={(e) => setMetallurgy({ ...metallurgy, dustMnPct: e.target.value })} disabled={existingMetallurgy?.status === "submitted"} /></div>
                  <div><Label className="text-xs">Tapping kWh→MWh</Label><Input type="number" step="0.001" value={metallurgy.tappingPowerMwh} onChange={(e) => setMetallurgy({ ...metallurgy, tappingPowerMwh: e.target.value })} disabled={existingMetallurgy?.status === "submitted"} /></div>
                  <div><Label className="text-xs">Furnace MWh</Label><Input type="number" step="0.001" value={metallurgy.furnacePowerMwh} onChange={(e) => setMetallurgy({ ...metallurgy, furnacePowerMwh: e.target.value })} disabled={existingMetallurgy?.status === "submitted"} /></div>
                  <div><Label className="text-xs">Aux MWh</Label><Input type="number" step="0.001" value={metallurgy.auxPowerMwh} onChange={(e) => setMetallurgy({ ...metallurgy, auxPowerMwh: e.target.value })} disabled={existingMetallurgy?.status === "submitted"} /></div>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div><Label className="text-xs">Avg Power Factor</Label><Input type="number" step="0.001" value={metallurgy.avgPowerFactor} onChange={(e) => setMetallurgy({ ...metallurgy, avgPowerFactor: e.target.value })} disabled={existingMetallurgy?.status === "submitted"} /></div>
                  <div className="sm:col-span-3 flex items-end justify-end gap-2">
                    <Label className="text-xs">Mark as submitted (locks edits)</Label>
                    <Checkbox
                      checked={metallurgy.status === "submitted"}
                      onCheckedChange={(v) => setMetallurgy({ ...metallurgy, status: v === true ? "submitted" : "draft" })}
                      disabled={existingMetallurgy?.status === "submitted"}
                    />
                  </div>
                </div>

                {/* Live Mn balance summary */}
                <div className="rounded-md border border-border bg-background p-3 text-sm">
                  <p className="mb-2 font-semibold">Mn balance (live)</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                    <div>Metal Mn: <span className="font-mono">{liveBalance.metalMn.toFixed(3)}</span> MT</div>
                    <div>Slag Mn: <span className="font-mono">{liveBalance.slagMn.toFixed(3)}</span> MT</div>
                    <div>Dust Mn: <span className="font-mono">{liveBalance.dustMn.toFixed(3)}</span> MT</div>
                    <div>Total out: <span className="font-mono">{liveBalance.totalOutputMn.toFixed(3)}</span> MT</div>
                    <div className={liveBalance.recoveryPct !== null && liveBalance.recoveryPct < thresholds.recoveryMinPct ? "text-destructive font-semibold" : ""}>
                      Recovery: <span className="font-mono">{liveBalance.recoveryPct !== null ? `${liveBalance.recoveryPct.toFixed(2)}%` : "—"}</span>
                    </div>
                    <div>Slag loss: <span className="font-mono">{liveBalance.slagLossPct !== null ? `${liveBalance.slagLossPct.toFixed(2)}%` : "—"}</span></div>
                    <div>Dust loss: <span className="font-mono">{liveBalance.dustLossPct !== null ? `${liveBalance.dustLossPct.toFixed(2)}%` : "—"}</span></div>
                    <div>Diff loss: <span className="font-mono">{liveBalance.diffLossPct !== null ? `${liveBalance.diffLossPct.toFixed(2)}%` : "—"}</span></div>
                  </div>
                  <div className="mt-2 space-y-1">
                    {liveBalance.recoveryPct !== null && liveBalance.recoveryPct < thresholds.recoveryMinPct && (
                      <p className="text-xs text-destructive">⚠ Recovery below {thresholds.recoveryMinPct}% threshold.</p>
                    )}
                    {Number(metallurgy.slagMnoPct) > thresholds.slagMnoMaxPct && (
                      <p className="text-xs text-amber-600">⚠ Slag MnO above {thresholds.slagMnoMaxPct}% threshold.</p>
                    )}
                    {moistureWarn && (
                      <p className="text-xs text-amber-600">⚠ One or more consumption materials exceed {thresholds.moistureMaxPct}% moisture.</p>
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Select value={filterFurnace} onValueChange={setFilterFurnace}>
              <SelectTrigger><SelectValue placeholder="All furnaces" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All furnaces</SelectItem>
                {furnaces.map((f) => <SelectItem key={f.id} value={f.id}>{f.code}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterShift} onValueChange={setFilterShift}>
              <SelectTrigger><SelectValue placeholder="All shifts" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All shifts</SelectItem>
                {shifts.map((s) => <SelectItem key={s.id} value={s.id}>{s.code}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
          </div>

          {canVoid && selectedIds.size > 0 && (
            <div className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-2">
              <p className="text-sm">{selectedIds.size} selected</p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
                <Button size="sm" variant="destructive" onClick={() => setVoidOpen(true)}>
                  Void {selectedIds.size} selected
                </Button>
              </div>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                {canVoid && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        logs.filter((l) => !l.isVoided).length > 0 &&
                        logs.filter((l) => !l.isVoided).every((l) => selectedIds.has(l.id))
                          ? true
                          : selectedIds.size > 0
                          ? "indeterminate"
                          : false
                      }
                      onCheckedChange={(v) => {
                        if (v === true) {
                          setSelectedIds(new Set(logs.filter((l) => !l.isVoided).map((l) => l.id)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                      aria-label="Select all non-voided rows"
                    />
                  </TableHead>
                )}
                <TableHead>Heat #</TableHead>
                <TableHead>Furnace</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead>Tap time</TableHead>
                <TableHead>Weight (MT)</TableHead>
                <TableHead>Power (MWh)</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => {
                const editable = canEditHeatLogClient(grants, profile?.role, log);
                const voided = !!log.isVoided;
                return (
                  <TableRow key={log.id} className={voided ? "opacity-60" : ""}>
                    {canVoid && (
                      <TableCell className="w-10">
                        {!voided ? (
                          <Checkbox
                            checked={selectedIds.has(log.id)}
                            onCheckedChange={(v) => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (v === true) next.add(log.id); else next.delete(log.id);
                                return next;
                              });
                            }}
                            aria-label={`Select heat ${log.heatNumber}`}
                          />
                        ) : null}
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      {log.heatNumber}
                      {voided ? <span className="ml-2 text-xs text-destructive">(voided)</span> : null}
                    </TableCell>
                    <TableCell>{furnaceLabel(log.furnaceId)}</TableCell>
                    <TableCell>{shiftLabel(log.shiftId)}</TableCell>
                    <TableCell>{new Date(log.tapTime).toLocaleString()}</TableCell>
                    <TableCell>{log.weightMt ?? "—"}</TableCell>
                    <TableCell>{log.powerMwh ?? "—"}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" disabled={!editable || voided} onClick={() => openEdit(log)}>Edit</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {logs.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={canVoid ? 8 : 7} className="text-muted-foreground">No heat logs in scope.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {(furnaces.length === 0 || shifts.length === 0) && (
            <p className="text-xs text-muted-foreground">
              An admin must configure at least one furnace and shift in this workspace before heat logs can be recorded.
            </p>
          )}

          <AlertDialog open={voidOpen} onOpenChange={(o) => { if (!o) { setVoidOpen(false); setVoidReason(""); } }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Void {selectedIds.size} heat log{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Voided heat logs are excluded from KPIs but retained for audit. The same reason is recorded against every selected row, grouped by a shared batch identifier. If any row fails, none will be voided.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea
                placeholder="Reason (required, min 3 characters)"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
              />
              <AlertDialogFooter>
                <AlertDialogCancel disabled={voiding}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={voiding || voidReason.trim().length < 3}
                  onClick={async (ev) => {
                    ev.preventDefault();
                    setVoiding(true);
                    try {
                      const result = await bulkVoidHeatLogs(Array.from(selectedIds), voidReason.trim());
                      if (!result.ok) throw new Error(result.error ?? "bulk_failed");
                      toast({ title: `Voided ${result.succeeded ?? selectedIds.size} heat log(s)` });
                      setVoidOpen(false);
                      setVoidReason("");
                      setSelectedIds(new Set());
                      await loadAll();
                    } catch (err) {
                      toast({ title: "Bulk void failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
                    } finally {
                      setVoiding(false);
                    }
                  }}
                >
                  Confirm
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="heatwise" className="mt-4">
          <PortalProductionHeatwise />
        </TabsContent>
        <TabsContent value="furnace" className="mt-4">
          <PortalProductionFurnaceSummary />
        </TabsContent>
        <TabsContent value="monthly" className="mt-4">
          <PortalProductionMonthly />
        </TabsContent>
      </Tabs>
    </div>
  );
}
