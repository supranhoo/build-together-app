import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MaterialPicker } from "@/components/MaterialPicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Calculator, CheckCircle2, FlaskConical, Loader2, Plus, Save, Trash2 } from "lucide-react";

import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

import { fetchFurnaces, fetchShifts, type Furnace, type Shift } from "@/lib/production";
import { fetchStockLocations, fetchLedger, computeStockBalances, type StockLocation, type InventoryLedgerEntry } from "@/lib/inventory";
import { fetchMasterItems, type MasterItem } from "@/lib/master-data";
import { mnBalance, mnInput as mnInputCalc, type MaterialSpecLookup } from "@/lib/ferro-alloys";
import { siBalance, siInput as siInputCalc } from "@/lib/silicon-balance";
import { fetchProductionAlertThresholds, DEFAULT_PRODUCTION_ALERTS, type ProductionAlertThresholds } from "@/lib/production-alerts";
import { fetchProductionTargets, resolveTarget, type ProductionTarget } from "@/lib/production-targets";
import { validateHeat, hasBlockingIssue, summariseIssues, type HeatIssue } from "@/lib/heat-validation";
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
  /** Manual Si% override (per-heat). Used by the Live Si Balance. */
  siPct: number;
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
  // Item-Master baseline at the moment the material was picked. Operators may
  // override the four chemistry fields above from the QC Lab report; the UI
  // surfaces a `QC` badge whenever a value deviates from its baseline.
  baselineFcPct: number | null;
  baselineVmPct: number | null;
  baselineAshPct: number | null;
  baselineMoisturePct: number | null;
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

export const FAD_MATERIAL_CELL_CLASS = "w-44 min-w-44 max-w-44";
export const FAD_QTY_CELL_CLASS = "w-36 min-w-36";
export const FAD_NUMERIC_INPUT_CLASS = "w-full min-w-[6.5rem] text-center font-mono tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

/**
 * Editable percent input for reductant chemistry (FC / VM / Ash / Moisture).
 * Pulls its initial value from the Item Master, but the operator overrides it
 * from the per-shift QC Lab report. When the entered value deviates from the
 * baseline by more than 0.01 % we show a small amber `QC` chip with a tooltip
 * showing the baseline so QC and audits can spot deviations at a glance.
 */
