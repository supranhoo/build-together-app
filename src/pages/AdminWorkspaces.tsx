import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { createAuditLog, createProfitCenter, fetchProfitCenterSettings, updateProfitCenter } from "@/lib/workspace";
import { applySharedPinDefaults } from "@/lib/reporting";

const emptyForm = {
  code: "",
  slug: "",
  name: "",
  description: "",
  locationName: "",
  processProfile: "",
  isActive: true,
};

export default function AdminWorkspaces() {
  const { session } = useAuth();
  const { toast } = useToast();
  const { activeProfitCenter, allProfitCenters, isSuperAdmin, refreshWorkspace } = useWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [copyDefaults, setCopyDefaults] = useState(false);

  const selectedWorkspace = useMemo(
    () => allProfitCenters.find((workspace) => workspace.id === selectedId) ?? null,
    [allProfitCenters, selectedId],
  );

  useEffect(() => {
    if (selectedWorkspace) {
      setForm({
        code: selectedWorkspace.code,
        slug: selectedWorkspace.slug,
        name: selectedWorkspace.name,
        description: selectedWorkspace.description || "",
        locationName: selectedWorkspace.locationName || "",
        processProfile: selectedWorkspace.processProfile || "",
        isActive: selectedWorkspace.isActive,
      });
      return;
    }

    if (activeProfitCenter && !selectedId) {
      setSelectedId(activeProfitCenter.id);
      return;
    }

    if (!selectedId) {
      setForm(emptyForm);
    }
  }, [activeProfitCenter, selectedId, selectedWorkspace]);

  const handleSubmit = async () => {
    if (!session?.user) return;

    setSaving(true);
    try {
      if (selectedWorkspace) {
        const updated = await updateProfitCenter(selectedWorkspace.id, form);
        await createAuditLog({
          actorUserId: session.user.id,
          profitCenterId: updated.id,
          entityType: "profit_center",
          entityId: updated.id,
          action: "workspace.updated",
          changeSummary: { code: updated.code, slug: updated.slug, name: updated.name, isActive: updated.isActive },
        });
      } else {
        if (!isSuperAdmin) {
          throw new Error("Only super admins can create new workspaces.");
        }
        const created = await createProfitCenter(form);
        await createAuditLog({
          actorUserId: session.user.id,
          profitCenterId: created.id,
          entityType: "profit_center",
          entityId: created.id,
          action: "workspace.created",
          changeSummary: { code: created.code, slug: created.slug, name: created.name },
        });
        if (copyDefaults && activeProfitCenter) {
          try {
            const settings = await fetchProfitCenterSettings(activeProfitCenter.id);
            const row = settings.find((s) => s.settingKey === "shared_pin_defaults");
            const ids = (row?.settingValue as { kpi_definition_ids?: unknown })?.kpi_definition_ids;
            if (Array.isArray(ids) && ids.length > 0) {
              const result = await applySharedPinDefaults({
                actorUserId: session.user.id,
                profitCenterId: created.id,
                kpiDefinitionIds: ids as string[],
              });
              toast({ title: "Defaults copied", description: `${result.shared} shared from ${activeProfitCenter.name}.` });
            }
          } catch (err) {
            toast({ title: "Copy defaults failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
          }
        }
        setSelectedId(created.id);
      }

      await refreshWorkspace();
      toast({ title: "Workspace saved", description: "Configuration changes were saved successfully." });
    } catch (error) {
      toast({
        title: "Workspace save failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>Workspace catalog</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allProfitCenters.map((workspace) => (
                <TableRow key={workspace.id} className="cursor-pointer" onClick={() => setSelectedId(workspace.id)}>
                  <TableCell className="font-medium text-foreground">{workspace.name}</TableCell>
                  <TableCell>{workspace.code}</TableCell>
                  <TableCell>{workspace.locationName || "—"}</TableCell>
                  <TableCell>{workspace.isActive ? "Active" : "Inactive"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button variant="outline" className="mt-4" onClick={() => { setSelectedId(null); setForm(emptyForm); }} disabled={!isSuperAdmin}>
            New workspace
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>{selectedWorkspace ? "Edit workspace" : "Create workspace"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="workspace-name">Name</Label><Input id="workspace-name" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor="workspace-code">Code</Label><Input id="workspace-code" value={form.code} onChange={(e) => setForm((current) => ({ ...current, code: e.target.value.toUpperCase() }))} /></div>
            <div className="space-y-2"><Label htmlFor="workspace-slug">Slug</Label><Input id="workspace-slug" value={form.slug} onChange={(e) => setForm((current) => ({ ...current, slug: e.target.value.toLowerCase() }))} /></div>
            <div className="space-y-2"><Label htmlFor="workspace-location">Location</Label><Input id="workspace-location" value={form.locationName} onChange={(e) => setForm((current) => ({ ...current, locationName: e.target.value }))} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="workspace-process">Process profile</Label><Input id="workspace-process" value={form.processProfile} onChange={(e) => setForm((current) => ({ ...current, processProfile: e.target.value }))} /></div>
          <div className="space-y-2"><Label htmlFor="workspace-description">Description</Label><Textarea id="workspace-description" value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} /></div>
          <div className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
            <div>
              <p className="font-medium text-foreground">Active workspace</p>
              <p className="text-sm text-muted-foreground">Inactive workspaces remain configured but should not be selectable.</p>
            </div>
            <Switch checked={form.isActive} onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))} />
          </div>
          {!selectedWorkspace && activeProfitCenter && (
            <div className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
              <div>
                <p className="font-medium text-foreground">Copy shared-pin defaults</p>
                <p className="text-sm text-muted-foreground">Apply the shared-pin defaults from <strong>{activeProfitCenter.name}</strong> to the new workspace after creation.</p>
              </div>
              <Switch checked={copyDefaults} onCheckedChange={setCopyDefaults} />
            </div>
          )}
          <Button className="w-full" onClick={() => void handleSubmit()} disabled={saving || !form.name || !form.code || !form.slug}>
            {saving ? "Saving…" : selectedWorkspace ? "Save workspace" : "Create workspace"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
