import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  fetchMasterItems,
  fetchMaterialGroups,
  filterItems,
  upsertMasterItem,
  MATERIAL_TYPES,
  type MasterItem,
  type MaterialGroup,
  type MaterialType,
} from "@/lib/master-data";
import { downloadCsv, parseCsv, toCsv } from "@/lib/csv";
import {
  buildItemTemplateRows,
  itemsToCsvRows,
  parseItemCsv,
  type ParsedItemRow,
} from "@/lib/master-items-csv";
import { FIXED_SPEC_COLUMNS, getSpecValue } from "@/lib/spec-columns";
import { nextItemCode, nextItemCodeBatch, nextItemName } from "@/lib/master-items-code";
import {
  fetchGroupPropertyMap,
  fetchPropertyDefinitions,
  mergePropertyValuesIntoSpecs,
  resolvePropertiesForGroup,
  specsToFormValues,
  validatePropertyValue,
  type GroupPropertyLink,
  type PropertyDefinition,
  type ResolvedGroupProperty,
} from "@/lib/item-properties";

const UOMS = ["kg", "MT", "litre", "piece", "ton"];

interface FormState {
  id?: string;
  code: string;
  name: string;
  type: MaterialType | "";
  groupName: string;
  subgroup: string;
  uom: string;
  stdCost: string;
  /**
   * Property values keyed by canonical property_key (e.g. `Mn`, `FC`).
   * Drives the dynamic property inputs and is merged back into
   * `materials.specs` on save (compat shim — see lib/item-properties.ts).
   */
  propertyValues: Record<string, string>;
  /**
   * Pre-existing specs from the row being edited. Preserved verbatim so
   * non-managed keys (`_role`, `_category`, supplier-specific notes) stay
   * intact when we merge new property values back in.
   */
  baseSpecs: Record<string, unknown>;
  minLevel: string;
  maxLevel: string;
  reorderLevel: string;
  isActive: boolean;
}

const empty: FormState = {
  code: "",
  name: "",
  type: "",
  groupName: "",
  subgroup: "",
  uom: "kg",
  stdCost: "",
  propertyValues: {},
  baseSpecs: {},
  minLevel: "",
  maxLevel: "",
  reorderLevel: "",
  isActive: true,
};

