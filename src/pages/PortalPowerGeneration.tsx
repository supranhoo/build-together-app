/**
 * Portal — CPP Power Generation (Phase B, Turn 2).
 *
 * Profile: power. Rendered from PortalProductionDispatcher when the
 * active workspace profile is `power`. Provides:
 *   - KPI tiles (Gross/Net MWh today & month, Aux %, Fuel kg/MWh, Outage h, PLF)
 *   - Shift generation entry form
 *   - Recent logs table
 *
 * SSOT: WORKSPACE_PROFILES.md §2.1 + §8 (power validation rules).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Loader2 } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { fetchShifts, type Shift } from "@/lib/production";
import {
  createCppGenerationLog,
  listCppUnits,
  listCppGenerationLogs,
  rollupCppKpis,
  validateGenerationLog,
  type CppUnit,
  type CppGenerationLog,
  type CppGenerationInput,
} from "@/lib/cpp-production";

const todayIso = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number | null, d = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toFixed(d);

interface FormState {
  cppUnitId: string;
  shiftId: string;
  logDate: string;
  grossMwh: string;
  auxMwh: string;
  fuelKg: string;
  fuelType: string;
  outageMin: string;
  runMin: string;
  ashMt: string;
  remarks: string;
}

const emptyForm: FormState = {
  cppUnitId: "", shiftId: "", logDate: todayIso(),
  grossMwh: "", auxMwh: "", fuelKg: "", fuelType: "",
  outageMin: "0", runMin: "480", ashMt: "", remarks: "",
};

function toInput(form: FormState, profitCenterId: string): CppGenerationInput {
  const n = (s: string): number => (s.trim() === "" ? 0 : Number(s));
  const nOrNull = (s: string): number | null => (s.trim() === "" ? null : Number(s));
  return {
    profitCenterId,
    cppUnitId: form.cppUnitId,
    shiftId: form.shiftId,
    logDate: form.logDate,
    grossMwh: n(form.grossMwh),
    auxMwh: n(form.auxMwh),
    fuelKg: n(form.fuelKg),
    fuelType: form.fuelType.trim() || null,
    outageMin: n(form.outageMin),
    runMin: n(form.runMin),
    ashMt: nOrNull(form.ashMt),
    remarks: form.remarks.trim() || null,
  };
}

export default function PortalPowerGeneration() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();

  const pcId = activeProfitCenter?.id ?? null;
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [units, setUnits] = useState<CppUnit[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [logs, setLogs] = useState<CppGenerationLog[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);

  const refresh = useCallback(async () => {
    if (!pcId) return;
    setLoading(true);
    try {
      const [u, s, l] = await Promise.all([
        listCppUnits(pcId),
        fetchShifts(pcId),
        listCppGenerationLogs(pcId, { limit: 100 }),
      ]);
      setUnits(u);
      setShifts(s);
      setLogs(l);
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load CPP data", description: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }, [pcId, toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const totalCapacityMw = useMemo(
    () => units.filter((u) => u.isActive && u.unitType === "GENERATOR").reduce((s, u) => s + (u.capacityMw ?? 0), 0) || null,
    [units],
  );
  const kpis = useMemo(() => rollupCppKpis(logs, todayIso(), totalCapacityMw), [logs, totalCapacityMw]);
  const errors = useMemo(() => {
    if (!pcId) return [];
    return validateGenerationLog(toInput(form, pcId));
  }, [form, pcId]);

  const netMwhPreview = useMemo(() => {
    const g = Number(form.grossMwh || 0);
    const a = Number(form.auxMwh || 0);
    return Number.isFinite(g - a) ? g - a : 0;
  }, [form.grossMwh, form.auxMwh]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pcId) return;
    const input = toInput(form, pcId);
    const errs = validateGenerationLog(input);
    if (errs.length) {
      toast({ variant: "destructive", title: "Cannot save log", description: errs.map((x) => x.message).join(" ") });
      return;
    }
    setSubmitting(true);
    try {
      await createCppGenerationLog(input, session?.user?.id ?? null);
      toast({ title: "Generation log saved" });
      setForm({ ...emptyForm, cppUnitId: form.cppUnitId, shiftId: form.shiftId, logDate: form.logDate });
      await refresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Save failed", description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const unitLabel = (id: string) => units.find((u) => u.id === id)?.code ?? "—";
  const shiftLabel = (id: string) => shifts.find((s) => s.id === id)?.code ?? "—";

  if (!pcId) {
    return (
      <Card>
        <CardHeader><CardTitle>No active workspace</CardTitle></CardHeader>
        <CardContent>Select a workspace to view power generation.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">{activeProfitCenter?.name} · CPP</p>
        <h1 className="text-2xl font-semibold">Power Generation</h1>
        <p className="text-sm text-muted-foreground">Generation log, fuel & auxiliaries, outage tracker, PC allocation.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Gross MWh today" value={fmt(kpis.grossMwhToday, 2)} />
        <KpiTile label="Net MWh today" value={fmt(kpis.netMwhToday, 2)} />
        <KpiTile label="Net MWh this month" value={fmt(kpis.netMwhThisMonth, 1)} />
        <KpiTile label="Auxiliary" value={kpis.auxPct === null ? "—" : `${fmt(kpis.auxPct, 2)} %`} hint="aux / gross" />
        <KpiTile label="Fuel" value={kpis.fuelKgPerMwh === null ? "—" : fmt(kpis.fuelKgPerMwh, 2)} hint="kg / MWh" />
        <KpiTile label="PLF" value={kpis.plfPct === null ? "—" : `${fmt(kpis.plfPct, 1)} %`} hint={`Outage ${fmt(kpis.outageHoursThisMonth, 1)} h`} />
      </div>

      <Tabs defaultValue="log" className="w-full">
        <TabsList>
          <TabsTrigger value="log">Generation Entry</TabsTrigger>
          <TabsTrigger value="recent">Recent Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="log" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Record shift generation</CardTitle>
              <CardDescription>
                Aux MWh must be ≤ Gross MWh. Fuel kg must be &gt; 0 when gross &gt; 0. Outage + Run minutes should equal the shift duration.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {units.length === 0 && (
                <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                  <div>No CPP units configured. Ask an admin to create boiler/turbine/generator equipment before logging generation.</div>
                </div>
              )}
              <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-3">
                <FormSelect
                  label="Unit"
                  value={form.cppUnitId}
                  onChange={(v) => setForm({ ...form, cppUnitId: v })}
                  options={units.filter((u) => u.isActive).map((u) => ({ value: u.id, label: `${u.code} — ${u.name} (${u.unitType})` }))}
                />
                <FormSelect
                  label="Shift"
                  value={form.shiftId}
                  onChange={(v) => setForm({ ...form, shiftId: v })}
                  options={shifts.filter((s) => s.isActive).map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))}
                />
                <FormField label="Log date" type="date" value={form.logDate} onChange={(v) => setForm({ ...form, logDate: v })} />

                <FormField label="Gross MWh" type="number" step="0.001" min="0" value={form.grossMwh} onChange={(v) => setForm({ ...form, grossMwh: v })} />
                <FormField label="Aux MWh" type="number" step="0.001" min="0" value={form.auxMwh} onChange={(v) => setForm({ ...form, auxMwh: v })} />
                <div className="space-y-1.5">
                  <Label>Net MWh (derived)</Label>
                  <Input value={netMwhPreview.toFixed(3)} disabled />
                </div>

                <FormField label="Fuel (kg)" type="number" step="0.01" min="0" value={form.fuelKg} onChange={(v) => setForm({ ...form, fuelKg: v })} />
                <FormField label="Fuel type" value={form.fuelType} onChange={(v) => setForm({ ...form, fuelType: v })} />
                <FormField label="Ash (MT)" type="number" step="0.001" min="0" value={form.ashMt} onChange={(v) => setForm({ ...form, ashMt: v })} />

                <FormField label="Run minutes" type="number" step="1" min="0" value={form.runMin} onChange={(v) => setForm({ ...form, runMin: v })} />
                <FormField label="Outage minutes" type="number" step="1" min="0" value={form.outageMin} onChange={(v) => setForm({ ...form, outageMin: v })} />
                <div className="md:col-span-1" />

                <div className="md:col-span-3">
                  <Label>Remarks</Label>
                  <Textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} rows={2} />
                </div>

                {errors.length > 0 && (
                  <ul className="md:col-span-3 list-disc rounded-md border border-destructive/30 bg-destructive/5 p-3 pl-7 text-xs text-destructive">
                    {errors.map((e) => <li key={e.field + e.message}>{e.message}</li>)}
                  </ul>
                )}

                <div className="md:col-span-3 flex justify-end">
                  <Button type="submit" disabled={submitting || errors.length > 0 || units.length === 0}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save log
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recent" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent generation logs</CardTitle>
              <CardDescription>Last 100 logs for this workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading…
                </div>
              ) : logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No generation logs recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Shift</TableHead>
                        <TableHead className="text-right">Gross MWh</TableHead>
                        <TableHead className="text-right">Aux MWh</TableHead>
                        <TableHead className="text-right">Net MWh</TableHead>
                        <TableHead className="text-right">Fuel kg</TableHead>
                        <TableHead className="text-right">Outage min</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>{l.logDate}</TableCell>
                          <TableCell>{unitLabel(l.cppUnitId)}</TableCell>
                          <TableCell>{shiftLabel(l.shiftId)}</TableCell>
                          <TableCell className="text-right">{fmt(l.grossMwh, 3)}</TableCell>
                          <TableCell className="text-right">{fmt(l.auxMwh, 3)}</TableCell>
                          <TableCell className="text-right">{fmt(l.netMwh, 3)}</TableCell>
                          <TableCell className="text-right">{fmt(l.fuelKg, 1)}</TableCell>
                          <TableCell className="text-right">{l.outageMin}</TableCell>
                          <TableCell>
                            {l.isVoided ? <Badge variant="destructive">voided</Badge> : <Badge variant="secondary">active</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function FormField({ label, value, onChange, type = "text", step, min, max }: { label: string; value: string; onChange: (v: string) => void; type?: string; step?: string; min?: string; max?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} step={step} min={min} max={max} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function FormSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const NONE = "__none__";
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value === "" ? NONE : value} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value || NONE} value={o.value === "" ? NONE : o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
