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
import PortalProductionEnergy from "./PortalProductionEnergy";
import PortalProductionQuality from "./PortalProductionQuality";
import PortalProductionConsumption from "./PortalProductionConsumption";
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
  fetchMetallurgyByPC,
  upsertMetallurgy,
  type HeatMetallurgy,
  type HeatMetallurgyStatus,
} from "@/lib/heat-metallurgy";
import { mnBalance, mnInput, type MaterialSpecLookup } from "@/lib/ferro-alloys";
import { fetchProductionAlertThresholds, DEFAULT_PRODUCTION_ALERTS, type ProductionAlertThresholds } from "@/lib/production-alerts";
import { computeProductionKpis, indexMetallurgyByHeat } from "@/lib/production-rollups";





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
  const [allMetallurgy, setAllMetallurgy] = useState<HeatMetallurgy[]>([]);
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
      const [f, s, l, g, m, sl, mi, th, met] = await Promise.all([
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
        fetchMetallurgyByPC(activeProfitCenter.id).catch(() => [] as HeatMetallurgy[]),
      ]);
      setFurnaces(f);
      setShifts(s);
      setLogs(l);
      setGrants(g);
      setMaterials(m);
      setStockLocations(sl);
      setMasterItems(mi);
      setThresholds(th);
      setAllMetallurgy(met);
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

  // KPI strip — derived from SSOT (heat_logs + heat_metallurgy). Per POLICY §19,
  // production KPIs MUST come from these tables. No mock data.
  const metByHeat = indexMetallurgyByHeat(allMetallurgy);
  const kpis = computeProductionKpis(logs, metByHeat);
  const recoveryAlert = kpis.avgRecoveryPct !== null && kpis.avgRecoveryPct < thresholds.recoveryMinPct;

  const fmt = (v: number | null, digits = 2, suffix = "") =>
    v === null || !Number.isFinite(v) ? "—" : `${v.toFixed(digits)}${suffix}`;

  return (
    <div className="space-y-6">
      {/* Production KPI strip — sits ABOVE the existing tabs. Read-only. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-border bg-card shadow-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Production</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{fmt(kpis.totalProductionMt, 2)} <span className="text-sm font-normal text-muted-foreground">MT</span></div>
            <div className="text-xs text-muted-foreground mt-1">{kpis.heatCount} heats (latest 200, voids excluded)</div>
          </CardContent>
        </Card>
        <Card className={`border-border bg-card shadow-panel ${recoveryAlert ? "border-destructive/60" : ""}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Avg Recovery</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-semibold ${recoveryAlert ? "text-destructive" : ""}`}>{fmt(kpis.avgRecoveryPct, 2, "%")}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {kpis.heatsWithMetallurgy} heats w/ metallurgy · target ≥ {thresholds.recoveryMinPct}%
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Avg kWh / MT</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{fmt(kpis.avgKwhPerMt, 0)}</div>
            <div className="text-xs text-muted-foreground mt-1">{fmt(kpis.totalPowerMwh, 2)} MWh total</div>
          </CardContent>
        </Card>
      </div>
      {/* Phase 24 — Production Entry – FAD module removed entirely at user
          request. Route /portal/production-fad, sidebar link, FAD tab, page
          component, and supporting libs/tests have been deleted. Production
          page is now analytics-only; heat creation is no longer available
          from the Production module. */}
      <Tabs defaultValue="furnace">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
          <TabsTrigger value="furnace" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Furnace Summary</TabsTrigger>
          <TabsTrigger value="monthly" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Monthly Summary</TabsTrigger>
          <TabsTrigger value="energy" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Energy</TabsTrigger>
          <TabsTrigger value="quality" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Quality</TabsTrigger>
          <TabsTrigger value="consumption" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Consumption</TabsTrigger>
        </TabsList>

        <TabsContent value="furnace" className="mt-4">
          <PortalProductionFurnaceSummary />
        </TabsContent>
        <TabsContent value="monthly" className="mt-4">
          <PortalProductionMonthly />
        </TabsContent>
        <TabsContent value="energy" className="mt-4">
          <PortalProductionEnergy />
        </TabsContent>
        <TabsContent value="quality" className="mt-4">
          <PortalProductionQuality />
        </TabsContent>
        <TabsContent value="consumption" className="mt-4">
          <PortalProductionConsumption />
        </TabsContent>
      </Tabs>
    </div>
  );
}
