import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { createAuditLog } from "@/lib/workspace";
import {
  fetchMasterItems,
  filterItems,
  upsertMasterItem,
  MATERIAL_TYPES,
  type MasterItem,
  type MaterialType,
} from "@/lib/master-data";
import { downloadCsv, parseCsv, toCsv } from "@/lib/csv";
import {
  buildItemTemplateRows,
  itemsToCsvRows,
  parseItemCsv,
} from "@/lib/master-items-csv";
import {
  specRowsToObject,
  specsObjectToRows,
  validateSpecRows,
  type SpecRow,
} from "@/lib/master-item-specs";
import { SpecsEditor } from "@/components/master-data/SpecsEditor";
import {
  applyTemplateToRows,
  fetchSpecTemplates,
  findTemplateForNature,
  type SpecTemplate,
} from "@/lib/spec-templates";

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
  specRows: SpecRow[];
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
  specRows: [],
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
  const [templates, setTemplates] = useState<SpecTemplate[]>([]);
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
      const [itemsRes, templatesRes] = await Promise.all([
        fetchMasterItems(activeProfitCenter.id),
        fetchSpecTemplates(activeProfitCenter.id).catch(() => [] as SpecTemplate[]),
      ]);
      setItems(itemsRes);
      setTemplates(templatesRes);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id]);

  const groupOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => { if (i.groupName) set.add(i.groupName); });
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => filterItems(items, search, typeFilter, groupFilter), [items, search, typeFilter, groupFilter]);

  const openNew = () => { setForm(empty); setOpen(true); };
  const openEdit = (item: MasterItem) => {
    setForm({
      id: item.id,
      code: item.code,
      name: item.name,
      type: item.type ?? "",
      groupName: item.groupName ?? "",
      subgroup: item.subgroup ?? "",
      uom: item.uom,
      stdCost: item.stdCost?.toString() ?? "",
      specRows: specsObjectToRows(item.specs),
      minLevel: item.minLevel?.toString() ?? "",
      maxLevel: item.maxLevel?.toString() ?? "",
      reorderLevel: item.reorderLevel?.toString() ?? "",
      isActive: item.isActive,
    });
    setOpen(true);
  };

  const specErrors = useMemo(() => validateSpecRows(form.specRows), [form.specRows]);

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: "Code and name are required", variant: "destructive" });
      return;
    }
    if (specErrors.length > 0) {
      toast({
        title: "Fix spec errors before saving",
        description: specErrors.map((e) => e.message).join("; "),
        variant: "destructive",
      });
      return;
    }
    const specs = specRowsToObject(form.specRows);
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
        changeSummary: { code: form.code, name: form.name, type: form.type, profit_center_id: activeProfitCenter.id },
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
      let inserted = 0;
      for (const { rowNumber, input } of rows) {
        try {
          await upsertMasterItem({ ...input, profitCenterId: activeProfitCenter.id });
          await createAuditLog({
            actorUserId: session.user.id,
            profitCenterId: activeProfitCenter.id,
            entityType: "item_master",
            action: "item_master.bulk_upserted",
            changeSummary: { code: input.code, name: input.name, type: input.type, source: "csv_bulk_upload" },
          });
          inserted += 1;
        } catch (e) {
          messages.push(`Row ${rowNumber} (${input.code}): ${e instanceof Error ? e.message : "save failed"}`);
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
              {groupOptions.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
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
                <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
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
                  <Label>UOM</Label>
                  <Select value={form.uom} onValueChange={(v) => setForm({ ...form, uom: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UOMS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Group</Label><Input value={form.groupName} onChange={(e) => setForm({ ...form, groupName: e.target.value })} /></div>
                <div><Label>Subgroup</Label><Input value={form.subgroup} onChange={(e) => setForm({ ...form, subgroup: e.target.value })} /></div>
                <div><Label>Std cost</Label><Input type="number" step="0.0001" value={form.stdCost} onChange={(e) => setForm({ ...form, stdCost: e.target.value })} /></div>
                <div><Label>Reorder level</Label><Input type="number" step="0.001" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} /></div>
                <div><Label>Min level</Label><Input type="number" step="0.001" value={form.minLevel} onChange={(e) => setForm({ ...form, minLevel: e.target.value })} /></div>
                <div><Label>Max level</Label><Input type="number" step="0.001" value={form.maxLevel} onChange={(e) => setForm({ ...form, maxLevel: e.target.value })} /></div>
                <div className="sm:col-span-2">
                  <SpecsEditor
                    rows={form.specRows}
                    errors={specErrors}
                    onChange={(specRows) => setForm({ ...form, specRows })}
                  />
                </div>
                <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
                  <span>Active</span>
                  <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => void handleSave()} disabled={saving || specErrors.length > 0}>{saving ? "Saving…" : "Save"}</Button>
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>UOM</TableHead>
              <TableHead>Std cost</TableHead>
              <TableHead>Reorder</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={9} className="text-muted-foreground">Loading…</TableCell></TableRow>}
            {!loading && filtered.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.code}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.type ?? "—"}</TableCell>
                <TableCell>{item.groupName ?? "—"}{item.subgroup ? ` / ${item.subgroup}` : ""}</TableCell>
                <TableCell>{item.uom}</TableCell>
                <TableCell>{item.stdCost ?? "—"}</TableCell>
                <TableCell>{item.reorderLevel ?? "—"}</TableCell>
                <TableCell>{item.isActive ? "Yes" : "No"}</TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(item)}>Edit</Button></TableCell>
              </TableRow>
            ))}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-muted-foreground">No items match these filters.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
