import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { createAuditLog } from "@/lib/workspace";
import { fetchMaterialGroups, MATERIAL_TYPES, type MaterialGroup, type MaterialType } from "@/lib/master-data";
import {
  fetchGroupPropertyMap,
  fetchPropertyDefinitions,
  replaceGroupPropertyMap,
  upsertPropertyDefinition,
  type GroupPropertyLink,
  type PropertyDefinition,
} from "@/lib/item-properties";

/**
 * Item Properties admin — operator-managed catalog + group→property mapping.
 *
 * Two cards:
 *   1. Property Catalog: add/edit chemistry properties (Mn, FC, SiO2, …)
 *      with units, ranges, and sort order. Workspace-scoped overrides win
 *      over global defaults (per `fetchPropertyDefinitions` resolver).
 *   2. Group → Property Mapping: pick a (Type, Group, Subgroup), tick the
 *      properties that should appear on the Item Master form for items in
 *      that slot, and flag which are mandatory. The form's save button
 *      already blocks when required properties are blank.
 *
 * Per Rule #10 (zero hardcoding): no property is hardcoded — admins drive
 * the entire chemistry schema from this screen.
 */
export default function AdminItemProperties() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();

  const [defs, setDefs] = useState<PropertyDefinition[]>([]);
  const [links, setLinks] = useState<GroupPropertyLink[]>([]);
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!activeProfitCenter) return;
    setLoading(true);
    try {
      const [d, l, g] = await Promise.all([
        fetchPropertyDefinitions(activeProfitCenter.id),
        fetchGroupPropertyMap(activeProfitCenter.id),
        fetchMaterialGroups(activeProfitCenter.id).catch(() => [] as MaterialGroup[]),
      ]);
      setDefs(d);
      setLinks(l);
      setGroups(g);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id]);

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>Item Properties</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <PropertyCatalogCard
        defs={defs}
        loading={loading}
        profitCenterId={activeProfitCenter.id}
        actorUserId={session?.user.id ?? null}
        onSaved={() => { void load(); }}
        onAuditTitle={`Property Catalog — ${activeProfitCenter.name}`}
      />
      <GroupMappingCard
        defs={defs}
        links={links}
        groups={groups}
        loading={loading}
        profitCenterId={activeProfitCenter.id}
        actorUserId={session?.user.id ?? null}
        onSaved={() => { void load(); }}
        cardTitle={`Group → Property Mapping — ${activeProfitCenter.name}`}
      />
    </div>
  );
}

// ---------- Property Catalog ----------

interface DefFormState {
  id?: string;
  propertyKey: string;
  displayName: string;
  unit: string;
  dataType: "decimal" | "text";
  decimals: string;
  minValue: string;
  maxValue: string;
  sortOrder: string;
  isActive: boolean;
}

const emptyDef: DefFormState = {
  propertyKey: "",
  displayName: "",
  unit: "%",
  dataType: "decimal",
  decimals: "2",
  minValue: "0",
  maxValue: "100",
  sortOrder: "100",
  isActive: true,
};

