import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Calculator, CheckCircle2, FlaskConical, Loader2, Plus, Save, Trash2 } from "lucide-react";

import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

import { fetchFurnaces, fetchShifts, type Furnace, type Shift } from "@/lib/production";
import { fetchStockLocations, type StockLocation } from "@/lib/inventory";
import { fetchMasterItems, type MasterItem } from "@/lib/master-data";
import { mnBalance, mnInput as mnInputCalc, type MaterialSpecLookup } from "@/lib/ferro-alloys";
import { fetchProductionAlertThresholds, DEFAULT_PRODUCTION_ALERTS, type ProductionAlertThresholds } from "@/lib/production-alerts";
import {
  classifyMaterial,
  DEFAULT_PRODUCTION_FORMULAS,
  fetchProductionFormulaDefaults,
  type ProductionFormulaDefaults,
} from "@/lib/production-formulas";
import { submitFadEntry, FadEntryError } from "@/lib/production-entry-fad";
import { resolveFadItemSpecs, validateFadConsumption, type FadConsumptionRowForValidation } from "@/lib/fad-spec-resolver";

import PortalProductionHeatwise from "./PortalProductionHeatwise";
import PortalProductionFurnaceSummary from "./PortalProductionFurnaceSummary";
import PortalProductionMonthly from "./PortalProductionMonthly";

type EntryStep = "ore" | "reductant" | "flux_paste" | "output";

interface OreRow {
  id: string;
  materialId: string;
  qtyWetMt: number;
  mnPct: number;
  moisturePct: number;
}

interface ReductantRow {
  id: string;
  materialId: string;
  type: "Coke" | "Coal" | "Char";
  qty: number;
  unit: "MT" | "Kg";
  fcPct: number;
  vmPct: number;
  ashPct: number;
  moisturePct: number;
}

interface FluxRow {
  id: string;
  materialId: string;
  qtyMt: number;
  moisturePct: number;
}

interface PasteRow {
  id: string;
  materialId: string;
  qtyKg: number;
}

const newId = () => Math.random().toString(36).slice(2);

const fmtPct = (v: number | null) => (v === null ? "—" : `${v.toFixed(2)}%`);

function recoveryColor(pct: number | null, minOk: number): string {
  if (pct === null) return "text-muted-foreground";
  if (pct === 0) return "text-muted-foreground";
  if (pct < minOk) return "text-destructive font-bold";
  if (pct < minOk + 5) return "text-amber-600 font-bold";
  return "text-emerald-600 font-bold";
}

