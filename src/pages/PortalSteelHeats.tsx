/**
 * Portal — SMS Steel Heats Production (Phase B, Turn 1).
 *
 * Profile: steel_melting. Rendered from PortalProductionDispatcher when the
 * active workspace profile is `steel_melting`. Provides:
 *   - KPI tiles (Liquid steel today/month, Yield %, Metallic yield %, MWh/T)
 *   - Heat Log Entry form
 *   - Recent heats table
 *
 * SSOT: WORKSPACE_PROFILES.md §2.5 + §8 (steel_melting validation rules).
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
  createSmsHeat,
  listSmsFurnaces,
  listSmsHeats,
  rollupSmsKpis,
  validateHeat,
  type SmsFurnace,
  type SmsHeat,
  type SmsHeatInput,
} from "@/lib/sms-production";

const nowLocalISO = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
};
const fmt = (n: number | null, d = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toFixed(d);

interface FormState {
  smsFurnaceId: string;
  shiftId: string;
  heatNo: string;
  tapTime: string;
  scrapMt: string;
  hotMetalMt: string;
  driMt: string;
  ferroAlloysMt: string;
  liquidSteelMt: string;
  billetMt: string;
  ingotMt: string;
  powerMwh: string;
  cPct: string;
  mnPct: string;
  siPct: string;
  sPct: string;
  pPct: string;
  notes: string;
}

const emptyForm: FormState = {
  smsFurnaceId: "", shiftId: "", heatNo: "", tapTime: nowLocalISO(),
  scrapMt: "", hotMetalMt: "", driMt: "", ferroAlloysMt: "",
  liquidSteelMt: "", billetMt: "", ingotMt: "",
  powerMwh: "", cPct: "", mnPct: "", siPct: "", sPct: "", pPct: "", notes: "",
};

function toInput(form: FormState, profitCenterId: string): SmsHeatInput {
  const n = (s: string): number => (s.trim() === "" ? 0 : Number(s));
  const nOrNull = (s: string): number | null => (s.trim() === "" ? null : Number(s));
  return {
    profitCenterId,
    smsFurnaceId: form.smsFurnaceId,
    shiftId: form.shiftId,
    heatNo: form.heatNo.trim(),
    tapTime: form.tapTime ? new Date(form.tapTime).toISOString() : "",
    scrapMt: n(form.scrapMt),
    hotMetalMt: n(form.hotMetalMt),
    driMt: n(form.driMt),
    ferroAlloysMt: n(form.ferroAlloysMt),
    liquidSteelMt: n(form.liquidSteelMt),
    billetMt: n(form.billetMt),
    ingotMt: n(form.ingotMt),
    powerMwh: nOrNull(form.powerMwh),
    cPct: nOrNull(form.cPct),
    mnPct: nOrNull(form.mnPct),
    siPct: nOrNull(form.siPct),
    sPct: nOrNull(form.sPct),
    pPct: nOrNull(form.pPct),
    notes: form.notes.trim() || null,
  };
}

export default function PortalSteelHeats() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();

  const pcId = activeProfitCenter?.id ?? null;
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [furnaces, setFurnaces] = useState<SmsFurnace[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [heats, setHeats] = useState<SmsHeat[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);

  const refresh = useCallback(async () => {
    if (!pcId) return;
    setLoading(true);
    try {
      const [f, s, h] = await Promise.all([
        listSmsFurnaces(pcId),
        fetchShifts(pcId),
        listSmsHeats(pcId, { limit: 100 }),
      ]);
      setFurnaces(f);
      setShifts(s);
      setHeats(h);
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load SMS data", description: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }, [pcId, toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const kpis = useMemo(() => rollupSmsKpis(heats), [heats]);
  const errors = useMemo(() => {
    if (!pcId) return [];
    return validateHeat(toInput(form, pcId));
  }, [form, pcId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pcId) return;
    const input = toInput(form, pcId);
    const errs = validateHeat(input);
    if (errs.length) {
      toast({ variant: "destructive", title: "Cannot save heat", description: errs.map((x) => x.message).join(" ") });
      return;
    }
    setSubmitting(true);
    try {
      await createSmsHeat(input, session?.user?.id ?? null);
      toast({ title: "Heat saved" });
      setForm({ ...emptyForm, smsFurnaceId: form.smsFurnaceId, shiftId: form.shiftId, tapTime: nowLocalISO() });
      await refresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Save failed", description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const furnaceLabel = (id: string) => furnaces.find((f) => f.id === id)?.code ?? "—";
  const shiftLabel = (id: string) => shifts.find((s) => s.id === id)?.code ?? "—";

  if (!pcId) {
    return (
      <Card>
        <CardHeader><CardTitle>No active workspace</CardTitle></CardHeader>
        <CardContent>Select a workspace to view steel heats.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">{activeProfitCenter?.name} · SMS</p>
        <h1 className="text-2xl font-semibold">Steel Heats</h1>
        <p className="text-sm text-muted-foreground">Heat-wise charge mix, liquid steel & cast output, chemistry, and energy.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Liquid steel today" value={`${fmt(kpis.liquidSteelMtToday, 2)} MT`} />
        <KpiTile label="Liquid steel this month" value={`${fmt(kpis.liquidSteelMtThisMonth, 1)} MT`} />
        <KpiTile label="Billet this month" value={`${fmt(kpis.billetMtThisMonth, 1)} MT`} />
        <KpiTile label="Yield" value={kpis.yieldPct === null ? "—" : `${fmt(kpis.yieldPct, 1)} %`} hint="liquid / charge" />
        <KpiTile label="Metallic yield" value={kpis.metallicYieldPct === null ? "—" : `${fmt(kpis.metallicYieldPct, 1)} %`} hint="cast / liquid" />
        <KpiTile label="Energy" value={kpis.powerPerTonne === null ? "—" : fmt(kpis.powerPerTonne, 3)} hint="MWh / MT" />
      </div>

      <Tabs defaultValue="log" className="w-full">
        <TabsList>
          <TabsTrigger value="log">Heat Entry</TabsTrigger>
          <TabsTrigger value="recent">Recent Heats</TabsTrigger>
        </TabsList>

        <TabsContent value="log" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Record steel heat</CardTitle>
              <CardDescription>
                Charge mix total must be greater than zero, liquid steel must be greater than zero, chemistry % between 0–100.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {furnaces.length === 0 && (
                <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                  <div>No SMS furnaces configured. Ask an admin to create EAF/LF/CCM equipment before logging heats.</div>
                </div>
              )}
              <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-3">
                <FormSelect
                  label="Furnace"
                  value={form.smsFurnaceId}
                  onChange={(v) => setForm({ ...form, smsFurnaceId: v })}
                  options={furnaces.filter((f) => f.isActive).map((f) => ({ value: f.id, label: `${f.code} — ${f.name} (${f.furnaceType})` }))}
                />
                <FormSelect
                  label="Shift"
                  value={form.shiftId}
                  onChange={(v) => setForm({ ...form, shiftId: v })}
                  options={shifts.filter((s) => s.isActive).map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))}
                />
                <FormField label="Heat number" value={form.heatNo} onChange={(v) => setForm({ ...form, heatNo: v })} />

                <FormField label="Tap time" type="datetime-local" value={form.tapTime} onChange={(v) => setForm({ ...form, tapTime: v })} />
                <FormField label="Scrap (MT)" type="number" step="0.001" min="0" value={form.scrapMt} onChange={(v) => setForm({ ...form, scrapMt: v })} />
                <FormField label="Hot metal (MT)" type="number" step="0.001" min="0" value={form.hotMetalMt} onChange={(v) => setForm({ ...form, hotMetalMt: v })} />

                <FormField label="DRI (MT)" type="number" step="0.001" min="0" value={form.driMt} onChange={(v) => setForm({ ...form, driMt: v })} />
                <FormField label="Ferro alloys (MT)" type="number" step="0.001" min="0" value={form.ferroAlloysMt} onChange={(v) => setForm({ ...form, ferroAlloysMt: v })} />
                <FormField label="Liquid steel (MT)" type="number" step="0.001" min="0" value={form.liquidSteelMt} onChange={(v) => setForm({ ...form, liquidSteelMt: v })} />

                <FormField label="Billet (MT)" type="number" step="0.001" min="0" value={form.billetMt} onChange={(v) => setForm({ ...form, billetMt: v })} />
                <FormField label="Ingot (MT)" type="number" step="0.001" min="0" value={form.ingotMt} onChange={(v) => setForm({ ...form, ingotMt: v })} />
                <FormField label="Power (MWh)" type="number" step="0.001" min="0" value={form.powerMwh} onChange={(v) => setForm({ ...form, powerMwh: v })} />

                <FormField label="C %" type="number" step="0.001" min="0" max="100" value={form.cPct} onChange={(v) => setForm({ ...form, cPct: v })} />
                <FormField label="Mn %" type="number" step="0.001" min="0" max="100" value={form.mnPct} onChange={(v) => setForm({ ...form, mnPct: v })} />
                <FormField label="Si %" type="number" step="0.001" min="0" max="100" value={form.siPct} onChange={(v) => setForm({ ...form, siPct: v })} />

                <FormField label="S %" type="number" step="0.001" min="0" max="100" value={form.sPct} onChange={(v) => setForm({ ...form, sPct: v })} />
                <FormField label="P %" type="number" step="0.001" min="0" max="100" value={form.pPct} onChange={(v) => setForm({ ...form, pPct: v })} />

                <div className="md:col-span-3">
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
                </div>

                {errors.length > 0 && (
                  <ul className="md:col-span-3 list-disc rounded-md border border-destructive/30 bg-destructive/5 p-3 pl-7 text-xs text-destructive">
                    {errors.map((e) => <li key={e.field + e.message}>{e.message}</li>)}
                  </ul>
                )}

                <div className="md:col-span-3 flex justify-end">
                  <Button type="submit" disabled={submitting || errors.length > 0 || furnaces.length === 0}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save heat
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recent" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent heats</CardTitle>
              <CardDescription>Last 100 heats for this workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading…
                </div>
              ) : heats.length === 0 ? (
                <p className="text-sm text-muted-foreground">No heats recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tap</TableHead>
                        <TableHead>Heat #</TableHead>
                        <TableHead>Furnace</TableHead>
                        <TableHead>Shift</TableHead>
                        <TableHead className="text-right">Charge MT</TableHead>
                        <TableHead className="text-right">Liquid MT</TableHead>
                        <TableHead className="text-right">Billet MT</TableHead>
                        <TableHead className="text-right">C %</TableHead>
                        <TableHead className="text-right">Mn %</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {heats.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell>{new Date(h.tapTime).toLocaleString()}</TableCell>
                          <TableCell className="font-medium">{h.heatNo}</TableCell>
                          <TableCell>{furnaceLabel(h.smsFurnaceId)}</TableCell>
                          <TableCell>{shiftLabel(h.shiftId)}</TableCell>
                          <TableCell className="text-right">{fmt(h.scrapMt + h.hotMetalMt + h.driMt + h.ferroAlloysMt, 2)}</TableCell>
                          <TableCell className="text-right">{fmt(h.liquidSteelMt, 2)}</TableCell>
                          <TableCell className="text-right">{fmt(h.billetMt, 2)}</TableCell>
                          <TableCell className="text-right">{fmt(h.cPct, 3)}</TableCell>
                          <TableCell className="text-right">{fmt(h.mnPct, 3)}</TableCell>
                          <TableCell>
                            {h.isVoided ? <Badge variant="destructive">voided</Badge> : <Badge variant="secondary">active</Badge>}
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