function ReductantSpecInput({
  value,
  baseline,
  disabled,
  onChange,
  warn,
}: {
  value: number;
  baseline: number | null;
  disabled?: boolean;
  onChange: (v: number) => void;
  warn?: boolean;
}) {
  // Buffer the raw string so the operator can delete digits, type a decimal
  // point, etc. without the field collapsing back to "0" mid-keystroke.
  // We commit to the parent state on every keystroke that parses to a number,
  // and re-sync the buffer if the parent value changes from outside (e.g.
  // when a new material is picked and chemistry is prefilled).
  const [buf, setBuf] = useState<string>(() => String(value ?? 0));
  const lastSyncedValueRef = useRef<number>(value);
  useEffect(() => {
    if (value !== lastSyncedValueRef.current) {
      lastSyncedValueRef.current = value;
      setBuf(String(value ?? 0));
    }
  }, [value]);
  const isOverride = baseline !== null && Math.abs(value - baseline) > 0.01;
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        step="0.01"
        inputMode="decimal"
        value={buf}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value;
          setBuf(next);
          if (next === "" || next === "-" || next === ".") return;
          const n = Number(next);
          if (Number.isFinite(n)) {
            lastSyncedValueRef.current = n;
            onChange(n);
          }
        }}
        onBlur={() => {
          if (buf === "" || buf === "-" || buf === ".") {
            setBuf("0");
            lastSyncedValueRef.current = 0;
            onChange(0);
          }
        }}
        className={`h-8 px-1 ${FAD_NUMERIC_INPUT_CLASS} ${warn ? "text-amber-600 font-bold" : ""}`}
      />
      {isOverride && (
        <span
          title={`QC override — Item Master baseline: ${baseline!.toFixed(2)}%`}
          className="shrink-0 text-[10px] font-bold px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 border border-amber-500/30"
        >
          QC
        </span>
      )}
    </div>
  );
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
  const [ledger, setLedger] = useState<InventoryLedgerEntry[]>([]);
  const [thresholds, setThresholds] = useState<ProductionAlertThresholds>(DEFAULT_PRODUCTION_ALERTS);
  const [formulas, setFormulas] = useState<ProductionFormulaDefaults>(DEFAULT_PRODUCTION_FORMULAS);
  const [loadingMasters, setLoadingMasters] = useState(true);
  const [productionTargets, setProductionTargets] = useState<ProductionTarget[]>([]);

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
      fetchLedger(activeProfitCenterId),
      fetchProductionTargets(activeProfitCenterId),
    ])
      .then(([f, s, sl, m, t, fm, le, pt]) => {
        if (cancelled) return;
        setFurnaces(f.filter((x) => x.isActive));
        setShifts(s.filter((x) => x.isActive));
        setStockLocations(sl.filter((x) => x.isActive));
        setMaterials(m.filter((x) => x.isActive));
        setThresholds(t);
        setFormulas(fm);
        setLedger(le);
        setProductionTargets(pt);
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
      const kind = classifyMaterial(
        { fadKind: m.fadKind, groupName: m.groupName, category: null },
        formulas.materialGroups,
      );
      if (kind) buckets[kind].push(m);
    }
    return buckets;
  }, [materials, formulas.materialGroups]);

  const materialMap = useMemo(() => {
    const map = new Map<string, MasterItem>();
    materials.forEach((m) => map.set(m.id, m));
    return map;
  }, [materials]);

  /** Aggregate current stock per material across all locations — for the FG picker preview. */
  const stockByMaterial = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of computeStockBalances(ledger)) {
      map.set(b.materialId, (map.get(b.materialId) ?? 0) + b.quantity);
    }
    return map;
  }, [ledger]);

  // ---- Entry form state ----
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [furnaceId, setFurnaceId] = useState<string>("");
  const [shiftId, setShiftId] = useState<string>("");
  const [stockLocationId, setStockLocationId] = useState<string>("");
  const [heatNumber, setHeatNumber] = useState("");
  const [productItemId, setProductItemId] = useState<string>("");
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

  // Si tracking — per-heat manual entry (not pulled from item-master).
  // SiO₂→Si factor and Si recovery threshold come from `thresholds` (admin-configurable).
  const [fgSiPct, setFgSiPct] = useState<string>("");
  const [slagSio2Pct, setSlagSio2Pct] = useState<string>("");
  const [dustSiPct, setDustSiPct] = useState<string>("");

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
  const addOre = () => setOreRows((r) => [...r, { id: newId(), materialId: "", qtyWetMt: 0, mnPct: 0, moisturePct: 0, siPct: 0 }]);
  const addReductant = () =>
    setReductantRows((r) => [
      ...r,
      {
        id: newId(), materialId: "", type: "Coke", qty: 0, unit: "Kg",
        fcPct: 0, vmPct: 0, ashPct: 0, moisturePct: 0,
        baselineFcPct: null, baselineVmPct: null, baselineAshPct: null, baselineMoisturePct: null,
      },
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
  // Reductants: prefill chemistry from the Item Master AND store the same
  // values as the baseline. Operator can then overwrite any of the four
  // chemistry fields from the QC Lab report; deviations are flagged with a
  // `QC` badge in the table.
  const onPickReductantMaterial = (rowId: string, materialId: string) => {
    const m = materialMap.get(materialId);
    const r = resolveFadItemSpecs(m, "reductant");
    updateRow(setReductantRows, rowId, {
      materialId,
      fcPct: r.fcPct ?? 0,
      vmPct: r.vmPct ?? 0,
      ashPct: r.ashPct ?? 0,
      moisturePct: r.moisturePct ?? 0,
      baselineFcPct: r.fcPct,
      baselineVmPct: r.vmPct,
      baselineAshPct: r.ashPct,
      baselineMoisturePct: r.moisturePct,
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
      // Phase 2: thread admin-configured MnO→Mn factor (was hardcoded 1.29).
      mnoToMnFactor: thresholds.mnoToMnFactor,
    });

    const totalBalance = (balance.recoveryPct ?? 0) + (balance.slagLossPct ?? 0) + (balance.dustLossPct ?? 0) + (balance.diffLossPct ?? 0);

    // ---- Si balance (per-heat manual Si% inputs; factor from admin settings) ----
    const totalSiInput = siInputCalc(
      oreRows.map((r) => ({ qty: r.qtyWetMt, siPct: r.siPct, moisturePct: r.moisturePct })),
    );
    const siBal = siBalance({
      inputSi: totalSiInput,
      productionMt: prod,
      fgSiPct: Number(fgSiPct) || 0,
      slagQty: Number(slagQtyMt) || 0,
      slagSio2Pct: Number(slagSio2Pct) || 0,
      dustQty: Number(dustQtyMt) || 0,
      dustSiPct: Number(dustSiPct) || 0,
      sio2ToSiFactor: thresholds.sio2ToSiFactor,
    });
    const totalSiBalance = (siBal.recoveryPct ?? 0) + (siBal.slagLossPct ?? 0) + (siBal.dustLossPct ?? 0) + (siBal.diffLossPct ?? 0);

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
      totalSiInput,
      siBal,
      totalSiBalance,
    };
  }, [oreRows, reductantRows, fluxRows, pasteRows, productionMt, fgMnPct, slagQtyMt, slagMnoPct, dustQtyMt, dustMnPct, fgSiPct, slagSio2Pct, dustSiPct, thresholds.sio2ToSiFactor, thresholds.mnoToMnFactor]);

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

  // Phase 2 — Validation & Alert Engine.
  // Resolve the most-specific target for this furnace + grade and validate
  // the heat snapshot. Blocking issues prevent "Submit"; warnings are shown
  // but do not block. The same engine drives the approval queue.
  const resolvedTarget = useMemo(
    () => resolveTarget(productionTargets, { furnaceId, product: productName, grade: typicalGrade }),
    [productionTargets, furnaceId, productName, typicalGrade],
  );
  const heatIssues: HeatIssue[] = useMemo(() => {
    return validateHeat(
      {
        weightMt: Number(productionMt) || null,
        fgMnPct: Number(fgMnPct) || null,
        slagQtyMt: Number(slagQtyMt) || null,
        slagMnoPct: Number(slagMnoPct) || null,
        dustQtyMt: Number(dustQtyMt) || null,
        dustMnPct: Number(dustMnPct) || null,
        totalPowerMwh: totalPower || null,
        electrodeKg: calc.totalPasteKg || null,
        mnBalance: calc.balance,
        siRecoveryPct: calc.siBal.recoveryPct,
      },
      thresholds,
      resolvedTarget,
    );
  }, [productionMt, fgMnPct, slagQtyMt, slagMnoPct, dustQtyMt, dustMnPct, totalPower, calc, thresholds, resolvedTarget]);
  const heatIssueSummary = useMemo(() => summariseIssues(heatIssues), [heatIssues]);
  const heatHasBlock = useMemo(() => hasBlockingIssue(heatIssues), [heatIssues]);


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
    // Phase 2 — Block submission (not draft) when the validation engine
    // reports any "block"-severity issue (impossible chemistry / negative
    // conserved-mass losses). Drafts are still allowed so operators can
    // continue editing partially-entered heats.
    if (status === "submitted" && heatHasBlock) {
      toast({
        title: "Cannot submit — metallurgy validation failed",
        description: heatIssues.find((i) => i.severity === "block")?.message ?? "Fix the highlighted issues before submitting.",
        variant: "destructive",
      });
      return;
    }


    // Phase 1 (audit): consumption is recorded in MT — the canonical platform
    // UOM. Per-row inputs on this page already use MT except where the
    // operator explicitly chose Kg (reductant unit toggle, paste qtyKg). We
    // convert those to MT here so the DB trigger `create_consumption_ledger_entry`
    // can write a single-UOM ledger entry. No more silent ×1000 mismatches.
    const KG_TO_MT = 1 / 1000;
    const consumption = [
      ...oreRows
        .filter((r) => r.materialId && r.qtyWetMt > 0)
        .map((r) => ({ materialId: r.materialId, stockLocationId, quantity: r.qtyWetMt, uom: "MT" })),
      ...reductantRows
        .filter((r) => r.materialId && r.qty > 0)
        .map((r) => ({
          materialId: r.materialId,
          stockLocationId,
          quantity: r.unit === "Kg" ? r.qty * KG_TO_MT : r.qty,
          uom: "MT",
        })),
      ...fluxRows
        .filter((r) => r.materialId && r.qtyMt > 0)
        .map((r) => ({ materialId: r.materialId, stockLocationId, quantity: r.qtyMt, uom: "MT" })),
      ...pasteRows
        .filter((r) => r.materialId && r.qtyKg > 0)
        .map((r) => ({ materialId: r.materialId, stockLocationId, quantity: r.qtyKg * KG_TO_MT, uom: "MT" })),
    ];

    setSaving(status);
    try {
      const result = await submitFadEntry({
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

      const title = status === "submitted"
        ? "Heat submitted to Plant Head"
        : result.mode === "updated" ? "Draft updated" : "Heat saved as draft";
      toast({
        title,
        description: `${heatNumber} · ${consumption.length} consumption rows recorded.`,
      });

      // On final submission, clear the form for the next heat.
      // On draft save, keep all fields so the operator can keep editing and re-save.
      if (status === "submitted") {
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
      }
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
                      <MaterialPicker
                        contextKey="fad.finished_good"
                        profitCenterId={activeProfitCenterId ?? null}
                        materials={materials}
                        value={productItemId}
                        onChange={(id) => {
                          setProductItemId(id);
                          const item = materialMap.get(id);
                          if (item) {
                            setProductName(item.name);
                            const specGrade = (item.specs as Record<string, unknown> | undefined)?.["typicalGrade"];
                            if (typeof specGrade === "string" && specGrade.trim() && !typicalGrade.trim()) {
                              setTypicalGrade(specGrade.trim());
                            }
                          }
                        }}
                        placeholder="Select finished good…"
                        displayMode="name-only"
                        stockByMaterial={stockByMaterial}
                      />
                      {productName && !productItemId && (
                        <p className="mt-1 text-xs text-muted-foreground">Saved as: {productName}</p>
                      )}
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
                  <CardContent className="p-3 overflow-x-auto">
                    <Table className="min-w-[58rem] table-fixed text-xs [&_th]:h-8 [&_th]:px-2 [&_th]:py-1 [&_td]:py-1 [&_td]:px-2 [&_input]:h-8 [&_input]:text-xs [&_input]:px-2 [&_button[role=combobox]]:h-8 [&_button[role=combobox]]:text-xs [&_button[role=combobox]]:px-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead className={FAD_MATERIAL_CELL_CLASS}>Material</TableHead>
                          <TableHead className={FAD_QTY_CELL_CLASS}>Qty (Wet MT)</TableHead>
                          <TableHead className="w-24">Moisture %</TableHead>
                          <TableHead className="w-24">Mn %</TableHead>
                          <TableHead className="w-28 bg-muted/40">Mn Input (MT)</TableHead>
                          <TableHead className="w-24">Si % <span className="text-[10px] text-muted-foreground font-normal">(manual)</span></TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {calc.oreResults.map((r) => {
                          const err = specErrorByRow.get(r.id);
                          return (
                          <Fragment key={r.id}>
                          <TableRow key={r.id}>
                            <TableCell className={FAD_MATERIAL_CELL_CLASS}>
                              <MaterialPicker
                                contextKey="fad.ore"
                                profitCenterId={activeProfitCenterId ?? null}
                                materials={materials}
                                value={r.materialId}
                                onChange={(v) => onPickOreMaterial(r.id, v)}
                                placeholder="Pick ore"
                              />
                            </TableCell>
                            <TableCell className={FAD_QTY_CELL_CLASS}>
                              <Input type="number" step="0.001" value={r.qtyWetMt}
                                className={FAD_NUMERIC_INPUT_CLASS}
                                onChange={(e) => updateRow(setOreRows, r.id, { qtyWetMt: Number(e.target.value) })} />
                            </TableCell>
                            <TableCell className={`text-center font-mono ${moistureWarn(r.moisturePct) ? "text-amber-600 font-bold" : ""}`} title="From item spec">
                              {r.materialId ? `${r.moisturePct.toFixed(2)}%` : "—"}
                              {moistureWarn(r.moisturePct) && <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />}
                            </TableCell>
                            <TableCell className="text-center font-mono" title="From item spec">
                              {r.materialId ? `${r.mnPct.toFixed(2)}%` : "—"}
                            </TableCell>
                            <TableCell className="bg-muted/40 text-center font-medium font-mono">{r.mnInput.toFixed(2)}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.01"
                                value={r.siPct}
                                onChange={(e) => updateRow(setOreRows, r.id, { siPct: Number(e.target.value) })}
                                className={`h-8 px-1 ${FAD_NUMERIC_INPUT_CLASS}`}
                                placeholder="0"
                              />
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" onClick={() => removeRow(setOreRows, r.id)} className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                          {err && (
                            <TableRow key={`${r.id}-err`}>
                              <TableCell colSpan={7} className="py-1 text-xs text-destructive bg-destructive/5">
                                <AlertTriangle className="inline h-3 w-3 mr-1" />{err}
                              </TableCell>
                            </TableRow>
                          )}
                          </Fragment>
                          );
                        })}
                        <TableRow className="bg-muted font-bold">
                          <TableCell colSpan={4} className="text-right">Total Mn Input (Dry):</TableCell>
                          <TableCell className="text-center text-primary">{calc.totalMnInput.toFixed(2)} MT</TableCell>
                          <TableCell className="text-center text-primary">Si: {calc.totalSiInput.toFixed(2)} MT</TableCell>
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
                  <CardContent className="p-3 overflow-x-auto">
                    <Table className="min-w-[64rem] table-fixed text-xs [&_th]:h-8 [&_th]:px-1.5 [&_th]:py-1 [&_td]:py-1 [&_td]:px-1.5 [&_input]:h-8 [&_input]:text-xs [&_input]:px-2 [&_button[role=combobox]]:h-8 [&_button[role=combobox]]:text-xs [&_button[role=combobox]]:px-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead className={FAD_MATERIAL_CELL_CLASS}>Material</TableHead>
                          <TableHead className="w-20">Type</TableHead>
                          <TableHead className={FAD_QTY_CELL_CLASS}>Qty</TableHead>
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
                        {calc.reductantResults.map((r) => {
                          const err = specErrorByRow.get(r.id);
                          return (
                          <Fragment key={r.id}>
                          <TableRow key={r.id}>
                            <TableCell className={FAD_MATERIAL_CELL_CLASS}>
                              <MaterialPicker
                                contextKey="fad.reductant"
                                profitCenterId={activeProfitCenterId ?? null}
                                materials={materials}
                                value={r.materialId}
                                onChange={(v) => onPickReductantMaterial(r.id, v)}
                                placeholder="Pick reductant"
                              />
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
                            <TableCell className={FAD_QTY_CELL_CLASS}>
                              <Input type="number" step="0.01" value={r.qty}
                                className={FAD_NUMERIC_INPUT_CLASS}
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
                            <TableCell className="p-1">
                              <ReductantSpecInput
                                value={r.moisturePct}
                                baseline={r.baselineMoisturePct}
                                disabled={!r.materialId}
                                onChange={(v) => updateRow(setReductantRows, r.id, { moisturePct: v })}
                                warn={moistureWarn(r.moisturePct)}
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <ReductantSpecInput
                                value={r.fcPct}
                                baseline={r.baselineFcPct}
                                disabled={!r.materialId}
                                onChange={(v) => updateRow(setReductantRows, r.id, { fcPct: v })}
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <ReductantSpecInput
                                value={r.vmPct}
                                baseline={r.baselineVmPct}
                                disabled={!r.materialId}
                                onChange={(v) => updateRow(setReductantRows, r.id, { vmPct: v })}
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <ReductantSpecInput
                                value={r.ashPct}
                                baseline={r.baselineAshPct}
                                disabled={!r.materialId}
                                onChange={(v) => updateRow(setReductantRows, r.id, { ashPct: v })}
                              />
                            </TableCell>
                            <TableCell className="bg-muted/40 text-center font-medium font-mono">{r.fcInput.toFixed(3)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" onClick={() => removeRow(setReductantRows, r.id)} className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                          {err && (
                            <TableRow key={`${r.id}-err`}>
                              <TableCell colSpan={10} className="py-1 text-xs text-destructive bg-destructive/5">
                                <AlertTriangle className="inline h-3 w-3 mr-1" />{err}
                              </TableCell>
                            </TableRow>
                          )}
                          </Fragment>
                          );
                        })}
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
                    <CardContent className="p-3 overflow-x-auto">
                      <Table className="min-w-[46rem] table-fixed text-xs [&_th]:h-8 [&_th]:px-2 [&_th]:py-1 [&_td]:py-1 [&_td]:px-2 [&_input]:h-8 [&_input]:text-xs [&_input]:px-2 [&_button[role=combobox]]:h-8 [&_button[role=combobox]]:text-xs [&_button[role=combobox]]:px-2">
                        <TableHeader>
                          <TableRow>
                            <TableHead className={FAD_MATERIAL_CELL_CLASS}>Material</TableHead>
                            <TableHead className={FAD_QTY_CELL_CLASS}>Qty (MT)</TableHead>
                            <TableHead className="w-24">Moisture %</TableHead>
                            <TableHead className="w-28 bg-muted/40">Dry Qty (MT)</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {calc.fluxResults.map((r) => {
                            const err = specErrorByRow.get(r.id);
                            return (
                            <Fragment key={r.id}>
                            <TableRow key={r.id}>
                              <TableCell className={FAD_MATERIAL_CELL_CLASS}>
                                <MaterialPicker
                                  contextKey="fad.flux"
                                  profitCenterId={activeProfitCenterId ?? null}
                                  materials={materials}
                                  value={r.materialId}
                                  onChange={(v) => onPickFluxMaterial(r.id, v)}
                                  placeholder="Pick flux"
                                />
                              </TableCell>
                              <TableCell className={FAD_QTY_CELL_CLASS}>
                                <Input type="number" step="0.01" value={r.qtyMt}
                                  className={FAD_NUMERIC_INPUT_CLASS}
                                  onChange={(e) => updateRow(setFluxRows, r.id, { qtyMt: Number(e.target.value) })} />
                              </TableCell>
                              <TableCell className={`text-center font-mono ${moistureWarn(r.moisturePct) ? "text-amber-600 font-bold" : ""}`} title="From item spec">
                                {r.materialId ? `${r.moisturePct.toFixed(2)}%` : "—"}
                              </TableCell>
                              <TableCell className="bg-muted/40 text-center font-mono">{r.dryQty.toFixed(2)}</TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" onClick={() => removeRow(setFluxRows, r.id)} className="text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                            {err && (
                              <TableRow key={`${r.id}-err`}>
                                <TableCell colSpan={5} className="py-1 text-xs text-destructive bg-destructive/5">
                                  <AlertTriangle className="inline h-3 w-3 mr-1" />{err}
                                </TableCell>
                              </TableRow>
                            )}
                            </Fragment>
                            );
                          })}
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
                    <CardContent className="p-3 overflow-x-auto">
                      <Table className="min-w-[34rem] table-fixed text-xs [&_th]:h-8 [&_th]:px-2 [&_th]:py-1 [&_td]:py-1 [&_td]:px-2 [&_input]:h-8 [&_input]:text-xs [&_input]:px-2 [&_button[role=combobox]]:h-8 [&_button[role=combobox]]:text-xs [&_button[role=combobox]]:px-2">
                        <TableHeader>
                          <TableRow>
                            <TableHead className={FAD_MATERIAL_CELL_CLASS}>Material</TableHead>
                            <TableHead className={FAD_QTY_CELL_CLASS}>Qty (Kg)</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pasteRows.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className={FAD_MATERIAL_CELL_CLASS}>
                                <Select value={p.materialId} onValueChange={(v) => updateRow(setPasteRows, p.id, { materialId: v })}>
                                  <SelectTrigger><SelectValue placeholder="Pick paste" /></SelectTrigger>
                                  <SelectContent>
                                    {materialsByKind.paste.map((m) => (
                                      <SelectItem key={m.id} value={m.id}>{m.code} — {m.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className={FAD_QTY_CELL_CLASS}>
                                <Input type="number" step="0.01" value={p.qtyKg}
                                  className={FAD_NUMERIC_INPUT_CLASS}
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
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">FG Si %</label>
                        <Input type="number" step="0.01" value={fgSiPct} onChange={(e) => setFgSiPct(e.target.value)} placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Slag Qty (MT)</label>
                        <Input type="number" step="0.01" value={slagQtyMt} onChange={(e) => setSlagQtyMt(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Slag MnO %</label>
                        <Input type="number" step="0.01" value={slagMnoPct} onChange={(e) => setSlagMnoPct(e.target.value)}
                          className={Number(slagMnoPct) > thresholds.slagMnoMaxPct ? "border-amber-500" : ""} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Slag SiO₂ %</label>
                        <Input type="number" step="0.01" value={slagSio2Pct} onChange={(e) => setSlagSio2Pct(e.target.value)} placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Dust Qty (MT)</label>
                        <Input type="number" step="0.01" value={dustQtyMt} onChange={(e) => setDustQtyMt(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Dust Mn %</label>
                        <Input type="number" step="0.01" value={dustMnPct} onChange={(e) => setDustMnPct(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Dust Si %</label>
                        <Input type="number" step="0.01" value={dustSiPct} onChange={(e) => setDustSiPct(e.target.value)} placeholder="0" />
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
                    <FlaskConical className="h-5 w-5 text-primary" /> Live Balance
                  </CardTitle>
                  <CardDescription>Real-time recovery &amp; loss calculation</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Tabs defaultValue="mn" className="w-full">
                    <TabsList className="grid grid-cols-2 mx-4 mt-2">
                      <TabsTrigger value="mn">Mn Balance</TabsTrigger>
                      <TabsTrigger value="si">Si Balance</TabsTrigger>
                    </TabsList>
                    <TabsContent value="mn" className="mt-0">
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
                    </TabsContent>

                    <TabsContent value="si" className="mt-0">
                  {/* Live Si Balance — mirror of Mn block; factor from admin settings (no hardcode) */}
                  <div className="p-4 space-y-2 border-b border-border">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold">Live Si Balance</h4>
                      <span className="text-[10px] text-muted-foreground font-mono" title="SiO₂→Si stoichiometric factor (admin-configurable)">
                        factor: {thresholds.sio2ToSiFactor.toFixed(3)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Si Input</span>
                      <span className="font-mono font-medium">{calc.totalSiInput.toFixed(2)} MT</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Metal Si Output</span>
                      <span className="font-mono font-medium">{calc.siBal.metalSi.toFixed(2)} MT</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-amber-600">Slag Si Output</span>
                      <span className="font-mono font-medium">{calc.siBal.slagSi.toFixed(2)} MT</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Dust Si Output</span>
                      <span className="font-mono font-medium">{calc.siBal.dustSi.toFixed(2)} MT</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-border font-bold">
                      <span>Total Si Output</span>
                      <span className="font-mono">{calc.siBal.totalOutputSi.toFixed(2)} MT</span>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/30 space-y-3">
                    <div>
                      <div className="flex justify-between items-end mb-1">
                        <span className="text-sm font-bold">Si Recovery</span>
                        <span className={`font-mono text-xl ${recoveryColor(calc.siBal.recoveryPct, thresholds.siRecoveryMinPct)}`}>
                          {calc.siBal.recoveryPct === null ? "—" : `${calc.siBal.recoveryPct.toFixed(2)}%`}
                        </span>
                      </div>
                      {calc.siBal.recoveryPct !== null && calc.siBal.recoveryPct > 0 && calc.siBal.recoveryPct < thresholds.siRecoveryMinPct && (
                        <p className="text-xs text-destructive flex items-center mt-1">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Low Si recovery (&lt;{thresholds.siRecoveryMinPct}%)
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div>
                        <span className="block text-xs text-muted-foreground mb-1">Si Slag Loss</span>
                        <span className="font-mono text-sm font-medium text-amber-600">{(calc.siBal.slagLossPct ?? 0).toFixed(2)}%</span>
                      </div>
                      <div>
                        <span className="block text-xs text-muted-foreground mb-1">Si Dust Loss</span>
                        <span className="font-mono text-sm font-medium">{(calc.siBal.dustLossPct ?? 0).toFixed(2)}%</span>
                      </div>
                      <div className="col-span-2">
                        <span className="block text-xs text-muted-foreground mb-1">Diffusion / Unaccounted</span>
                        <span className={`font-mono text-sm font-medium ${(calc.siBal.diffLossPct ?? 0) > 5 ? "text-destructive" : ""}`}>
                          {(calc.siBal.diffLossPct ?? 0).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    <div className="pt-3 flex justify-between items-center text-xs text-muted-foreground border-t border-border">
                      <span>Si balance check (~100%)</span>
                      <span className="font-mono font-bold">{calc.totalSiBalance.toFixed(1)}%</span>
                    </div>
                  </div>
                    </TabsContent>
                  </Tabs>

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
                    {blockingSpecErrors && (
                      <p className="text-xs text-destructive flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{specErrors.length} row{specErrors.length > 1 ? "s" : ""} blocked by missing item specs. Fix in Master Data → Items.</span>
                      </p>
                    )}
                    {/* Phase 2 — Validation & Alert Engine output */}
                    {heatIssues.length > 0 && (
                      <div className="space-y-1">
                        {heatIssues.slice(0, 5).map((i, idx) => (
                          <p key={idx} className={`text-xs flex items-start gap-1 ${i.severity === "block" ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>
                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            <span><strong>{i.severity === "block" ? "Block" : "Warn"}:</strong> {i.message}</span>
                          </p>
                        ))}
                        {heatIssues.length > 5 && (
                          <p className="text-xs text-muted-foreground">+ {heatIssues.length - 5} more…</p>
                        )}
                      </div>
                    )}
                    <Button onClick={() => handleSave("draft")} variant="outline" className="w-full" disabled={saving !== null || loadingMasters || blockingSpecErrors}>
                      {saving === "draft" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                      Save Draft
                    </Button>
                    <Button onClick={() => handleSave("submitted")} className="w-full" disabled={saving !== null || loadingMasters || blockingSpecErrors || heatHasBlock}>
                      {saving === "submitted" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                      Submit to Plant Head{heatIssueSummary.warn > 0 && !heatHasBlock ? ` (${heatIssueSummary.warn} warning${heatIssueSummary.warn>1?"s":""})` : ""}
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
