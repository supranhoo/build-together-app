import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { createAuditLog } from "@/lib/workspace";
import {
  fetchMasterItems,
  fetchMaterialGroups,
  upsertMasterItem,
  type MasterItem,
  type MaterialGroup,
} from "@/lib/master-data";
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
import {
  buildCatalogueTree,
  filterCatalogueItems,
  getItemCategory,
  getItemFeRecovery,
  getItemMnRecovery,
  getItemRole,
  isReservedSpecKey,
  mergeReservedSpecs,
  METALLURGICAL_ROLES,
  type CatalogueLeaf,
  type CatalogueNode,
  type MetallurgicalRole,
} from "@/lib/item-catalogue";

/**
 * Item Catalogue (PoC) — tree-view + 4-tab editor over the existing
 * `materials` table. No schema changes (decision 2026-04-27). Role,
 * Category, and Recovery % are stored as reserved keys inside `materials.specs`
 * (see `src/lib/item-catalogue.ts`). This proves the UX before we commit to
 * the 9-table rebuild and hard cutover.
 */

interface EditorState {
  id?: string;
  code: string;
  name: string;
  type: string;
  groupName: string;
  subgroup: string;
  category: string;
  uom: string;
  /** Editable spec rows (chemistry only — reserved keys stripped). */
  specRows: SpecRow[];
  role: MetallurgicalRole | "";
  mnRecovery: string;
  feRecovery: string;
  isActive: boolean;
}

const empty: EditorState = {
  code: "",
  name: "",
  type: "",
  groupName: "",
  subgroup: "",
  category: "",
  uom: "MT",
  specRows: [],
  role: "",
  mnRecovery: "",
  feRecovery: "",
  isActive: true,
};

const UOMS = ["kg", "MT", "litre", "piece", "ton"];

function itemToEditor(item: MasterItem): EditorState {
  const allSpecs = item.specs ?? {};
  const chemistryOnly: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(allSpecs)) {
    if (!isReservedSpecKey(k)) chemistryOnly[k] = v;
  }
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    type: item.type ?? "",
    groupName: item.groupName ?? "",
    subgroup: item.subgroup ?? "",
    category: getItemCategory(item) ?? "",
    uom: item.uom,
    specRows: specsObjectToRows(chemistryOnly),
    role: getItemRole(item) ?? "",
    mnRecovery: getItemMnRecovery(item)?.toString() ?? "",
    feRecovery: getItemFeRecovery(item)?.toString() ?? "",
    isActive: item.isActive,
  };
}

