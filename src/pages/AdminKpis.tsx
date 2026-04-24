import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  applySharedPinDefaults,
  buildDateRange,
  canShareKpiPin,
  computeKpi,
  fetchKpiDefinitions,
  upsertKpiDefinition,
  type KpiDefinition,
  type KpiResult,
} from "@/lib/reporting";
import { createAuditLog, fetchProfitCenterSettings, upsertProfitCenterSetting } from "@/lib/workspace";
import { SharedPinBulkDialog } from "@/components/SharedPinBulkDialog";
import { ProfitCenterSelectField } from "@/components/ProfitCenterSelectField";

const SHARED_PIN_DEFAULTS_KEY = "shared_pin_defaults";

interface FormState {
  id?: string;
  profitCenterId: string;
  key: string;
  displayName: string;
  unit: string;
  formula: string;
  sortOrder: string;
  isActive: boolean;
}

const empty: FormState = { profitCenterId: "", key: "", displayName: "", unit: "", formula: "{\n  \"source\": \"heat_logs\",\n  \"agg\": \"count\"\n}", sortOrder: "100", isActive: true };

export default function AdminKpis() {
  const { activeProfitCenter, isAdmin, isSuperAdmin, assignments, selectProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [defs, setDefs] = useState<KpiDefinition[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<KpiResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [defaultsIds, setDefaultsIds] = useState<string[]>([]);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [defaultsSaving, setDefaultsSaving] = useState(false);
  const [applyingDefaults, setApplyingDefaults] = useState(false);

  const managedProfitCenterIds = useMemo(
    () => assignments.filter((a) => a.isActive).map((a) => a.profitCenterId),
    [assignments],
  );
  const canManageDefaults = activeProfitCenter
    ? canShareKpiPin({
        isSuperAdmin,
        isAdmin,
        profitCenterId: activeProfitCenter.id,
        managedProfitCenterIds,
      })
    : false;

  const loadDefaults = async () => {
    if (!activeProfitCenter) return;
    try {
      const settings = await fetchProfitCenterSettings(activeProfitCenter.id);
      const row = settings.find((s) => s.settingKey === SHARED_PIN_DEFAULTS_KEY);
      const ids = (row?.settingValue as { kpi_definition_ids?: unknown })?.kpi_definition_ids;
      setDefaultsIds(Array.isArray(ids) ? (ids as string[]) : []);
    } catch (err) {
      // Non-fatal — admins without settings access just see an empty list.
      setDefaultsIds([]);
    }
  };

  useEffect(() => { void loadDefaults(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id]);

  const handleSaveDefaults = async (orderedIds: string[]) => {
    if (!activeProfitCenter || !session?.user || !canManageDefaults) return;
    setDefaultsSaving(true);
    try {
      await upsertProfitCenterSetting({
        profitCenterId: activeProfitCenter.id,
        settingKey: SHARED_PIN_DEFAULTS_KEY,
        scope: "workspace",
        settingValue: { kpi_definition_ids: orderedIds },
      });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "profit_center_setting",
        action: "shared_pin_defaults.updated",
        changeSummary: { kpi_definition_ids: orderedIds, count: orderedIds.length },
      });
      setDefaultsIds(orderedIds);
      toast({ title: "Defaults saved", description: `${orderedIds.length} KPI(s) marked as workspace defaults.` });
      setDefaultsOpen(false);
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setDefaultsSaving(false);
    }
  };

  const handleApplyDefaults = async () => {
    if (!activeProfitCenter || !session?.user || !canManageDefaults) return;
    if (defaultsIds.length === 0) {
      toast({ title: "No defaults configured", description: "Edit defaults first.", variant: "destructive" });
      return;
    }
    setApplyingDefaults(true);
    try {
      const result = await applySharedPinDefaults({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        kpiDefinitionIds: defaultsIds,
      });
      toast({
        title: "Defaults applied",
        description: `${result.shared} shared · ${result.unshared} unshared${
          result.errors.length > 0 ? ` · ${result.errors.length} failed` : ""
        }`,
        variant: result.errors.length > 0 ? "destructive" : "default",
      });
    } catch (err) {
      toast({ title: "Apply failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setApplyingDefaults(false);
    }
  };


  const load = async () => {
    if (!activeProfitCenter) return;
    setDefs(await fetchKpiDefinitions(activeProfitCenter.id));
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id]);

  const openNew = () => { setForm({ ...empty, profitCenterId: activeProfitCenter?.id ?? "" }); setPreview(null); setOpen(true); };
  const openEdit = (d: KpiDefinition) => {
    setForm({
      id: d.profitCenterId === activeProfitCenter?.id ? d.id : undefined,
      profitCenterId: d.profitCenterId ?? activeProfitCenter?.id ?? "",
      key: d.key,
      displayName: d.displayName,
      unit: d.unit,
      formula: JSON.stringify(d.formula, null, 2),
      sortOrder: String(d.sortOrder),
      isActive: d.isActive,
    });
    setPreview(null);
    setOpen(true);
  };

  const parseFormula = (): Record<string, unknown> | null => {
    try { return JSON.parse(form.formula); } catch { return null; }
  };

  const handlePreview = async () => {
    if (!activeProfitCenter) return;
    const parsed = parseFormula();
    if (!parsed) {
      toast({ title: "Invalid formula JSON", variant: "destructive" });
      return;
    }
    setPreviewLoading(true);
    try {
      // Save under a probe key first? Simpler: persist temp def then preview via key — but we want non-destructive.
      // Use the existing key if present (workspace override or global) for live preview.
      const result = await computeKpi(activeProfitCenter.id, form.key, buildDateRange("7d"));
      setPreview(result);
    } catch (err) {
      toast({ title: "Preview failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (!form.profitCenterId) {
      toast({ title: "Profit Center mapping is mandatory", variant: "destructive" });
      return;
    }
    if (!form.key.trim() || !form.displayName.trim()) {
      toast({ title: "Key and display name are required", variant: "destructive" });
      return;
    }
    const parsed = parseFormula();
    if (!parsed) {
      toast({ title: "Invalid formula JSON", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await upsertKpiDefinition({
        id: form.id,
        profitCenterId: form.profitCenterId,
        key: form.key.trim(),
        displayName: form.displayName.trim(),
        unit: form.unit.trim(),
        formula: parsed,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: form.profitCenterId,
        entityType: "kpi_definition",
        action: form.id ? "kpi.updated" : "kpi.created",
        changeSummary: { key: form.key, displayName: form.displayName, profit_center_id: form.profitCenterId },
      });
      toast({ title: "KPI saved" });
      setOpen(false);
      await load();
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>KPIs</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      {canManageDefaults && (
        <Card className="border-border bg-card shadow-panel">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Workspace shared-pin defaults</CardTitle>
              <CardDescription>
                {defaultsIds.length === 0
                  ? "No defaults configured. New workspaces start with no shared pins."
                  : `${defaultsIds.length} KPI(s) marked as defaults for ${activeProfitCenter.name}.`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setDefaultsOpen(true)}>Edit defaults</Button>
              <Button size="sm" onClick={() => void handleApplyDefaults()} disabled={applyingDefaults || defaultsIds.length === 0}>
                {applyingDefaults ? "Applying…" : "Apply to this workspace now"}
              </Button>
            </div>
          </CardHeader>
        </Card>
      )}

      <Card className="border-border bg-card shadow-panel">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>KPI definitions — {activeProfitCenter.name}</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openNew}>New KPI</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{form.id ? "Edit KPI" : "New KPI"}</DialogTitle></DialogHeader>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <ProfitCenterSelectField
                    value={form.profitCenterId}
                    onChange={(v) => setForm({ ...form, profitCenterId: v })}
                    disabled={Boolean(form.id)}
                  />
                </div>
                <div><Label>Key</Label><Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="heats_per_day" /></div>
                <div><Label>Display name</Label><Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></div>
                <div><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="MT, kWh/MT, %" /></div>
                <div><Label>Sort order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></div>
                <div className="md:col-span-2">
                  <Label>Formula (JSON)</Label>
                  <Textarea rows={10} value={form.formula} onChange={(e) => setForm({ ...form, formula: e.target.value })} className="font-mono text-xs" />
                </div>
                <div className="md:col-span-2 flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
                  <span>Active</span>
                  <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                </div>
                {preview ? (
                  <div className="md:col-span-2 rounded-md border border-border bg-panel px-4 py-3 text-sm">
                    <span className="text-muted-foreground">Preview (last 7 days):</span>{" "}
                    <strong>{preview.value == null ? "—" : Number(preview.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>{" "}
                    {form.unit}
                    {preview.error ? <span className="ml-2 text-destructive">({preview.error})</span> : null}
                  </div>
                ) : null}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => void handlePreview()} disabled={previewLoading || !form.key.trim()}>{previewLoading ? "Previewing…" : "Preview"}</Button>
                <Button onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Key</TableHead><TableHead>Display name</TableHead><TableHead>Unit</TableHead><TableHead>Scope</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {defs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">{d.key}</TableCell>
                  <TableCell>{d.displayName}</TableCell>
                  <TableCell>{d.unit || "—"}</TableCell>
                  <TableCell>{d.profitCenterId ? "Workspace" : "Global default"}</TableCell>
                  <TableCell>{d.isActive ? "Yes" : "No"}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(d)}>{d.profitCenterId ? "Edit" : "Override"}</Button></TableCell>
                </TableRow>
              ))}
              {defs.length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground">No KPI definitions yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canManageDefaults && (
        <SharedPinBulkDialog
          open={defaultsOpen}
          onOpenChange={setDefaultsOpen}
          title="Workspace shared-pin defaults"
          description="Pick the KPIs that should be shared by default. Saved as workspace settings; apply explicitly via the button above."
          definitions={defs.filter((d) => d.isActive)}
          initialSelectedIds={defaultsIds}
          enableReorder
          saving={defaultsSaving}
          applyLabel="Save defaults"
          onApply={handleSaveDefaults}
        />
      )}
    </div>
  );
}