export default function PortalProductionFAD() {
  const { activeProfitCenter, activeProfitCenterId } = useWorkspace();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { toast } = useToast();

  // ---- Master data ----
  const [furnaces, setFurnaces] = useState<Furnace[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [stockLocations, setStockLocations] = useState<StockLocation[]>([]);
  const [materials, setMaterials] = useState<MasterItem[]>([]);
  const [thresholds, setThresholds] = useState<ProductionAlertThresholds>(DEFAULT_PRODUCTION_ALERTS);
  const [formulas, setFormulas] = useState<ProductionFormulaDefaults>(DEFAULT_PRODUCTION_FORMULAS);
  const [loadingMasters, setLoadingMasters] = useState(true);

  useEffect(() => {
    if (!activeProfitCenterId) return;
    let cancelled = false;
    setLoadingMasters(true);
    Promise.all([
      fetchFurnaces(activeProfitCenterId),
      fetchShifts(activeProfitCenterId),
      fetchStockLocations(activeProfitCenterId),
      fetchMasterItems(activeProfitCenterId),
      fetchProductionAlertThresholds(activeProfitCenterId),
      fetchProductionFormulaDefaults(activeProfitCenterId),
    ])
      .then(([f, s, sl, m, t, fm]) => {
        if (cancelled) return;
        setFurnaces(f.filter((x) => x.isActive));
        setShifts(s.filter((x) => x.isActive));
        setStockLocations(sl.filter((x) => x.isActive));
        setMaterials(m.filter((x) => x.isActive));
        setThresholds(t);
        setFormulas(fm);
      })
      .catch((e) => {
        toast({ title: "Failed to load workspace data", description: e?.message ?? String(e), variant: "destructive" });
      })
      .finally(() => !cancelled && setLoadingMasters(false));
    return () => {
      cancelled = true;
    };
  }, [activeProfitCenterId, toast]);

  const materialsByKind = useMemo(() => {
    const buckets = { ore: [] as MasterItem[], reductant: [] as MasterItem[], flux: [] as MasterItem[], paste: [] as MasterItem[] };
    for (const m of materials) {
      const kind = classifyMaterial({ groupName: m.groupName, category: null }, formulas.materialGroups);
      if (kind) buckets[kind].push(m);
    }
    return buckets;
  }, [materials, formulas.materialGroups]);

  const materialMap = useMemo(() => {
    const map = new Map<string, MasterItem>();
    materials.forEach((m) => map.set(m.id, m));
    return map;
  }, [materials]);

  // ---- Entry form state ----
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [furnaceId, setFurnaceId] = useState<string>("");
  const [shiftId, setShiftId] = useState<string>("");
  const [stockLocationId, setStockLocationId] = useState<string>("");
  const [heatNumber, setHeatNumber] = useState("");
  const [productName, setProductName] = useState("Silico Manganese");
  const [typicalGrade, setTypicalGrade] = useState("SiMn 60/14");
  const [tappingNo, setTappingNo] = useState("");
  const [batchNo, setBatchNo] = useState("");

  const [tappingPower, setTappingPower] = useState<string>("");
  const [furnacePower, setFurnacePower] = useState<string>("");
  const [auxiliaryPower, setAuxiliaryPower] = useState<string>("");
  const [avgPowerFactor, setAvgPowerFactor] = useState<string>("");

  const [productionMt, setProductionMt] = useState<string>("");
  const [fgMnPct, setFgMnPct] = useState<string>(String(formulas.fgMnDefaultPct));
  const [slagQtyMt, setSlagQtyMt] = useState<string>("");
  const [slagMnoPct, setSlagMnoPct] = useState<string>(String(formulas.slagMnoDefaultPct));
  const [dustQtyMt, setDustQtyMt] = useState<string>("");
  const [dustMnPct, setDustMnPct] = useState<string>(String(formulas.dustMnDefaultPct));

  const [oreRows, setOreRows] = useState<OreRow[]>([]);
  const [reductantRows, setReductantRows] = useState<ReductantRow[]>([]);
  const [fluxRows, setFluxRows] = useState<FluxRow[]>([]);
  const [pasteRows, setPasteRows] = useState<PasteRow[]>([]);

  const [entryStep, setEntryStep] = useState<EntryStep>("ore");
  const [activeTab, setActiveTab] = useState<"entry" | "heat" | "furnace" | "monthly">("entry");
  const [saving, setSaving] = useState<null | "draft" | "submitted">(null);

  // Refresh defaults when formulas load
  useEffect(() => {
    setFgMnPct((v) => (v ? v : String(formulas.fgMnDefaultPct)));
    setSlagMnoPct((v) => (v ? v : String(formulas.slagMnoDefaultPct)));
    setDustMnPct((v) => (v ? v : String(formulas.dustMnDefaultPct)));
  }, [formulas]);

  // Default selectors
  useEffect(() => {
    if (!furnaceId && furnaces.length) setFurnaceId(furnaces[0].id);
  }, [furnaces, furnaceId]);
  useEffect(() => {
    if (!shiftId && shifts.length) setShiftId(shifts[0].id);
  }, [shifts, shiftId]);
  useEffect(() => {
    if (!stockLocationId && stockLocations.length) setStockLocationId(stockLocations[0].id);
  }, [stockLocations, stockLocationId]);

  // ---- Row handlers ----
  const addOre = () => setOreRows((r) => [...r, { id: newId(), materialId: "", qtyWetMt: 0, mnPct: 0, moisturePct: 0 }]);
  const addReductant = () =>
    setReductantRows((r) => [
      ...r,
      { id: newId(), materialId: "", type: "Coke", qty: 0, unit: "Kg", fcPct: 0, vmPct: 0, ashPct: 0, moisturePct: 0 },
    ]);
  const addFlux = () => setFluxRows((r) => [...r, { id: newId(), materialId: "", qtyMt: 0, moisturePct: 0 }]);
  const addPaste = () => setPasteRows((r) => [...r, { id: newId(), materialId: "", qtyKg: 0 }]);

  const updateRow = <T extends { id: string }>(setter: React.Dispatch<React.SetStateAction<T[]>>, id: string, patch: Partial<T>) =>
    setter((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = <T extends { id: string }>(setter: React.Dispatch<React.SetStateAction<T[]>>, id: string) =>
    setter((rows) => rows.filter((r) => r.id !== id));

  // When a material is picked, prefill chemistry from item-master specs
  // (single source of truth — operators cannot type these). 0 is used as the
  // calc-safe stand-in when a spec is missing; the row will be flagged via
  // `specErrorsByRow` and Save is blocked until the item is fixed.
  const onPickOreMaterial = (rowId: string, materialId: string) => {
    const m = materialMap.get(materialId);
    const r = resolveFadItemSpecs(m, "ore");
    updateRow(setOreRows, rowId, {
      materialId,
      mnPct: r.mnPct ?? 0,
      moisturePct: r.moisturePct ?? 0,
    });
  };
  const onPickReductantMaterial = (rowId: string, materialId: string) => {
    const m = materialMap.get(materialId);
    const r = resolveFadItemSpecs(m, "reductant");
    updateRow(setReductantRows, rowId, {
      materialId,
      fcPct: r.fcPct ?? 0,
      vmPct: r.vmPct ?? 0,
      ashPct: r.ashPct ?? 0,
      moisturePct: r.moisturePct ?? 0,
    });
  };
  const onPickFluxMaterial = (rowId: string, materialId: string) => {
    const m = materialMap.get(materialId);
    const r = resolveFadItemSpecs(m, "flux");
    updateRow(setFluxRows, rowId, { materialId, moisturePct: r.moisturePct ?? 0 });
  };

  // ---- Calculations (live) ----
  const calc = useMemo(() => {
    const oreResults = oreRows.map((r) => {
      const dryQty = r.qtyWetMt * (1 - r.moisturePct / 100);
      const mnInput = dryQty * (r.mnPct / 100);
      return { ...r, dryQty, mnInput };
    });
    const totalMnInput = oreResults.reduce((s, r) => s + r.mnInput, 0);

    const reductantResults = reductantRows.map((r) => {
      const mtQty = r.unit === "Kg" ? r.qty / 1000 : r.qty;
      const dryQty = mtQty * (1 - r.moisturePct / 100);
      const fcInput = dryQty * (r.fcPct / 100);
      return { ...r, mtQty, dryQty, fcInput };
    });
    const totalFC = reductantResults.reduce((s, r) => s + r.fcInput, 0);
    const cokeFC = reductantResults.filter((r) => r.type === "Coke").reduce((s, r) => s + r.fcInput, 0);
    const coalFC = reductantResults.filter((r) => r.type === "Coal").reduce((s, r) => s + r.fcInput, 0);
    const charFC = reductantResults.filter((r) => r.type === "Char").reduce((s, r) => s + r.fcInput, 0);

    const fluxResults = fluxRows.map((f) => ({ ...f, dryQty: f.qtyMt * (1 - f.moisturePct / 100) }));
    const totalFluxDry = fluxResults.reduce((s, f) => s + f.dryQty, 0);
    const totalPasteKg = pasteRows.reduce((s, p) => s + p.qtyKg, 0);

    const prod = Number(productionMt) || 0;
    const fcPerMT = prod > 0 ? totalFC / prod : 0;
    const pastePerMT = prod > 0 ? totalPasteKg / prod : 0;
    const cokePer = totalFC > 0 ? (cokeFC / totalFC) * 100 : 0;
    const coalPer = totalFC > 0 ? (coalFC / totalFC) * 100 : 0;
    const charPer = totalFC > 0 ? (charFC / totalFC) * 100 : 0;

    const balance = mnBalance({
      inputMn: totalMnInput,
      productionMt: prod,
      fgMnPct: Number(fgMnPct) || 0,
      slagQty: Number(slagQtyMt) || 0,
      slagMnoPct: Number(slagMnoPct) || 0,
      dustQty: Number(dustQtyMt) || 0,
      dustMnPct: Number(dustMnPct) || 0,
    });

    const totalBalance = (balance.recoveryPct ?? 0) + (balance.slagLossPct ?? 0) + (balance.dustLossPct ?? 0) + (balance.diffLossPct ?? 0);

    return {
      oreResults,
      totalMnInput,
      reductantResults,
      totalFC,
      fcPerMT,
      cokePer,
      coalPer,
      charPer,
      fluxResults,
      totalFluxDry,
      totalPasteKg,
      pastePerMT,
      balance,
      totalBalance,
    };
  }, [oreRows, reductantRows, fluxRows, pasteRows, productionMt, fgMnPct, slagQtyMt, slagMnoPct, dustQtyMt, dustMnPct]);

  // ---- Submit ----
  const totalPower = useMemo(() => {
    const t = Number(tappingPower) || 0;
    const f = Number(furnacePower) || 0;
    const a = Number(auxiliaryPower) || 0;
    const sum = t + f + a;
    return sum > 0 ? sum : null;
  }, [tappingPower, furnacePower, auxiliaryPower]);

  // ---- Spec-source validation (Item Master is the single source of truth) ----
  const specErrors = useMemo(() => {
    const validationRows: FadConsumptionRowForValidation[] = [
      ...oreRows.map((r) => ({ rowId: r.id, materialId: r.materialId, quantity: r.qtyWetMt, kind: "ore" as const })),
      ...reductantRows.map((r) => ({ rowId: r.id, materialId: r.materialId, quantity: r.qty, kind: "reductant" as const })),
      ...fluxRows.map((r) => ({ rowId: r.id, materialId: r.materialId, quantity: r.qtyMt, kind: "flux" as const })),
      ...pasteRows.map((r) => ({ rowId: r.id, materialId: r.materialId, quantity: r.qtyKg, kind: "paste" as const })),
    ];
    return validateFadConsumption(validationRows, materialMap);
  }, [oreRows, reductantRows, fluxRows, pasteRows, materialMap]);
  const specErrorByRow = useMemo(() => {
    const m = new Map<string, string>();
    specErrors.forEach((e) => m.set(e.rowId, e.message));
    return m;
  }, [specErrors]);
  const blockingSpecErrors = specErrors.length > 0;

  async function handleSave(status: "draft" | "submitted") {
    if (!activeProfitCenterId || !userId) {
      toast({ title: "Not signed in", variant: "destructive" });
      return;
    }
    if (!stockLocationId) {
      toast({ title: "Select a stock location", description: "Required to record consumption.", variant: "destructive" });
      return;
    }
    if (blockingSpecErrors) {
      toast({
        title: "Item specs incomplete",
        description: specErrors[0]?.message ?? "One or more rows reference items with missing specs.",
        variant: "destructive",
      });
      return;
    }

    const consumption = [
      ...oreRows.filter((r) => r.materialId && r.qtyWetMt > 0).map((r) => ({ materialId: r.materialId, stockLocationId, quantity: r.qtyWetMt * 1000 })),
      ...reductantRows
        .filter((r) => r.materialId && r.qty > 0)
        .map((r) => ({ materialId: r.materialId, stockLocationId, quantity: r.unit === "Kg" ? r.qty : r.qty * 1000 })),
      ...fluxRows.filter((r) => r.materialId && r.qtyMt > 0).map((r) => ({ materialId: r.materialId, stockLocationId, quantity: r.qtyMt * 1000 })),
      ...pasteRows.filter((r) => r.materialId && r.qtyKg > 0).map((r) => ({ materialId: r.materialId, stockLocationId, quantity: r.qtyKg })),
    ];

    setSaving(status);
    try {
      await submitFadEntry({
        profitCenterId: activeProfitCenterId,
        createdBy: userId,
        furnaceId,
        shiftId,
        heatNumber,
        tapTime: new Date(`${date}T12:00:00`).toISOString(),
        weightMt: Number(productionMt) || null,
        notes: null,
        totalPowerMwh: totalPower,
        consumption,
        metallurgy: {
          product: productName || null,
          grade: typicalGrade || null,
          tappingNo: tappingNo || null,
          batchNo: batchNo || null,
          fgMnPct: Number(fgMnPct) || null,
          slagQtyMt: Number(slagQtyMt) || null,
          slagMnoPct: Number(slagMnoPct) || null,
          dustQtyMt: Number(dustQtyMt) || null,
          dustMnPct: Number(dustMnPct) || null,
          tappingPowerMwh: Number(tappingPower) || null,
          furnacePowerMwh: Number(furnacePower) || null,
          auxPowerMwh: Number(auxiliaryPower) || null,
          avgPowerFactor: Number(avgPowerFactor) || null,
          status,
          notes: null,
        },
      });

      toast({
        title: status === "draft" ? "Heat saved as draft" : "Heat submitted to Plant Head",
        description: `${heatNumber} · ${consumption.length} consumption rows recorded.`,
      });

      // Reset only the heat-specific fields; keep masters chosen
      setHeatNumber("");
      setTappingNo("");
      setBatchNo("");
      setProductionMt("");
      setSlagQtyMt("");
      setDustQtyMt("");
      setTappingPower("");
      setFurnacePower("");
      setAuxiliaryPower("");
      setAvgPowerFactor("");
      setOreRows([]);
      setReductantRows([]);
      setFluxRows([]);
      setPasteRows([]);
      setEntryStep("ore");
    } catch (e) {
      const err = e as FadEntryError | Error;
      const step = (err as FadEntryError).step;
      toast({
        title: step ? `Save failed at ${step}` : "Save failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  }

  // ---- Renderers ----
  const moistureWarn = (v: number) => v > thresholds.moistureMaxPct;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Production Entry – FAD</h1>
          <p className="text-muted-foreground text-sm">Ferro Alloys Production · Real-time Mn balance &amp; recovery analysis</p>
        </div>
        <Badge variant="outline">Workspace: {activeProfitCenter?.name ?? "—"}</Badge>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="entry" className="flex-1 min-w-[150px]">Data Entry &amp; Preview</TabsTrigger>
          <TabsTrigger value="heat" className="flex-1 min-w-[150px]">Heat-wise Results</TabsTrigger>
          <TabsTrigger value="furnace" className="flex-1 min-w-[150px]">Furnace Summary</TabsTrigger>
          <TabsTrigger value="monthly" className="flex-1 min-w-[150px]">Monthly Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="entry" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LEFT 2/3 */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-primary" /> Heat Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Heat ID</label>
                      <Input value={heatNumber} onChange={(e) => setHeatNumber(e.target.value)} placeholder="e.g. H-2401" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Furnace</label>
                      <Select value={furnaceId} onValueChange={setFurnaceId}>
                        <SelectTrigger><SelectValue placeholder="Select furnace" /></SelectTrigger>
                        <SelectContent>
                          {furnaces.map((f) => (
                            <SelectItem key={f.id} value={f.id}>{f.code} — {f.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Shift</label>
                      <Select value={shiftId} onValueChange={setShiftId}>
                        <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
                        <SelectContent>
                          {shifts.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
                      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Product Name</label>
                      <Input value={productName} onChange={(e) => setProductName(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Typical Grade</label>
                      <Input value={typicalGrade} onChange={(e) => setTypicalGrade(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Tapping No.</label>
                      <Input value={tappingNo} onChange={(e) => setTappingNo(e.target.value)} placeholder="e.g. T-01" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Batch No.</label>
                      <Input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="e.g. B-01" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Stock Location (consumption source)</label>
                      <Select value={stockLocationId} onValueChange={setStockLocationId}>
                        <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                        <SelectContent>
                          {stockLocations.map((l) => (
                            <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-border">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Tapping Power (MWh)</label>
                      <Input type="number" step="0.001" value={tappingPower} onChange={(e) => setTappingPower(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Furnace Power (MWh)</label>
                      <Input type="number" step="0.001" value={furnacePower} onChange={(e) => setFurnacePower(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Auxiliary Power (MWh)</label>
                      <Input type="number" step="0.001" value={auxiliaryPower} onChange={(e) => setAuxiliaryPower(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Avg Power Factor</label>
                      <Input type="number" step="0.01" value={avgPowerFactor} onChange={(e) => setAvgPowerFactor(e.target.value)} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Step tabs */}
              <div className="flex flex-wrap bg-muted rounded-lg p-1 border border-border gap-1">
                {(["ore", "reductant", "flux_paste", "output"] as EntryStep[]).map((step) => (
                  <button
                    key={step}
                    onClick={() => setEntryStep(step)}
                    className={`flex-1 min-w-[120px] py-1.5 text-sm font-medium rounded-md transition-all ${
                      entryStep === step ? "bg-background shadow text-primary" : "text-muted-foreground hover:bg-muted-foreground/10"
                    }`}
                  >
                    {step === "ore" ? "Mn Ore" : step === "reductant" ? "Reductant" : step === "flux_paste" ? "Fluxes, Paste" : "Output"}
                  </button>
                ))}
              </div>

              {entryStep === "ore" && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-lg">Mn Ore Consumption</CardTitle>
                    <Button size="sm" variant="outline" onClick={addOre} className="h-8">
                      <Plus className="h-4 w-4 mr-2" /> Add Ore
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Material</TableHead>
                          <TableHead className="w-28">Qty (Wet MT)</TableHead>
                          <TableHead className="w-24">Moisture %</TableHead>
                          <TableHead className="w-24">Mn %</TableHead>
                          <TableHead className="w-28 bg-muted/40">Mn Input (MT)</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {calc.oreResults.map((r, i) => (
                          <TableRow key={r.id}>
                            <TableCell>
                              <Select value={r.materialId} onValueChange={(v) => onPickOreMaterial(r.id, v)}>
                                <SelectTrigger><SelectValue placeholder="Pick ore" /></SelectTrigger>
                                <SelectContent>
                                  {materialsByKind.ore.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>{m.code} — {m.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input type="number" step="0.001" value={r.qtyWetMt}
                                onChange={(e) => updateRow(setOreRows, r.id, { qtyWetMt: Number(e.target.value) })} />
                            </TableCell>
                            <TableCell>
                              <div className="relative">
                                <Input type="number" step="0.01" value={r.moisturePct}
                                  onChange={(e) => updateRow(setOreRows, r.id, { moisturePct: Number(e.target.value) })}
                                  className={moistureWarn(r.moisturePct) ? "border-amber-500" : ""} />
                                {moistureWarn(r.moisturePct) && (
                                  <AlertTriangle className="absolute right-2 top-2 h-4 w-4 text-amber-500" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input type="number" step="0.01" value={r.mnPct}
                                onChange={(e) => updateRow(setOreRows, r.id, { mnPct: Number(e.target.value) })} />
                            </TableCell>
                            <TableCell className="bg-muted/40 text-center font-medium font-mono">{r.mnInput.toFixed(2)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" onClick={() => removeRow(setOreRows, r.id)} className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted font-bold">
                          <TableCell colSpan={4} className="text-right">Total Mn Input (Dry):</TableCell>
                          <TableCell className="text-center text-primary">{calc.totalMnInput.toFixed(2)} MT</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {entryStep === "reductant" && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-lg">Reductant Consumption</CardTitle>
                    <Button size="sm" variant="outline" onClick={addReductant} className="h-8">
                      <Plus className="h-4 w-4 mr-2" /> Add Reductant
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Material</TableHead>
                          <TableHead className="w-20">Type</TableHead>
                          <TableHead className="w-24">Qty</TableHead>
                          <TableHead className="w-20">Unit</TableHead>
                          <TableHead className="w-20">Moist %</TableHead>
                          <TableHead className="w-20">FC %</TableHead>
                          <TableHead className="w-20">VM %</TableHead>
                          <TableHead className="w-20">Ash %</TableHead>
                          <TableHead className="w-24 bg-muted/40">FC Input (MT)</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {calc.reductantResults.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>
                              <Select value={r.materialId} onValueChange={(v) => onPickReductantMaterial(r.id, v)}>
                                <SelectTrigger><SelectValue placeholder="Pick reductant" /></SelectTrigger>
                                <SelectContent>
                                  {materialsByKind.reductant.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>{m.code} — {m.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select value={r.type} onValueChange={(v) => updateRow(setReductantRows, r.id, { type: v as ReductantRow["type"] })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Coke">Coke</SelectItem>
                                  <SelectItem value="Coal">Coal</SelectItem>
                                  <SelectItem value="Char">Char</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input type="number" step="0.01" value={r.qty}
                                onChange={(e) => updateRow(setReductantRows, r.id, { qty: Number(e.target.value) })} />
                            </TableCell>
                            <TableCell>
                              <Select value={r.unit} onValueChange={(v) => updateRow(setReductantRows, r.id, { unit: v as ReductantRow["unit"] })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="MT">MT</SelectItem>
                                  <SelectItem value="Kg">Kg</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input type="number" step="0.01" value={r.moisturePct}
                                onChange={(e) => updateRow(setReductantRows, r.id, { moisturePct: Number(e.target.value) })}
                                className={moistureWarn(r.moisturePct) ? "border-amber-500" : ""} />
                            </TableCell>
                            <TableCell><Input type="number" step="0.01" value={r.fcPct} onChange={(e) => updateRow(setReductantRows, r.id, { fcPct: Number(e.target.value) })} /></TableCell>
                            <TableCell><Input type="number" step="0.01" value={r.vmPct} onChange={(e) => updateRow(setReductantRows, r.id, { vmPct: Number(e.target.value) })} /></TableCell>
                            <TableCell><Input type="number" step="0.01" value={r.ashPct} onChange={(e) => updateRow(setReductantRows, r.id, { ashPct: Number(e.target.value) })} /></TableCell>
                            <TableCell className="bg-muted/40 text-center font-medium font-mono">{r.fcInput.toFixed(3)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" onClick={() => removeRow(setReductantRows, r.id)} className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted font-bold">
                          <TableCell colSpan={8} className="text-right">Total FC (Dry):</TableCell>
                          <TableCell className="text-center text-primary">{calc.totalFC.toFixed(3)} MT</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {entryStep === "flux_paste" && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-lg">Flux Consumption</CardTitle>
                      <Button size="sm" variant="outline" onClick={addFlux} className="h-8">
                        <Plus className="h-4 w-4 mr-2" /> Add Flux
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Material</TableHead>
                            <TableHead className="w-28">Qty (MT)</TableHead>
                            <TableHead className="w-24">Moisture %</TableHead>
                            <TableHead className="w-28 bg-muted/40">Dry Qty (MT)</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {calc.fluxResults.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell>
                                <Select value={r.materialId} onValueChange={(v) => onPickFluxMaterial(r.id, v)}>
                                  <SelectTrigger><SelectValue placeholder="Pick flux" /></SelectTrigger>
                                  <SelectContent>
                                    {materialsByKind.flux.map((m) => (
                                      <SelectItem key={m.id} value={m.id}>{m.code} — {m.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input type="number" step="0.01" value={r.qtyMt}
                                  onChange={(e) => updateRow(setFluxRows, r.id, { qtyMt: Number(e.target.value) })} />
                              </TableCell>
                              <TableCell>
                                <Input type="number" step="0.01" value={r.moisturePct}
                                  onChange={(e) => updateRow(setFluxRows, r.id, { moisturePct: Number(e.target.value) })}
                                  className={moistureWarn(r.moisturePct) ? "border-amber-500" : ""} />
                              </TableCell>
                              <TableCell className="bg-muted/40 text-center font-mono">{r.dryQty.toFixed(2)}</TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" onClick={() => removeRow(setFluxRows, r.id)} className="text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted font-bold">
                            <TableCell colSpan={3} className="text-right">Total Dry Flux:</TableCell>
                            <TableCell className="text-center">{calc.totalFluxDry.toFixed(2)} MT</TableCell>
                            <TableCell />
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-lg">Paste Consumption</CardTitle>
                      <Button size="sm" variant="outline" onClick={addPaste} className="h-8">
                        <Plus className="h-4 w-4 mr-2" /> Add Paste
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Material</TableHead>
                            <TableHead className="w-32">Qty (Kg)</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pasteRows.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell>
                                <Select value={p.materialId} onValueChange={(v) => updateRow(setPasteRows, p.id, { materialId: v })}>
                                  <SelectTrigger><SelectValue placeholder="Pick paste" /></SelectTrigger>
                                  <SelectContent>
                                    {materialsByKind.paste.map((m) => (
                                      <SelectItem key={m.id} value={m.id}>{m.code} — {m.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input type="number" step="0.01" value={p.qtyKg}
                                  onChange={(e) => updateRow(setPasteRows, p.id, { qtyKg: Number(e.target.value) })} />
                              </TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" onClick={() => removeRow(setPasteRows, p.id)} className="text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted font-bold">
                            <TableCell className="text-right">Total Paste:</TableCell>
                            <TableCell className="text-center">{calc.totalPasteKg.toFixed(2)} Kg</TableCell>
                            <TableCell />
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              )}

              {entryStep === "output" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Production Output</CardTitle>
                    <CardDescription>Hot metal, slag, and dust quantities &amp; analysis.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Production Qty (MT)</label>
                        <Input type="number" step="0.001" value={productionMt} onChange={(e) => setProductionMt(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">FG Mn %</label>
                        <Input type="number" step="0.01" value={fgMnPct} onChange={(e) => setFgMnPct(e.target.value)} />
                      </div>
                      <div />
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Slag Qty (MT)</label>
                        <Input type="number" step="0.01" value={slagQtyMt} onChange={(e) => setSlagQtyMt(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Slag MnO %</label>
                        <Input type="number" step="0.01" value={slagMnoPct} onChange={(e) => setSlagMnoPct(e.target.value)}
                          className={Number(slagMnoPct) > thresholds.slagMnoMaxPct ? "border-amber-500" : ""} />
                      </div>
                      <div />
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Dust Qty (MT)</label>
                        <Input type="number" step="0.01" value={dustQtyMt} onChange={(e) => setDustQtyMt(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Dust Mn %</label>
                        <Input type="number" step="0.01" value={dustMnPct} onChange={(e) => setDustMnPct(e.target.value)} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* RIGHT 1/3 — Live Mn Balance */}
            <div className="lg:col-span-1">
              <Card className="sticky top-4">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FlaskConical className="h-5 w-5 text-primary" /> Live Mn Balance
                  </CardTitle>
                  <CardDescription>Real-time recovery &amp; loss calculation</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="p-4 space-y-2 border-b border-border">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Mn Input</span>
                      <span className="font-mono font-medium">{calc.totalMnInput.toFixed(2)} MT</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Metal Mn Output</span>
                      <span className="font-mono font-medium">{calc.balance.metalMn.toFixed(2)} MT</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-amber-600">Slag Mn Output</span>
                      <span className="font-mono font-medium">{calc.balance.slagMn.toFixed(2)} MT</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Dust Mn Output</span>
                      <span className="font-mono font-medium">{calc.balance.dustMn.toFixed(2)} MT</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-border font-bold">
                      <span>Total Mn Output</span>
                      <span className="font-mono">{calc.balance.totalOutputMn.toFixed(2)} MT</span>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/30 space-y-3">
                    <div>
                      <div className="flex justify-between items-end mb-1">
                        <span className="text-sm font-bold">Mn Recovery</span>
                        <span className={`font-mono text-xl ${recoveryColor(calc.balance.recoveryPct, thresholds.recoveryMinPct)}`}>
                          {calc.balance.recoveryPct === null ? "—" : `${calc.balance.recoveryPct.toFixed(2)}%`}
                        </span>
                      </div>
                      {calc.balance.recoveryPct !== null && calc.balance.recoveryPct > 0 && calc.balance.recoveryPct < thresholds.recoveryMinPct && (
                        <p className="text-xs text-destructive flex items-center mt-1">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Low recovery (&lt;{thresholds.recoveryMinPct}%)
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div>
                        <span className="block text-xs text-muted-foreground mb-1">Slag Loss</span>
                        <span className="font-mono text-sm font-medium text-amber-600">{(calc.balance.slagLossPct ?? 0).toFixed(2)}%</span>
                      </div>
                      <div>
                        <span className="block text-xs text-muted-foreground mb-1">Dust Loss</span>
                        <span className="font-mono text-sm font-medium">{(calc.balance.dustLossPct ?? 0).toFixed(2)}%</span>
                      </div>
                      <div className="col-span-2">
                        <span className="block text-xs text-muted-foreground mb-1">Diffusion / Unaccounted</span>
                        <span className={`font-mono text-sm font-medium ${(calc.balance.diffLossPct ?? 0) > 5 ? "text-destructive" : ""}`}>
                          {(calc.balance.diffLossPct ?? 0).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    <div className="pt-3 flex justify-between items-center text-xs text-muted-foreground border-t border-border">
                      <span>Balance check (~100%)</span>
                      <span className="font-mono font-bold">{calc.totalBalance.toFixed(1)}%</span>
                    </div>
                  </div>

                  <div className="p-4 space-y-3 border-t border-border">
                    <h4 className="text-xs font-bold border-b border-border pb-1">Reductant &amp; Fuel</h4>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total FC Input</span>
                      <span className="font-mono">{calc.totalFC.toFixed(3)} MT</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold">FC per MT</span>
                      <span className={`font-mono text-lg ${calc.fcPerMT > thresholds.fcPerMtMax ? "text-destructive font-bold" : "text-emerald-600 font-bold"}`}>
                        {calc.fcPerMT.toFixed(3)} MT
                      </span>
                    </div>
                    {calc.fcPerMT > thresholds.fcPerMtMax && (
                      <p className="text-xs text-destructive flex items-center">
                        <AlertTriangle className="h-3 w-3 mr-1" /> High FC consumption (&gt;{thresholds.fcPerMtMax})
                      </p>
                    )}
                    <div className="pt-2 border-t border-border">
                      <span className="block text-xs text-muted-foreground mb-2">Fuel Mix (FC basis)</span>
                      <div className="w-full bg-muted rounded-full h-2 mb-1 flex overflow-hidden">
                        <div className="bg-foreground h-2" style={{ width: `${calc.cokePer}%` }} />
                        <div className="bg-muted-foreground h-2" style={{ width: `${calc.coalPer}%` }} />
                        <div className="bg-amber-600 h-2" style={{ width: `${calc.charPer}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                        <span>Coke:{calc.cokePer.toFixed(0)}%</span>
                        <span>Coal:{calc.coalPer.toFixed(0)}%</span>
                        <span>Char:{calc.charPer.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 space-y-2 border-t border-border bg-muted/20">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Flux (Dry)</span>
                      <span className="font-mono">{calc.totalFluxDry.toFixed(2)} MT</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Paste (Kg/MT)</span>
                      <span className="font-mono">{calc.pastePerMT.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="p-4 border-t border-border space-y-2">
                    <Button onClick={() => handleSave("draft")} variant="outline" className="w-full" disabled={saving !== null || loadingMasters}>
                      {saving === "draft" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                      Save Draft
                    </Button>
                    <Button onClick={() => handleSave("submitted")} className="w-full" disabled={saving !== null || loadingMasters}>
                      {saving === "submitted" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                      Submit to Plant Head
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="heat" className="mt-6"><PortalProductionHeatwise /></TabsContent>
        <TabsContent value="furnace" className="mt-6"><PortalProductionFurnaceSummary /></TabsContent>
        <TabsContent value="monthly" className="mt-6"><PortalProductionMonthly /></TabsContent>
      </Tabs>
    </div>
  );
}
