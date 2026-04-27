import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { createAuditLog } from "@/lib/workspace";
import { fetchMaterialGroups, MATERIAL_TYPES, type MaterialGroup, type MaterialType } from "@/lib/master-data";
import {
  emptyTemplateField,
  fetchSpecTemplates,
  upsertSpecTemplate,
  validateTemplateFields,
  type SpecTemplate,
  type SpecTemplateField,
} from "@/lib/spec-templates";
import { SpecTemplateEditor } from "@/components/master-data/SpecTemplateEditor";
import { GroupSubgroupPicker } from "@/components/master-data/GroupSubgroupPicker";

interface FormState {
  id?: string;
  type: MaterialType | "";
  groupName: string;
  subgroup: string;
  fields: SpecTemplateField[];
  notes: string;
  isActive: boolean;
}

const empty: FormState = {
  type: "",
  groupName: "",
  subgroup: "",
  fields: [],
  notes: "",
  isActive: true,
};

/**
 * Specifications — manage Spec Templates per material nature
 * (Type + Group + Subgroup). Mounted as a tab inside Master Data so it
 * lives next to Item Master and Group & Hierarchy. See
 * `src/lib/spec-templates.ts` for the storage and mapping contract.
 */
export default function AdminSpecTemplates() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<SpecTemplate[]>([]);
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!activeProfitCenter) return;
    setLoading(true);
    try {
      const [tplRes, grpRes] = await Promise.all([
        fetchSpecTemplates(activeProfitCenter.id),
        fetchMaterialGroups(activeProfitCenter.id).catch(() => [] as MaterialGroup[]),
      ]);
      setTemplates(tplRes);
      setGroups(grpRes);
    } catch (e) {
      toast({ title: "Load failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [activeProfitCenter?.id]);

  const fieldErrors = useMemo(() => validateTemplateFields(form.fields), [form.fields]);

  const openNew = () => {
    setForm({ ...empty, fields: [emptyTemplateField()] });
    setOpen(true);
  };

  const openEdit = (t: SpecTemplate) => {
    setForm({
      id: t.id,
      type: (t.type as MaterialType) ?? "",
      groupName: t.groupName,
      subgroup: t.subgroup,
      fields: t.fields.length > 0 ? t.fields : [emptyTemplateField()],
      notes: t.notes ?? "",
      isActive: t.isActive,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (!form.type || !form.groupName.trim()) {
      toast({ title: "Type and Group are required", variant: "destructive" });
      return;
    }
    if (fieldErrors.length > 0) {
      toast({
        title: "Fix template errors before saving",
        description: fieldErrors.map((e) => e.message).join("; "),
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await upsertSpecTemplate({
        id: form.id,
        profitCenterId: activeProfitCenter.id,
        createdBy: session.user.id,
        type: form.type,
        groupName: form.groupName.trim(),
        subgroup: form.subgroup.trim(),
        fields: form.fields,
        notes: form.notes.trim() || null,
        isActive: form.isActive,
      });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "spec_template",
        action: form.id ? "spec_template.updated" : "spec_template.created",
        changeSummary: {
          type: form.type,
          group: form.groupName,
          subgroup: form.subgroup || "(group-level)",
          field_count: form.fields.length,
        },
      });
      toast({ title: "Spec template saved" });
      setOpen(false);
      await load();
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardHeader><CardTitle>Specifications</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">Select a workspace first.</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Specifications — {activeProfitCenter.name}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Define the spec fields each item nature must carry. Operators apply a template to an item from the Item Master form.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}>New template</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{form.id ? "Edit spec template" : "New spec template"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as MaterialType })}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {MATERIAL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Group</Label>
                  <Input
                    value={form.groupName}
                    onChange={(e) => setForm({ ...form, groupName: e.target.value })}
                    placeholder="e.g. Ores"
                  />
                </div>
                <div>
                  <Label>Subgroup (optional)</Label>
                  <Input
                    value={form.subgroup}
                    onChange={(e) => setForm({ ...form, subgroup: e.target.value })}
                    placeholder="Blank = whole group"
                  />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Why this template exists, source standard, etc."
                />
              </div>
              <SpecTemplateEditor
                fields={form.fields}
                errors={fieldErrors}
                onChange={(fields) => setForm({ ...form, fields })}
              />
              <div className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
                <span>Active</span>
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={() => void handleSave()}
                disabled={saving || fieldErrors.length > 0}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Subgroup</TableHead>
              <TableHead>Fields</TableHead>
              <TableHead>Required</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={7} className="text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!loading && templates.map((t) => {
              const reqCount = t.fields.filter((f) => f.required).length;
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.type}</TableCell>
                  <TableCell>{t.groupName}</TableCell>
                  <TableCell>{t.subgroup === "" ? <Badge variant="outline">whole group</Badge> : t.subgroup}</TableCell>
                  <TableCell>{t.fields.length}</TableCell>
                  <TableCell>{reqCount}</TableCell>
                  <TableCell>{t.isActive ? "Yes" : "No"}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(t)}>Edit</Button></TableCell>
                </TableRow>
              );
            })}
            {!loading && templates.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No spec templates yet. Click "New template" to define mandatory specs for a Type / Group / Subgroup.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
