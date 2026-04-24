import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { buildDateRange, computeKpi, fetchKpiDefinitions, upsertKpiDefinition, type KpiDefinition, type KpiResult } from "@/lib/reporting";
import { createAuditLog } from "@/lib/workspace";

interface FormState {
  id?: string;
  key: string;
  displayName: string;
  unit: string;
  formula: string;
  sortOrder: string;
  isActive: boolean;
}

const empty: FormState = { key: "", displayName: "", unit: "", formula: "{\n  \"source\": \"heat_logs\",\n  \"agg\": \"count\"\n}", sortOrder: "100", isActive: true };

export default function AdminKpis() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [defs, setDefs] = useState<KpiDefinition[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<KpiResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = async () => {
    if (!activeProfitCenter) return;
    setDefs(await fetchKpiDefinitions(activeProfitCenter.id));
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id]);

  const openNew = () => { setForm(empty); setPreview(null); setOpen(true); };
  const openEdit = (d: KpiDefinition) => {
    setForm({
      id: d.profitCenterId === activeProfitCenter?.id ? d.id : undefined,
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
        profitCenterId: activeProfitCenter.id,
        key: form.key.trim(),
        displayName: form.displayName.trim(),
        unit: form.unit.trim(),
        formula: parsed,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "kpi_definition",
        action: form.id ? "kpi.updated" : "kpi.created",
        changeSummary: { key: form.key, displayName: form.displayName },
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
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>KPI definitions — {activeProfitCenter.name}</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}>New KPI</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{form.id ? "Edit KPI" : "New KPI"}</DialogTitle></DialogHeader>
            <div className="grid gap-3 md:grid-cols-2">
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
  );
}