export default function AdminMasterItems() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<MasterItem[]>([]);
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [propertyDefs, setPropertyDefs] = useState<PropertyDefinition[]>([]);
  const [groupPropertyMap, setGroupPropertyMap] = useState<GroupPropertyLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<MaterialType | "all">("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<{ inserted: number; failed: number; errors: string[] } | null>(null);

  const load = async () => {
    if (!activeProfitCenter) return;
    setLoading(true);
    try {
      const [itemsRes, groupsRes, defsRes, mapRes] = await Promise.all([
        fetchMasterItems(activeProfitCenter.id),
        fetchMaterialGroups(activeProfitCenter.id).catch(() => [] as MaterialGroup[]),
        fetchPropertyDefinitions(activeProfitCenter.id).catch(() => [] as PropertyDefinition[]),
        fetchGroupPropertyMap(activeProfitCenter.id).catch(() => [] as GroupPropertyLink[]),
      ]);
      setItems(itemsRes);
      setGroups(groupsRes);
      setPropertyDefs(defsRes);
      setGroupPropertyMap(mapRes);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id]);

  /**
   * Group/Subgroup dropdown options sourced from `material_groups` (admin-
   * managed master). Per Zero-Hardcoding rule (§10), operators select from
   * the curated hierarchy rather than typing freehand. New groups must be
   * added under Master Data → Group & Hierarchy first.
   */
  const groupSelectOptions = useMemo(() => {
    const set = new Set<string>();
    groups.forEach((g) => { if (g.isActive && g.parentGroup) set.add(g.parentGroup); });
    return Array.from(set).sort();
  }, [groups]);

  const subgroupSelectOptions = useMemo(() => {
    const target = form.groupName.trim().toLowerCase();
    if (!target) return [] as string[];
    const set = new Set<string>();
    groups.forEach((g) => {
      if (!g.isActive) return;
      if ((g.parentGroup ?? "").trim().toLowerCase() !== target) return;
      if (g.subgroup) set.add(g.subgroup);
    });
    return Array.from(set).sort();
  }, [groups, form.groupName]);

  const filtered = useMemo(() => filterItems(items, search, typeFilter, groupFilter), [items, search, typeFilter, groupFilter]);

  /**
   * Resolve which properties should appear on the form for the current
   * (type, group, subgroup). Drives the dynamic Chemical Properties section.
   * Pure — recomputed every keystroke.
   */
  const resolvedProps: ResolvedGroupProperty[] = useMemo(
    () => resolvePropertiesForGroup(
      propertyDefs,
      groupPropertyMap,
      form.type === "" ? null : form.type,
      form.groupName || null,
      form.subgroup || null,
    ),
    [propertyDefs, groupPropertyMap, form.type, form.groupName, form.subgroup],
  );

  /** Per-property validation errors (key → message). Recomputed on input. */
  const propertyErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    for (const { property, isRequired } of resolvedProps) {
      const msg = validatePropertyValue(property, form.propertyValues[property.propertyKey] ?? "", isRequired);
      if (msg) errs[property.propertyKey] = msg;
    }
    return errs;
  }, [resolvedProps, form.propertyValues]);

  const hasPropertyErrors = Object.keys(propertyErrors).length > 0;

  const openNew = () => { setForm(empty); setOpen(true); };
  const openEdit = (item: MasterItem) => {
    // Pre-fill form values from the item's existing specs so operators can
    // edit without losing prior data. Uses alias-tolerant lookup.
    const provisionalProps = resolvePropertiesForGroup(
      propertyDefs,
      groupPropertyMap,
      item.type,
      item.groupName,
      item.subgroup,
    );
    setForm({
      id: item.id,
      code: item.code,
      name: item.name,
      type: item.type ?? "",
      groupName: item.groupName ?? "",
      subgroup: item.subgroup ?? "",
      uom: item.uom,
      stdCost: item.stdCost?.toString() ?? "",
      propertyValues: specsToFormValues(item.specs, provisionalProps),
      baseSpecs: { ...(item.specs ?? {}) },
      minLevel: item.minLevel?.toString() ?? "",
      maxLevel: item.maxLevel?.toString() ?? "",
      reorderLevel: item.reorderLevel?.toString() ?? "",
      isActive: item.isActive,
    });
    setOpen(true);
  };

  /** When type/group/subgroup changes, repopulate property inputs from any
   *  values that already exist in `baseSpecs` (so operators don't lose data
   *  when correcting a wrong group). Pure inside setForm callback. */
  const refreshPropertyValuesForNewGroup = (
    nextForm: FormState,
  ): FormState => {
    const props = resolvePropertiesForGroup(
      propertyDefs,
      groupPropertyMap,
      nextForm.type === "" ? null : nextForm.type,
      nextForm.groupName || null,
      nextForm.subgroup || null,
    );
    const prefilled = specsToFormValues(nextForm.baseSpecs, props);
    // Preserve anything the operator has already typed for keys that survive
    // the group switch.
    const merged: Record<string, string> = { ...prefilled };
    for (const k of Object.keys(nextForm.propertyValues)) {
      if (props.some((p) => p.property.propertyKey === k)) {
        merged[k] = nextForm.propertyValues[k];
      }
    }
    return { ...nextForm, propertyValues: merged };
  };

  const handleTypeChange = useCallback((nextType: MaterialType) => {
    setForm((prev) => {
      const next = refreshPropertyValuesForNewGroup({ ...prev, type: nextType });
      // Auto-suggest code on type change (only for new items, never overwrite
      // an existing material's code).
      if (!prev.id) next.code = nextItemCode(items, nextType, next.groupName);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyDefs, groupPropertyMap, items]);

  const handleGroupChange = useCallback((nextGroup: string) => {
    setForm((prev) => {
      // Group switch invalidates the prior subgroup — clear it so the
      // operator picks a valid one from the cascading dropdown.
      const next = refreshPropertyValuesForNewGroup({
        ...prev,
        groupName: nextGroup,
        subgroup: "",
      });
      if (!prev.id) next.code = nextItemCode(items, prev.type, nextGroup);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyDefs, groupPropertyMap, items]);

  const handleSubgroupChange = useCallback((nextSubgroup: string) => {
    setForm((prev) => {
      const next = refreshPropertyValuesForNewGroup({ ...prev, subgroup: nextSubgroup });
      // Prefill the Name field with the subgroup so the operator only has
      // to append the distinguishing tail (e.g. "Mn-Ore" → "Mn-Ore HG Lump").
      // Preserves any name the operator has already customized.
      if (!prev.id) next.name = nextItemName(prev.name, prev.subgroup, nextSubgroup);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyDefs, groupPropertyMap, items]);

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: "Code and name are required", variant: "destructive" });
      return;
    }
    if (hasPropertyErrors) {
      toast({
        title: "Fix property errors before saving",
        description: Object.values(propertyErrors).join("; "),
        variant: "destructive",
      });
      return;
    }
    // Compat shim: write all property values back into materials.specs so
    // every downstream reader (FAD, Quality, Costing, …) keeps working.
    const specs = mergePropertyValuesIntoSpecs(form.baseSpecs, resolvedProps, form.propertyValues);
    setSaving(true);
    try {
      await upsertMasterItem({
        id: form.id,
        profitCenterId: activeProfitCenter.id,
        code: form.code.trim(),
        name: form.name.trim(),
        type: form.type === "" ? null : form.type,
        groupName: form.groupName.trim() || null,
        subgroup: form.subgroup.trim() || null,
        uom: form.uom,
        stdCost: form.stdCost ? Number(form.stdCost) : null,
        specs,
        minLevel: form.minLevel ? Number(form.minLevel) : null,
        maxLevel: form.maxLevel ? Number(form.maxLevel) : null,
        reorderLevel: form.reorderLevel ? Number(form.reorderLevel) : null,
        isActive: form.isActive,
      });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "item_master",
        action: form.id ? "item_master.updated" : "item_master.created",
        changeSummary: { code: form.code, name: form.name, type: form.type, group: form.groupName, subgroup: form.subgroup, profit_center_id: activeProfitCenter.id },
      });
      toast({ title: "Item saved" });
      setOpen(false);
      await load();
    } catch (error) {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadTemplate = () => {
    downloadCsv("item-master-template.csv", toCsv(buildItemTemplateRows()));
  };

  const handleExport = () => {
    if (!activeProfitCenter) return;
    const fname = `item-master-${activeProfitCenter.name.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsv(fname, toCsv(itemsToCsvRows(items)));
  };

  const handleBulkUpload = async (file: File) => {
    if (!activeProfitCenter || !session?.user) return;
    setImporting(true);
    setImportReport(null);
    try {
      const text = await file.text();
      const rawRows = parseCsv(text);
      const { rows, errors } = parseItemCsv(rawRows);
      const messages: string[] = errors.map((e) => `Row ${e.rowNumber}: ${e.message}`);
      // Pre-allocate system codes per (type, group) bucket so a single CSV
      // upload assigns N sequential codes without DB round-trips.
      const buckets = new Map<string, ParsedItemRow[]>();
      const keyOf = (r: ParsedItemRow) => `${r.input.type ?? ""}|${r.input.groupName ?? ""}`;
      for (const r of rows) {
        const k = keyOf(r);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k)!.push(r);
      }
      const codeFor = new Map<number, string>();
      let runningItems = items.slice();
      for (const [, bucket] of buckets) {
        const first = bucket[0].input;
        const allocated = nextItemCodeBatch(runningItems, first.type, first.groupName, bucket.length);
        bucket.forEach((r, i) => {
          codeFor.set(r.rowNumber, allocated[i] ?? "");
          // Feed back into the running list so the NEXT bucket sees these.
          runningItems = [
            ...runningItems,
            { code: allocated[i] ?? "", type: first.type, groupName: first.groupName } as MasterItem,
          ];
        });
      }
      let inserted = 0;
      for (const { rowNumber, input } of rows) {
        const code = codeFor.get(rowNumber) ?? "";
        if (!code) {
          messages.push(`Row ${rowNumber}: cannot generate code (type and group_name are required)`);
          continue;
        }
        try {
          await upsertMasterItem({ ...input, code, profitCenterId: activeProfitCenter.id });
          await createAuditLog({
            actorUserId: session.user.id,
            profitCenterId: activeProfitCenter.id,
            entityType: "item_master",
            action: "item_master.bulk_upserted",
            changeSummary: { code, name: input.name, type: input.type, source: "csv_bulk_upload" },
          });
          inserted += 1;
        } catch (e) {
          messages.push(`Row ${rowNumber} (${code}): ${e instanceof Error ? e.message : "save failed"}`);
        }
      }
      setImportReport({ inserted, failed: messages.length, errors: messages });
      toast({
        title: `Bulk upload finished — ${inserted} saved, ${messages.length} skipped`,
        variant: messages.length > 0 ? "destructive" : "default",
      });
      await load();
    } catch (e) {
      toast({ title: "Bulk upload failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>Item Master</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Item Master — {activeProfitCenter.name}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Search code, name, group…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as MaterialType | "all")}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {MATERIAL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              {groupSelectOptions.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleDownloadTemplate} title="Download a CSV template with example row">Template</Button>
          <Button variant="outline" onClick={handleExport} disabled={items.length === 0} title="Export current items to CSV">Export</Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleBulkUpload(f);
            }}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? "Uploading…" : "Bulk upload"}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openNew}>New item</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{form.id ? "Edit item" : "New item"}</DialogTitle></DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2 max-h-[60vh] overflow-y-auto pr-1">
                <div>
                  <Label>Code</Label>
                  {form.id ? (
                    // Edit mode: keep editable for admin overrides on legacy rows.
                    <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                  ) : (
                    // New mode: auto-generated as <TYPE>-<GROUP>-<NNNN> once Type
                    // and Group are picked. Read-only to keep coding consistent
                    // across the org.
                    <Input
                      value={form.code}
                      readOnly
                      disabled
                      placeholder="Auto — pick Type and Group"
                      className="bg-muted/40"
                    />
                  )}
                </div>
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div>
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => handleTypeChange(v as MaterialType)}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {MATERIAL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>UOM</Label>
                  <Select value={form.uom} onValueChange={(v) => setForm({ ...form, uom: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UOMS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Group</Label>
                  <Select value={form.groupName} onValueChange={handleGroupChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={groupSelectOptions.length === 0 ? "No groups defined" : "Select group"} />
                    </SelectTrigger>
                    <SelectContent>
                      {groupSelectOptions.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {groupSelectOptions.length === 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Add groups under <em>Master Data → Group &amp; Hierarchy</em>.
                    </p>
                  )}
                </div>
                <div>
                  <Label>Subgroup</Label>
                  <Select
                    value={form.subgroup}
                    onValueChange={handleSubgroupChange}
                    disabled={!form.groupName || subgroupSelectOptions.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={!form.groupName ? "Pick a group first" : subgroupSelectOptions.length === 0 ? "No subgroups defined" : "Select subgroup"} />
                    </SelectTrigger>
                    <SelectContent>
                      {subgroupSelectOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {form.groupName && subgroupSelectOptions.length === 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      No subgroups defined for <span className="font-medium">{form.groupName}</span>. Add them under <em>Master Data → Group &amp; Hierarchy</em>.
                    </p>
                  )}
                </div>
                <div><Label>Std cost</Label><Input type="number" step="0.0001" value={form.stdCost} onChange={(e) => setForm({ ...form, stdCost: e.target.value })} /></div>
                <div><Label>Reorder level</Label><Input type="number" step="0.001" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} /></div>
                <div><Label>Min level</Label><Input type="number" step="0.001" value={form.minLevel} onChange={(e) => setForm({ ...form, minLevel: e.target.value })} /></div>
                <div><Label>Max level</Label><Input type="number" step="0.001" value={form.maxLevel} onChange={(e) => setForm({ ...form, maxLevel: e.target.value })} /></div>

                {/* Dynamic Chemical Properties — driven by item_property_definitions × item_group_property_map.
                    The set of inputs changes as the operator picks Type / Group / Subgroup. */}
                <div className="sm:col-span-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Chemical Properties</Label>
                    {resolvedProps.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {form.type} · {form.groupName}{form.subgroup ? ` / ${form.subgroup}` : ""} · {resolvedProps.length} field{resolvedProps.length === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </div>
                  {resolvedProps.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border bg-panel/50 px-3 py-2 text-xs text-muted-foreground">
                      {form.type && form.groupName
                        ? <>No properties mapped for <strong className="text-foreground">{form.type} → {form.groupName}{form.subgroup ? ` → ${form.subgroup}` : ""}</strong>. Configure the mapping under <em>Master Data → Property Mapping</em> or contact your administrator.</>
                        : "Select Type and Group to load chemical property fields."}
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {resolvedProps.map(({ property, isRequired }) => {
                        const value = form.propertyValues[property.propertyKey] ?? "";
                        const err = propertyErrors[property.propertyKey];
                        return (
                          <div key={property.propertyKey}>
                            <Label className="text-xs flex items-center gap-1">
                              <span>{property.displayName}</span>
                              <span className="text-muted-foreground">({property.unit})</span>
                              {isRequired && <span className="text-destructive">*</span>}
                            </Label>
                            <Input
                              type={property.dataType === "decimal" ? "number" : "text"}
                              step={property.dataType === "decimal" ? Math.pow(10, -property.decimals).toString() : undefined}
                              value={value}
                              onChange={(e) => setForm({
                                ...form,
                                propertyValues: { ...form.propertyValues, [property.propertyKey]: e.target.value },
                              })}
                              className={err ? "border-destructive" : ""}
                              aria-invalid={Boolean(err)}
                              aria-describedby={err ? `prop-err-${property.propertyKey}` : undefined}
                            />
                            {err && (
                              <p id={`prop-err-${property.propertyKey}`} className="mt-1 text-xs text-destructive">{err}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
                  <span>Active</span>
                  <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => void handleSave()} disabled={saving || hasPropertyErrors}>{saving ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {importReport && (
          <div className={`mb-4 rounded-md border p-3 text-sm ${importReport.failed > 0 ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"}`}>
            <div className="flex items-center justify-between">
              <span><strong>{importReport.inserted}</strong> rows saved · <strong>{importReport.failed}</strong> skipped</span>
              <Button size="sm" variant="ghost" onClick={() => setImportReport(null)}>Dismiss</Button>
            </div>
            {importReport.errors.length > 0 && (
              <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5 text-xs">
                {importReport.errors.slice(0, 100).map((msg, i) => <li key={i}>{msg}</li>)}
                {importReport.errors.length > 100 && <li>…and {importReport.errors.length - 100} more</li>}
              </ul>
            )}
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Subgroup</TableHead>
              <TableHead>UOM</TableHead>
              <TableHead>Std cost</TableHead>
              <TableHead>Reorder</TableHead>
              {FIXED_SPEC_COLUMNS.map((c) => (
                <TableHead key={c.key} className="whitespace-nowrap">
                  {c.key}{c.unit ? ` (${c.unit})` : ""}
                </TableHead>
              ))}
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={10 + FIXED_SPEC_COLUMNS.length} className="text-muted-foreground">Loading…</TableCell></TableRow>}
            {!loading && filtered.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.code}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.type ?? "—"}</TableCell>
                <TableCell>{item.groupName ?? "—"}</TableCell>
                <TableCell>{item.subgroup ?? "—"}</TableCell>
                <TableCell>{item.uom}</TableCell>
                <TableCell>{item.stdCost ?? "—"}</TableCell>
                <TableCell>{item.reorderLevel ?? "—"}</TableCell>
                {FIXED_SPEC_COLUMNS.map((c) => {
                  const v = getSpecValue(item.specs, c);
                  return (
                    <TableCell key={c.key} className="whitespace-nowrap tabular-nums">
                      {v ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  );
                })}
                <TableCell>{item.isActive ? "Yes" : "No"}</TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(item)}>Edit</Button></TableCell>
              </TableRow>
            ))}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={10 + FIXED_SPEC_COLUMNS.length} className="text-muted-foreground">No items match these filters.</TableCell></TableRow>
            )}
          </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
