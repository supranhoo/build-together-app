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
import { templateFieldsToChips } from "@/lib/spec-summary";
import { FIXED_SPEC_COLUMNS, getSpecValue } from "@/lib/spec-columns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment } from "react";

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
                <GroupSubgroupPicker
                  groups={groups}
                  group={form.groupName}
                  subgroup={form.subgroup}
                  onGroupChange={(v) => setForm({ ...form, groupName: v })}
                  onSubgroupChange={(v) => setForm({ ...form, subgroup: v })}
                  groupListId="spec-tpl-group-options"
                  subgroupListId="spec-tpl-subgroup-options"
                  subgroupPlaceholder="Blank = whole group"
                />
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
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Subgroup</TableHead>
              <TableHead>Fields</TableHead>
              {FIXED_SPEC_COLUMNS.map((c) => (
                <TableHead key={c.key} className="whitespace-nowrap">
                  {c.key}{c.unit ? ` (${c.unit})` : ""}
                </TableHead>
              ))}
              <TableHead>Required</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={9 + FIXED_SPEC_COLUMNS.length} className="text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!loading && templates.map((t) => {
              const reqCount = t.fields.filter((f) => f.required).length;
              const chips = templateFieldsToChips(t.fields, 8);
              const overflow = t.fields.length - chips.length;
              const isOpen = expanded.has(t.id);
              // Build a synthetic specs object so the same `getSpecValue` lookup
              // works on template fields (value = formatted range / "✓").
              const fieldSummary: Record<string, string> = {};
              for (const f of t.fields) {
                const min = (f.min ?? "").toString().trim();
                const max = (f.max ?? "").toString().trim();
                let display = "✓";
                if (min && max) display = `${min}–${max}`;
                else if (min) display = `≥${min}`;
                else if (max) display = `≤${max}`;
                fieldSummary[f.key] = display;
              }
              return (
                <Fragment key={t.id}>
                  <TableRow>
                    <TableCell className="w-8 align-top">
                      {t.fields.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => toggleExpanded(t.id)}
                          aria-label={isOpen ? "Collapse fields" : "Expand fields"}
                        >
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="font-medium align-top">{t.type}</TableCell>
                    <TableCell className="align-top">{t.groupName}</TableCell>
                    <TableCell className="align-top">{t.subgroup === "" ? <Badge variant="outline">whole group</Badge> : t.subgroup}</TableCell>
                    <TableCell className="max-w-[24rem] align-top">
                      {chips.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {chips.map((c) => (
                            <Badge key={c.key} variant="outline" className="font-normal">{c.label}</Badge>
                          ))}
                          {overflow > 0 && (
                            <Badge variant="secondary" className="font-normal" title={`${overflow} more field${overflow === 1 ? "" : "s"}`}>
                              +{overflow}
                            </Badge>
                          )}
                        </div>
                      )}
                    </TableCell>
                    {FIXED_SPEC_COLUMNS.map((c) => {
                      const v = getSpecValue(fieldSummary, c);
                      return (
                        <TableCell key={c.key} className="whitespace-nowrap tabular-nums align-top">
                          {v ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      );
                    })}
                    <TableCell className="align-top">{reqCount}</TableCell>
                    <TableCell className="align-top">{t.isActive ? "Yes" : "No"}</TableCell>
                    <TableCell className="align-top"><Button size="sm" variant="outline" onClick={() => openEdit(t)}>Edit</Button></TableCell>
                  </TableRow>
                  {isOpen && t.fields.length > 0 && (
                    <TableRow className="bg-panel/40">
                      <TableCell></TableCell>
                      <TableCell colSpan={8 + FIXED_SPEC_COLUMNS.length} className="py-3">
                        <div className="rounded-md border border-border bg-card">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Key</TableHead>
                                <TableHead>Label</TableHead>
                                <TableHead>Unit</TableHead>
                                <TableHead>Required</TableHead>
                                <TableHead>Numeric</TableHead>
                                <TableHead>Min</TableHead>
                                <TableHead>Max</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {t.fields.map((f, i) => (
                                <TableRow key={`${f.key}-${i}`}>
                                  <TableCell className="font-mono text-xs">{f.key}</TableCell>
                                  <TableCell>{f.label || "—"}</TableCell>
                                  <TableCell>{f.unit || "—"}</TableCell>
                                  <TableCell>{f.required ? "Yes" : "No"}</TableCell>
                                  <TableCell>{f.numeric ? "Yes" : "No"}</TableCell>
                                  <TableCell>{f.min || "—"}</TableCell>
                                  <TableCell>{f.max || "—"}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            {!loading && templates.length === 0 && (
              <TableRow>
                <TableCell colSpan={9 + FIXED_SPEC_COLUMNS.length} className="text-muted-foreground">
                  No spec templates yet. Click "New template" to define mandatory specs for a Type / Group / Subgroup.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </CardContent>
    </Card>
  );
}
