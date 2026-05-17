/**
 * Portal — DRI Kiln Production (Phase B).
 *
 * Profile: dri. Rendered from PortalProductionDispatcher when the active
 * workspace profile is `dri`. Replaces the Phase A placeholder with:
 *   - KPI tiles (Sponge MT today/month, Metallization, FeM, Coal rate, Availability)
 *   - Shift Log entry form
 *   - Recent shift logs table
 *   - Active campaigns table
 *
 * SSOT: WORKSPACE_PROFILES.md §2.3 + §8 (dri validation rules).
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
  createShiftLog,
  listCampaigns,
  listKilns,
  listShiftLogs,
  rollupKilnKpis,
  validateShiftLog,
  type Kiln,
  type KilnCampaign,
  type KilnShiftLog,
  type KilnShiftLogInput,
} from "@/lib/dri-production";

const todayISO = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number | null, d = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toFixed(d);

interface FormState {
  kilnId: string;
  shiftId: string;
  campaignId: string;
  logDate: string;
  campaignDay: string;
  ironOreMt: string;
  coalMt: string;
  dolomiteMt: string;
  spongeMt: string;
  charMt: string;
  dolocharMt: string;
  metallizationPct: string;
  femPct: string;
  downtimeMin: string;
  downtimeReason: string;
  notes: string;
}

const emptyForm: FormState = {
  kilnId: "",
  shiftId: "",
  campaignId: "",
  logDate: todayISO(),
  campaignDay: "",
  ironOreMt: "",
  coalMt: "",
  dolomiteMt: "",
  spongeMt: "",
  charMt: "",
  dolocharMt: "",
  metallizationPct: "",
  femPct: "",
  downtimeMin: "0",
  downtimeReason: "",
  notes: "",
};

function toInput(form: FormState, profitCenterId: string): KilnShiftLogInput {
  const n = (s: string): number => (s.trim() === "" ? 0 : Number(s));
  const nOrNull = (s: string): number | null => (s.trim() === "" ? null : Number(s));
  const intOrNull = (s: string): number | null => (s.trim() === "" ? null : Math.trunc(Number(s)));
  return {
    profitCenterId,
    kilnId: form.kilnId,
    shiftId: form.shiftId,
    campaignId: form.campaignId || null,
    logDate: form.logDate,
    campaignDay: intOrNull(form.campaignDay),
    ironOreMt: n(form.ironOreMt),
    coalMt: n(form.coalMt),
    dolomiteMt: n(form.dolomiteMt),
    spongeMt: n(form.spongeMt),
    charMt: n(form.charMt),
    dolocharMt: n(form.dolocharMt),
    metallizationPct: nOrNull(form.metallizationPct),
    femPct: nOrNull(form.femPct),
    downtimeMin: Math.trunc(n(form.downtimeMin)),
    downtimeReason: form.downtimeReason.trim() || null,
    notes: form.notes.trim() || null,
  };
}

export default function PortalKilnProduction() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();

  const pcId = activeProfitCenter?.id ?? null;
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [kilns, setKilns] = useState<Kiln[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [campaigns, setCampaigns] = useState<KilnCampaign[]>([]);
  const [logs, setLogs] = useState<KilnShiftLog[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);

  const refresh = useCallback(async () => {
    if (!pcId) return;
    setLoading(true);
    try {
      const [k, s, c, l] = await Promise.all([
        listKilns(pcId),
        fetchShifts(pcId),
        listCampaigns(pcId),
        listShiftLogs(pcId, { limit: 100 }),
      ]);
      setKilns(k);
      setShifts(s);
      setCampaigns(c);
      setLogs(l);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load DRI data",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [pcId, toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const kpis = useMemo(() => rollupKilnKpis(logs), [logs]);
  const activeCampaigns = useMemo(() => campaigns.filter((c) => c.status === "active"), [campaigns]);
  const errors = useMemo(() => {
    if (!pcId) return [];
    return validateShiftLog(toInput(form, pcId));
  }, [form, pcId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pcId) return;
    const input = toInput(form, pcId);
    const errs = validateShiftLog(input);
    if (errs.length) {
      toast({
        variant: "destructive",
        title: "Cannot save shift log",
        description: errs.map((x) => x.message).join(" "),
      });
      return;
    }
    setSubmitting(true);
    try {
      await createShiftLog(input, session?.user?.id ?? null);
      toast({ title: "Shift log saved" });
      setForm({ ...emptyForm, logDate: form.logDate, kilnId: form.kilnId, shiftId: form.shiftId });
      await refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const kilnLabel = (id: string) => kilns.find((k) => k.id === id)?.code ?? "—";
  const shiftLabel = (id: string) => shifts.find((s) => s.id === id)?.code ?? "—";

  if (!pcId) {
    return (
      <Card>
        <CardHeader><CardTitle>No active workspace</CardTitle></CardHeader>
        <CardContent>Select a workspace to view kiln production.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">{activeProfitCenter?.name} · DRI</p>
        <h1 className="text-2xl font-semibold">Kiln Production</h1>
        <p className="text-sm text-muted-foreground">Shift-wise feed, sponge output, quality, and campaign tracking.</p>
      </header>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Sponge today" value={`${fmt(kpis.spongeMtToday, 2)} MT`} />
        <KpiTile label="Sponge this month" value={`${fmt(kpis.spongeMtThisMonth, 1)} MT`} />
        <KpiTile label="Metallization" value={kpis.avgMetallizationPct === null ? "—" : `${fmt(kpis.avgMetallizationPct, 1)} %`} />
        <KpiTile label="FeM" value={kpis.avgFemPct === null ? "—" : `${fmt(kpis.avgFemPct, 1)} %`} />
        <KpiTile label="Coal rate" value={kpis.coalRate === null ? "—" : fmt(kpis.coalRate, 3)} hint="MT coal / MT sponge" />
        <KpiTile label="Availability" value={kpis.availabilityPct === null ? "—" : `${fmt(kpis.availabilityPct, 1)} %`} />
      </div>

      <Tabs defaultValue="log" className="w-full">
        <TabsList>
          <TabsTrigger value="log">Shift Log Entry</TabsTrigger>
          <TabsTrigger value="recent">Recent Logs</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
        </TabsList>

        {/* ---------------- Entry ---------------- */}
        <TabsContent value="log" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Record kiln shift</CardTitle>
              <CardDescription>
                Iron ore + coal + dolomite total must be greater than zero. Metallization and FeM are 0–100 %.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {kilns.length === 0 && (
                <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                  <div>
                    No kilns configured for this workspace. Ask an admin to create kiln equipment before logging shifts.
                  </div>
                </div>
              )}
              <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-3">
                <FormSelect
                  label="Kiln"
                  value={form.kilnId}
                  onChange={(v) => setForm({ ...form, kilnId: v })}
                  options={kilns.filter((k) => k.isActive).map((k) => ({ value: k.id, label: `${k.code} — ${k.name}` }))}
                />
                <FormSelect
                  label="Shift"
                  value={form.shiftId}
                  onChange={(v) => setForm({ ...form, shiftId: v })}
                  options={shifts.filter((s) => s.isActive).map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))}
                />
                <FormField label="Log date" type="date" value={form.logDate} onChange={(v) => setForm({ ...form, logDate: v })} />

                <FormSelect
                  label="Campaign (optional)"
                  value={form.campaignId}
                  onChange={(v) => setForm({ ...form, campaignId: v })}
                  options={[{ value: "", label: "— none —" }, ...activeCampaigns
                    .filter((c) => !form.kilnId || c.kilnId === form.kilnId)
                    .map((c) => ({ value: c.id, label: `${c.campaignNo} (since ${c.startedOn})` }))]}
                />
                <FormField label="Campaign day" type="number" min="1" value={form.campaignDay} onChange={(v) => setForm({ ...form, campaignDay: v })} />
                <FormField label="Downtime (min)" type="number" min="0" value={form.downtimeMin} onChange={(v) => setForm({ ...form, downtimeMin: v })} />

                <FormField label="Iron ore (MT)" type="number" step="0.001" min="0" value={form.ironOreMt} onChange={(v) => setForm({ ...form, ironOreMt: v })} />
                <FormField label="Coal (MT)" type="number" step="0.001" min="0" value={form.coalMt} onChange={(v) => setForm({ ...form, coalMt: v })} />
                <FormField label="Dolomite (MT)" type="number" step="0.001" min="0" value={form.dolomiteMt} onChange={(v) => setForm({ ...form, dolomiteMt: v })} />

                <FormField label="Sponge (MT)" type="number" step="0.001" min="0" value={form.spongeMt} onChange={(v) => setForm({ ...form, spongeMt: v })} />
                <FormField label="Char (MT)" type="number" step="0.001" min="0" value={form.charMt} onChange={(v) => setForm({ ...form, charMt: v })} />
                <FormField label="Dolochar (MT)" type="number" step="0.001" min="0" value={form.dolocharMt} onChange={(v) => setForm({ ...form, dolocharMt: v })} />

                <FormField label="Metallization (%)" type="number" step="0.01" min="0" max="100" value={form.metallizationPct} onChange={(v) => setForm({ ...form, metallizationPct: v })} />
                <FormField label="FeM (%)" type="number" step="0.01" min="0" max="100" value={form.femPct} onChange={(v) => setForm({ ...form, femPct: v })} />
                <FormField label="Downtime reason" value={form.downtimeReason} onChange={(v) => setForm({ ...form, downtimeReason: v })} />

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
                  <Button type="submit" disabled={submitting || errors.length > 0 || kilns.length === 0}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save shift log
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Recent ---------------- */}
        <TabsContent value="recent" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent shift logs</CardTitle>
              <CardDescription>Last 100 entries for this workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                  Loading…
                </div>
              ) : logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No shift logs recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Kiln</TableHead>
                        <TableHead>Shift</TableHead>
                        <TableHead className="text-right">Feed (MT)</TableHead>
                        <TableHead className="text-right">Sponge (MT)</TableHead>
                        <TableHead className="text-right">Metallization %</TableHead>
                        <TableHead className="text-right">FeM %</TableHead>
                        <TableHead className="text-right">Downtime (min)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>{l.logDate}</TableCell>
                          <TableCell>{kilnLabel(l.kilnId)}</TableCell>
                          <TableCell>{shiftLabel(l.shiftId)}</TableCell>
                          <TableCell className="text-right">{fmt(l.ironOreMt + l.coalMt + l.dolomiteMt, 2)}</TableCell>
                          <TableCell className="text-right">{fmt(l.spongeMt, 2)}</TableCell>
                          <TableCell className="text-right">{fmt(l.metallizationPct, 1)}</TableCell>
                          <TableCell className="text-right">{fmt(l.femPct, 1)}</TableCell>
                          <TableCell className="text-right">{l.downtimeMin}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Campaigns ---------------- */}
        <TabsContent value="campaigns" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Campaign register</CardTitle>
              <CardDescription>Kiln campaigns track operating life between major shutdowns.</CardDescription>
            </CardHeader>
            <CardContent>
              {campaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No campaigns yet. An admin can create one from the kiln master.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Kiln</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Ended</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.campaignNo}</TableCell>
                        <TableCell>{kilnLabel(c.kilnId)}</TableCell>
                        <TableCell>{c.startedOn}</TableCell>
                        <TableCell>{c.endedOn ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={c.status === "active" ? "default" : c.status === "closed" ? "secondary" : "destructive"}>
                            {c.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ------------------- small helpers -------------------

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

function FormField({
  label, value, onChange, type = "text", step, min, max,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; step?: string; min?: string; max?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} step={step} min={min} max={max} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function FormSelect({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value || "__none"} value={o.value || "__none__"}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
