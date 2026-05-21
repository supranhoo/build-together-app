/**
 * Admin · Picker Contexts
 *
 * Workspace-scoped overrides for which materials each "screen slot" shows.
 * If a workspace has no row for a context, the global default seeded with
 * the table is used. Operators never see this — only admins.
 */
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import {
  deletePickerContext,
  fetchPickerContexts,
  upsertPickerContext,
  type PickerContext,
} from "@/lib/picker-contexts";
import { fetchMasterItems, type MasterItem } from "@/lib/master-data";

const BLANK = {
  id: "" as string | undefined,
  contextKey: "",
  screenLabel: "",
  materialType: "",
  groupName: "",
  subgroup: "",
  allowUnmapped: true,
  isActive: true,
};

export default function AdminPickerContexts() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const [rows, setRows] = useState<PickerContext[]>([]);
  const [form, setForm] = useState({ ...BLANK });
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    if (!activeProfitCenter) return;
    try { setRows(await fetchPickerContexts(activeProfitCenter.id)); }
    catch (e) { toast({ title: "Failed to load", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
  };

  useEffect(() => { void reload(); }, [activeProfitCenter?.id]);

  const workspaceRows = useMemo(
    () => rows.filter((r) => r.profitCenterId === activeProfitCenter?.id),
    [rows, activeProfitCenter?.id],
  );
  const globalRows = useMemo(() => rows.filter((r) => r.profitCenterId === null), [rows]);

  const startEdit = (r: PickerContext) => {
    setForm({
      id: r.profitCenterId === activeProfitCenter?.id ? r.id : undefined,
      contextKey: r.contextKey,
      screenLabel: r.screenLabel,
      materialType: r.materialType ?? "",
      groupName: r.groupName ?? "",
      subgroup: r.subgroup ?? "",
      allowUnmapped: r.allowUnmapped,
      isActive: r.isActive,
    });
  };

  const handleSave = async () => {
    if (!activeProfitCenter) return;
    if (!form.contextKey.trim() || !form.screenLabel.trim()) {
      toast({ title: "Context key and label are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await upsertPickerContext({
        id: form.id,
        profitCenterId: activeProfitCenter.id,
        contextKey: form.contextKey,
        screenLabel: form.screenLabel,
        materialType: form.materialType || null,
        groupName: form.groupName || null,
        subgroup: form.subgroup || null,
        allowUnmapped: form.allowUnmapped,
        isActive: form.isActive,
      });
      toast({ title: "Saved" });
      setForm({ ...BLANK });
      await reload();
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try { await deletePickerContext(id); await reload(); }
    catch (e) { toast({ title: "Delete failed", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
  };

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>Picker contexts</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Picker contexts — {activeProfitCenter.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Controls which materials appear in each dropdown across the app.
            Workspace overrides win over global defaults.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Context key</Label>
              <Input value={form.contextKey} onChange={(e) => setForm({ ...form, contextKey: e.target.value })} placeholder="fad.reductant" disabled={Boolean(form.id)} />
            </div>
            <div>
              <Label>Screen label</Label>
              <Input value={form.screenLabel} onChange={(e) => setForm({ ...form, screenLabel: e.target.value })} placeholder="FAD · Reductant" />
            </div>
            <div>
              <Label>Material type</Label>
              <Input value={form.materialType} onChange={(e) => setForm({ ...form, materialType: e.target.value })} placeholder="RM / FG / WIP / Consumable" />
            </div>
            <div>
              <Label>Group</Label>
              <Input value={form.groupName} onChange={(e) => setForm({ ...form, groupName: e.target.value })} placeholder="ORE / REDUCTANT / FLUXES / PASTE" />
            </div>
            <div>
              <Label>Subgroup</Label>
              <Input value={form.subgroup} onChange={(e) => setForm({ ...form, subgroup: e.target.value })} placeholder="SINTER / COKE …" />
            </div>
            <div className="flex items-end gap-4">
              <div className="flex items-center gap-2"><Switch checked={form.allowUnmapped} onCheckedChange={(v) => setForm({ ...form, allowUnmapped: v })} /><Label>Allow unmapped</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} /><Label>Active</Label></div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {form.id && <Button variant="ghost" onClick={() => setForm({ ...BLANK })}>Cancel</Button>}
            <Button onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving…" : form.id ? "Update override" : "Add override"}</Button>
          </div>
        </CardContent>
      </Card>

      <ContextTable title="Workspace overrides" rows={workspaceRows} canEdit onEdit={startEdit} onDelete={handleDelete} />
      <ContextTable title="Global defaults (read-only here)" rows={globalRows} canEdit={false} onEdit={startEdit} onDelete={handleDelete} />
    </div>
  );
}

function ContextTable({
  title, rows, canEdit, onEdit, onDelete,
}: {
  title: string; rows: PickerContext[]; canEdit: boolean;
  onEdit: (r: PickerContext) => void; onDelete: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead><TableHead>Label</TableHead>
              <TableHead>Type</TableHead><TableHead>Group</TableHead><TableHead>Subgroup</TableHead>
              <TableHead>Unmapped?</TableHead><TableHead>Active</TableHead><TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-muted-foreground">No rows.</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.contextKey}</TableCell>
                <TableCell>{r.screenLabel}</TableCell>
                <TableCell>{r.materialType ?? "—"}</TableCell>
                <TableCell>{r.groupName ?? "—"}</TableCell>
                <TableCell>{r.subgroup ?? "—"}</TableCell>
                <TableCell>{r.allowUnmapped ? "Yes" : "No"}</TableCell>
                <TableCell>{r.isActive ? "Yes" : "No"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => onEdit(r)}>{canEdit ? "Edit" : "Override"}</Button>
                  {canEdit && <Button variant="ghost" size="sm" onClick={() => onDelete(r.id)}>Delete</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