export default function AdminItemCatalogue() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<MasterItem[]>([]);
  const [templates, setTemplates] = useState<SpecTemplate[]>([]);
  // groups fetched for parity but not used in PoC tree (tree is derived from items)
  const [, setGroups] = useState<MaterialGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(empty);
  const [activeTab, setActiveTab] = useState<"basic" | "specs" | "role" | "recovery">("basic");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!activeProfitCenter) return;
    setLoading(true);
    try {
      const [itemsRes, templatesRes, groupsRes] = await Promise.all([
        fetchMasterItems(activeProfitCenter.id),
        fetchSpecTemplates(activeProfitCenter.id).catch(() => [] as SpecTemplate[]),
        fetchMaterialGroups(activeProfitCenter.id).catch(() => [] as MaterialGroup[]),
      ]);
      setItems(itemsRes);
      setTemplates(templatesRes);
      setGroups(groupsRes);
      // Auto-expand all parent groups on first load so the tree isn't empty-looking.
      if (expanded.size === 0) {
        const parents = new Set<string>();
        for (const it of itemsRes) parents.add(it.type ?? "(Uncategorized)");
        setExpanded(parents);
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfitCenter?.id]);

  useEffect(() => { void load(); }, [load]);

  const filteredItems = useMemo(() => filterCatalogueItems(items, search), [items, search]);
  const tree = useMemo(() => buildCatalogueTree(filteredItems), [filteredItems]);

  const selected = useMemo(
    () => (selectedId ? items.find((i) => i.id === selectedId) ?? null : null),
    [items, selectedId],
  );

  // Sync editor when selection changes (or when selected item is reloaded)
  useEffect(() => {
    if (selected) setEditor(itemToEditor(selected));
    else setEditor(empty);
    setActiveTab("basic");
  }, [selected]);

  const matchedTemplate = useMemo(
    () => findTemplateForNature(templates, editor.type || null, editor.groupName, editor.subgroup),
    [templates, editor.type, editor.groupName, editor.subgroup],
  );

  const specErrors = useMemo(() => validateSpecRows(editor.specRows), [editor.specRows]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleNew = () => {
    setSelectedId(null);
    setEditor({ ...empty });
    setActiveTab("basic");
  };

  const applyTemplateNow = () => {
    if (!matchedTemplate) {
      toast({ title: "No template matches this Type / Group / Subgroup" });
      return;
    }
    setEditor((prev) => ({ ...prev, specRows: applyTemplateToRows(matchedTemplate, prev.specRows) }));
    toast({ title: `Applied template: ${matchedTemplate.groupName}${matchedTemplate.subgroup ? ` / ${matchedTemplate.subgroup}` : ""}` });
  };

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (!editor.code.trim() || !editor.name.trim()) {
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
    // Hard validation: if a template matches and has required fields, every required key must be present.
    if (matchedTemplate) {
      const requiredKeys = matchedTemplate.fields.filter((f) => f.required).map((f) => f.key.trim().toLowerCase());
      const presentKeys = new Set(editor.specRows.map((r) => r.key.trim().toLowerCase()).filter(Boolean));
      const missing = requiredKeys.filter((k) => !presentKeys.has(k));
      if (missing.length > 0) {
        toast({
          title: "Required spec fields missing",
          description: `Template requires: ${missing.join(", ")}. Click "Apply template" to add them.`,
          variant: "destructive",
        });
        return;
      }
    }
    const mnRec = editor.mnRecovery.trim() === "" ? null : Number(editor.mnRecovery);
    const feRec = editor.feRecovery.trim() === "" ? null : Number(editor.feRecovery);
    if (mnRec !== null && (!Number.isFinite(mnRec) || mnRec < 0 || mnRec > 100)) {
      toast({ title: "Mn Recovery must be 0–100", variant: "destructive" });
      return;
    }
    if (feRec !== null && (!Number.isFinite(feRec) || feRec < 0 || feRec > 100)) {
      toast({ title: "Fe Recovery must be 0–100", variant: "destructive" });
      return;
    }

    const chemistry = specRowsToObject(editor.specRows);
    const merged = mergeReservedSpecs(chemistry, {
      role: editor.role === "" ? null : editor.role,
      category: editor.category.trim() || null,
      mnRecoveryPct: mnRec,
      feRecoveryPct: feRec,
    });

    setSaving(true);
    try {
      await upsertMasterItem({
        id: editor.id,
        profitCenterId: activeProfitCenter.id,
        code: editor.code.trim(),
        name: editor.name.trim(),
        type: (editor.type === "" ? null : editor.type) as MasterItem["type"],
        groupName: editor.groupName.trim() || null,
        subgroup: editor.subgroup.trim() || null,
        uom: editor.uom,
        stdCost: selected?.stdCost ?? null,
        specs: merged,
        minLevel: selected?.minLevel ?? null,
        maxLevel: selected?.maxLevel ?? null,
        reorderLevel: selected?.reorderLevel ?? null,
        isActive: editor.isActive,
      });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "item_catalogue",
        action: editor.id ? "item_catalogue.updated" : "item_catalogue.created",
        changeSummary: { code: editor.code, name: editor.name, role: editor.role },
      });
      toast({ title: "Item saved" });
      await load();
    } catch (error) {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!activeProfitCenter) {
    return <p className="text-sm text-muted-foreground">Select a workspace to view the Item Catalogue.</p>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      {/* LEFT: Tree */}
      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code, name, role…"
                className="pl-8"
              />
            </div>
            <Button size="sm" onClick={handleNew}>+ New</Button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto rounded-md border border-border bg-panel p-2 text-sm">
            {loading && items.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground">Loading…</p>
            ) : tree.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground">No items match.</p>
            ) : (
              tree.map((node) => (
                <TreeBranch
                  key={node.id}
                  node={node}
                  expanded={expanded}
                  onToggle={toggle}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  depth={0}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* RIGHT: Editor with 4 tabs */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {editor.id ? `Edit: ${editor.code}` : "New Item"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {editor.id
                  ? `Last loaded from materials. Reserved keys (_role, _category, _mn_recovery_pct, _fe_recovery_pct) stored alongside chemistry.`
                  : `Fill the 4 tabs and Save. Specifications are enforced when a template matches Type/Group/Subgroup.`}
              </p>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList>
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="specs">
                Specifications
                {specErrors.length > 0 && <span className="ml-1.5 text-destructive">!</span>}
              </TabsTrigger>
              <TabsTrigger value="role">Metallurgical Mapping</TabsTrigger>
              <TabsTrigger value="recovery">Recovery Mapping</TabsTrigger>
            </TabsList>

            {/* TAB 1 — Basic */}
            <TabsContent value="basic" className="space-y-3 pt-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Item Code">
                  <Input value={editor.code} onChange={(e) => setEditor({ ...editor, code: e.target.value })} placeholder="RM-MN-01" />
                </Field>
                <Field label="Item Name">
                  <Input value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} placeholder="Manganese Ore (Lump)" />
                </Field>
                <Field label="Parent Group (Type)">
                  <Select value={editor.type || "__none"} onValueChange={(v) => setEditor({ ...editor, type: v === "__none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— none —</SelectItem>
                      <SelectItem value="RM">Raw Material</SelectItem>
                      <SelectItem value="FG">Finished Goods</SelectItem>
                      <SelectItem value="WIP">By-Product (WIP)</SelectItem>
                      <SelectItem value="Consumable">Waste / Consumable</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Sub Group">
                  <Input value={editor.subgroup} onChange={(e) => setEditor({ ...editor, subgroup: e.target.value })} placeholder="Mn Ore / Reductant / HC FeMn…" />
                </Field>
                <Field label="Group Name">
                  <Input value={editor.groupName} onChange={(e) => setEditor({ ...editor, groupName: e.target.value })} placeholder="e.g. Mn Ore" />
                </Field>
                <Field label="Category (3rd level)">
                  <Input value={editor.category} onChange={(e) => setEditor({ ...editor, category: e.target.value })} placeholder="Imported / Domestic / Lumps / Fines…" />
                </Field>
                <Field label="UOM">
                  <Select value={editor.uom} onValueChange={(v) => setEditor({ ...editor, uom: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UOMS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Active">
                  <div className="flex h-10 items-center">
                    <Switch checked={editor.isActive} onCheckedChange={(v) => setEditor({ ...editor, isActive: v })} />
                  </div>
                </Field>
              </div>
            </TabsContent>

            {/* TAB 2 — Specs */}
            <TabsContent value="specs" className="space-y-3 pt-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {matchedTemplate
                    ? <>Template matched: <strong>{matchedTemplate.groupName}{matchedTemplate.subgroup ? ` / ${matchedTemplate.subgroup}` : ""}</strong> · {matchedTemplate.fields.length} field(s)</>
                    : <>No template matches Type / Group / Subgroup. Specs are free-form for this item.</>}
                </p>
                <Button size="sm" variant="outline" onClick={applyTemplateNow} disabled={!matchedTemplate}>
                  Apply template
                </Button>
              </div>
              <SpecsEditor
                rows={editor.specRows}
                errors={specErrors}
                onChange={(rows) => setEditor({ ...editor, specRows: rows })}
              />
            </TabsContent>

            {/* TAB 3 — Role */}
            <TabsContent value="role" className="space-y-3 pt-3">
              <Field label="Metallurgical Role">
                <Select value={editor.role || "__none"} onValueChange={(v) => setEditor({ ...editor, role: v === "__none" ? "" : (v as MetallurgicalRole) })}>
                  <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— none —</SelectItem>
                    {METALLURGICAL_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label} — <span className="text-muted-foreground">{r.description}</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <p className="rounded-md border border-dashed border-border bg-panel p-3 text-xs text-muted-foreground">
                Stored as <code>_role</code> in the item's specs. Downstream modules (Charge Mix, Costing, Yield) will read this once Phase B wires them up.
              </p>
            </TabsContent>

            {/* TAB 4 — Recovery */}
            <TabsContent value="recovery" className="space-y-3 pt-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Mn Recovery %">
                  <Input
                    inputMode="decimal"
                    value={editor.mnRecovery}
                    onChange={(e) => setEditor({ ...editor, mnRecovery: e.target.value })}
                    placeholder="e.g. 78"
                  />
                </Field>
                <Field label="Fe Recovery %">
                  <Input
                    inputMode="decimal"
                    value={editor.feRecovery}
                    onChange={(e) => setEditor({ ...editor, feRecovery: e.target.value })}
                    placeholder="e.g. 12"
                  />
                </Field>
              </div>
              <p className="rounded-md border border-dashed border-border bg-panel p-3 text-xs text-muted-foreground">
                Item-level recovery override (0–100). Leave blank to inherit furnace-level recovery. Stored as <code>_mn_recovery_pct</code> / <code>_fe_recovery_pct</code> in the item's specs.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Tree branch ----------

function TreeBranch({
  node,
  expanded,
  onToggle,
  selectedId,
  onSelect,
  depth,
}: {
  node: CatalogueNode;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth: number;
}) {
  const isOpen = expanded.has(node.id);
  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(node.id)}
        className="flex w-full items-center gap-1 rounded px-1 py-1 text-left hover:bg-muted/50"
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="flex-1 truncate font-medium">{node.label}</span>
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{node.count}</Badge>
      </button>
      {isOpen && (
        <div>
          {node.children.map((child) =>
            child.kind === "group" ? (
              <TreeBranch
                key={child.id}
                node={child}
                expanded={expanded}
                onToggle={onToggle}
                selectedId={selectedId}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ) : (
              <TreeLeaf key={child.item.id} leaf={child} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function TreeLeaf({
  leaf,
  selectedId,
  onSelect,
  depth,
}: {
  leaf: CatalogueLeaf;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth: number;
}) {
  const active = leaf.item.id === selectedId;
  return (
    <button
      type="button"
      onClick={() => onSelect(leaf.item.id)}
      className={cn(
        "flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-muted/50",
        active && "bg-primary/10 text-primary",
      )}
      style={{ paddingLeft: `${depth * 12 + 18}px` }}
    >
      <span className="flex-1 truncate">
        <span className="font-mono">{leaf.item.code}</span>
        <span className="ml-2 text-muted-foreground">{leaf.item.name}</span>
      </span>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