function PropertyCatalogCard({
  defs, loading, profitCenterId, actorUserId, onSaved, onAuditTitle,
}: {
  defs: PropertyDefinition[];
  loading: boolean;
  profitCenterId: string;
  actorUserId: string | null;
  onSaved: () => void;
  onAuditTitle: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DefFormState>(emptyDef);
  const [saving, setSaving] = useState(false);

  const openNew = () => { setForm(emptyDef); setOpen(true); };
  const openEdit = (d: PropertyDefinition) => {
    setForm({
      id: d.profitCenterId === profitCenterId ? d.id : undefined, // global rows → create override, never edit in place
      propertyKey: d.propertyKey,
      displayName: d.displayName,
      unit: d.unit,
      dataType: d.dataType,
      decimals: String(d.decimals),
      minValue: d.minValue === null ? "" : String(d.minValue),
      maxValue: d.maxValue === null ? "" : String(d.maxValue),
      sortOrder: String(d.sortOrder),
      isActive: d.isActive,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!actorUserId) return;
    if (!form.propertyKey.trim() || !form.displayName.trim()) {
      toast({ title: "Property key and display name are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await upsertPropertyDefinition({
        id: form.id,
        profitCenterId,
        propertyKey: form.propertyKey,
        displayName: form.displayName,
        unit: form.unit,
        dataType: form.dataType,
        decimals: Number(form.decimals) || 0,
        minValue: form.minValue === "" ? null : Number(form.minValue),
        maxValue: form.maxValue === "" ? null : Number(form.maxValue),
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      });
      await createAuditLog({
        actorUserId,
        profitCenterId,
        entityType: "item_property_definition",
        action: form.id ? "property_def.updated" : "property_def.created",
        changeSummary: { property_key: form.propertyKey, display_name: form.displayName },
      });
      toast({ title: "Property saved" });
      setOpen(false);
      onSaved();
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{onAuditTitle}</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}>New property</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{form.id ? "Edit property" : "New property"}</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Key</Label>
                <Input value={form.propertyKey} onChange={(e) => setForm({ ...form, propertyKey: e.target.value })} placeholder="Mn, FC, SiO2…" />
              </div>
              <div>
                <Label>Display name</Label>
                <Input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Manganese" />
              </div>
              <div><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
              <div>
                <Label>Data type</Label>
                <Select value={form.dataType} onValueChange={(v) => setForm({ ...form, dataType: v as "decimal" | "text" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="decimal">Decimal</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Decimals</Label><Input type="number" value={form.decimals} onChange={(e) => setForm({ ...form, decimals: e.target.value })} /></div>
              <div><Label>Sort order</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></div>
              <div><Label>Min value</Label><Input type="number" value={form.minValue} onChange={(e) => setForm({ ...form, minValue: e.target.value })} placeholder="blank = no min" /></div>
              <div><Label>Max value</Label><Input type="number" value={form.maxValue} onChange={(e) => setForm({ ...form, maxValue: e.target.value })} placeholder="blank = no max" /></div>
              <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
                <span>Active</span>
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead><TableHead>Name</TableHead><TableHead>Unit</TableHead>
              <TableHead>Range</TableHead><TableHead>Scope</TableHead><TableHead>Active</TableHead><TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={7} className="text-muted-foreground">Loading…</TableCell></TableRow>}
            {!loading && defs.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-mono text-xs">{d.propertyKey}</TableCell>
                <TableCell>{d.displayName}</TableCell>
                <TableCell>{d.unit}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {d.minValue ?? "—"} … {d.maxValue ?? "—"}
                </TableCell>
                <TableCell>
                  {d.profitCenterId === null
                    ? <Badge variant="outline">Global</Badge>
                    : <Badge>Workspace</Badge>}
                </TableCell>
                <TableCell>{d.isActive ? "Yes" : "No"}</TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => openEdit(d)}>
                    {d.profitCenterId === null ? "Override" : "Edit"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!loading && defs.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-muted-foreground">No properties defined yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------- Group → Property Mapping ----------

function GroupMappingCard({
  defs, links, groups, loading, profitCenterId, actorUserId, onSaved, cardTitle,
}: {
  defs: PropertyDefinition[];
  links: GroupPropertyLink[];
  groups: MaterialGroup[];
  loading: boolean;
  profitCenterId: string;
  actorUserId: string | null;
  onSaved: () => void;
  cardTitle: string;
}) {
  const { toast } = useToast();
  const [matType, setMatType] = useState<MaterialType>("RM");
  const [groupName, setGroupName] = useState<string>("");
  const [subgroup, setSubgroup] = useState<string>(""); // "" = group default (subgroup NULL)
  const [working, setWorking] = useState<Record<string, { selected: boolean; required: boolean; sortOrder: number }>>({});
  const [saving, setSaving] = useState(false);

  const groupOptions = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) {
      if (g.isActive && g.parentGroup) set.add(g.parentGroup.trim());
    }
    // Also include group names already referenced by mappings (so an admin
    // can manage legacy slots even before adding the group to the master).
    for (const l of links) set.add(l.groupName);
    return Array.from(set).sort();
  }, [groups, links]);

  const subgroupOptions = useMemo(() => {
    const set = new Set<string>();
    const g = groupName.trim().toLowerCase();
    for (const row of groups) {
      if (!row.isActive) continue;
      if ((row.parentGroup ?? "").trim().toLowerCase() !== g) continue;
      if (row.subgroup) set.add(row.subgroup);
    }
    return Array.from(set).sort();
  }, [groups, groupName]);

  // Pull existing entries for the chosen slot into the working state.
  useEffect(() => {
    if (!groupName) { setWorking({}); return; }
    const sub = subgroup.trim() || null;
    const existing = links.filter(
      (l) => l.materialType === matType
        && l.groupName.trim().toUpperCase() === groupName.trim().toUpperCase()
        && ((l.subgroup ?? null) === sub || (sub === null && l.subgroup === null)),
    );
    const next: typeof working = {};
    for (const d of defs) {
      const m = existing.find((e) => e.propertyKey === d.propertyKey);
      next[d.propertyKey] = {
        selected: !!m,
        required: !!m?.isRequired,
        sortOrder: m?.sortOrder ?? d.sortOrder,
      };
    }
    setWorking(next);
  }, [matType, groupName, subgroup, defs, links]);

  const handleSave = async () => {
    if (!actorUserId) return;
    if (!groupName.trim()) {
      toast({ title: "Pick a group first", variant: "destructive" });
      return;
    }
    const entries = defs
      .filter((d) => working[d.propertyKey]?.selected)
      .map((d) => ({
        propertyKey: d.propertyKey,
        isRequired: !!working[d.propertyKey]?.required,
        sortOrder: working[d.propertyKey]?.sortOrder ?? d.sortOrder,
      }));
    setSaving(true);
    try {
      await replaceGroupPropertyMap(
        profitCenterId,
        matType,
        groupName.trim().toUpperCase(),
        subgroup.trim() || null,
        entries,
      );
      await createAuditLog({
        actorUserId,
        profitCenterId,
        entityType: "item_group_property_map",
        action: "group_property_map.replaced",
        changeSummary: {
          material_type: matType,
          group_name: groupName,
          subgroup: subgroup || null,
          property_count: entries.length,
          required_count: entries.filter((e) => e.isRequired).length,
        },
      });
      toast({ title: "Mapping saved", description: `${entries.length} properties (${entries.filter((e) => e.isRequired).length} required)` });
      onSaved();
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Type</Label>
            <Select value={matType} onValueChange={(v) => setMatType(v as MaterialType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MATERIAL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Group</Label>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              list="prop-map-group-options"
              placeholder="ORE, REDUCTANT…"
            />
            <datalist id="prop-map-group-options">
              {groupOptions.map((g) => <option key={g} value={g} />)}
            </datalist>
          </div>
          <div>
            <Label>Subgroup (blank = group default)</Label>
            <Input
              value={subgroup}
              onChange={(e) => setSubgroup(e.target.value)}
              list="prop-map-subgroup-options"
              placeholder={groupName ? "SINTER, COKE…" : "Pick a group first"}
            />
            <datalist id="prop-map-subgroup-options">
              {subgroupOptions.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
        </div>

        {!groupName && (
          <p className="text-sm text-muted-foreground">
            Pick a Type and Group above to load its property checklist.
          </p>
        )}

        {groupName && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Show</TableHead>
                <TableHead>Property</TableHead>
                <TableHead className="w-24">Unit</TableHead>
                <TableHead className="w-28">Required</TableHead>
                <TableHead className="w-28">Sort</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={5} className="text-muted-foreground">Loading…</TableCell></TableRow>}
              {!loading && defs.map((d) => {
                const w = working[d.propertyKey] ?? { selected: false, required: false, sortOrder: d.sortOrder };
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Checkbox
                        checked={w.selected}
                        onCheckedChange={(v) => setWorking((prev) => ({ ...prev, [d.propertyKey]: { ...w, selected: !!v, required: v ? w.required : false } }))}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{d.displayName}</span>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{d.propertyKey}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{d.unit}</TableCell>
                    <TableCell>
                      <Switch
                        disabled={!w.selected}
                        checked={w.required}
                        onCheckedChange={(v) => setWorking((prev) => ({ ...prev, [d.propertyKey]: { ...w, required: v } }))}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="h-8 w-20"
                        value={w.sortOrder}
                        onChange={(e) => setWorking((prev) => ({ ...prev, [d.propertyKey]: { ...w, sortOrder: Number(e.target.value) || 0 } }))}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && defs.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">No properties defined. Add some in the catalog above.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {groupName && (
          <div className="flex justify-end">
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving…" : "Save mapping"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
