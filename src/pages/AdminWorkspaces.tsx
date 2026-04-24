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

/**
 * Derive a URL-safe slug from a workspace name.
 * Lowercased, alphanumerics joined by single hyphens, no leading/trailing hyphen.
 * Pure helper — exported for unit tests.
 */
export function deriveSlug(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Detect a Postgres / PostgREST RLS rejection so we can show a friendly message. */
function isRlsError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("row-level security") ||
    msg.includes("violates row-level security") ||
    msg.includes("permission denied") ||
    msg.includes("forbidden")
  );
}

export default function AdminWorkspaces() {
  const { session } = useAuth();
  const { toast } = useToast();
  const { activeProfitCenter, allProfitCenters, isSuperAdmin, refreshWorkspace } = useWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [copyDefaults, setCopyDefaults] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const selectedWorkspace = useMemo(
    () => allProfitCenters.find((workspace) => workspace.id === selectedId) ?? null,
    [allProfitCenters, selectedId],
  );

  const isCreating = !selectedWorkspace;
  const canCreate = isSuperAdmin;
  // Hide the create form entirely for non-super-admins to avoid a dead form.
  const showForm = !isCreating || canCreate;

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
      setSlugTouched(true); // existing slug — never auto-overwrite on edit
      return;
    }

    if (activeProfitCenter && !selectedId) {
      setSelectedId(activeProfitCenter.id);
      return;
    }

    if (!selectedId) {
      setForm(emptyForm);
      setSlugTouched(false);
    }
  }, [activeProfitCenter, selectedId, selectedWorkspace]);

  const handleNameChange = (nextName: string) => {
    setForm((current) => ({
      ...current,
      name: nextName,
      // Auto-derive slug only while creating and the user hasn't manually edited it.
      slug: !selectedWorkspace && !slugTouched ? deriveSlug(nextName) : current.slug,
    }));
  };

  const handleSlugChange = (nextSlug: string) => {
    setSlugTouched(true);
    setForm((current) => ({ ...current, slug: nextSlug.toLowerCase() }));
  };

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
      const friendly = isRlsError(error)
        ? "You don't have permission to save this workspace. Contact a super admin."
        : error instanceof Error
          ? error.message
          : "Please try again.";
      toast({
        title: "Workspace save failed",
        description: friendly,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const isSubmitDisabled = saving || !form.name || !form.code || !form.slug;
  const requiredHint = !form.name || !form.code || !form.slug;

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
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => { setSelectedId(null); setForm(emptyForm); setSlugTouched(false); }}
            disabled={!isSuperAdmin}
            title={!isSuperAdmin ? "Only super admins can create workspaces" : undefined}
          >
            New workspace
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>{selectedWorkspace ? "Edit workspace" : "Create workspace"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!showForm && (
            <div className="rounded-md border border-border bg-panel px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Creation restricted</p>
              <p className="mt-1">
                Only super admins can create new workspaces. Select an existing workspace from the catalog on the left to edit its details.
              </p>
            </div>
          )}

          {showForm && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="workspace-name">
                    Name <span className="text-destructive">*</span>
                  </Label>
                  <Input id="workspace-name" value={form.name} onChange={(e) => handleNameChange(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workspace-code">
                    Code <span className="text-destructive">*</span>
                  </Label>
                  <Input id="workspace-code" value={form.code} onChange={(e) => setForm((current) => ({ ...current, code: e.target.value.toUpperCase() }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workspace-slug">
                    Slug <span className="text-destructive">*</span>
                  </Label>
                  <Input id="workspace-slug" value={form.slug} onChange={(e) => handleSlugChange(e.target.value)} />
                  {isCreating && !slugTouched && (
                    <p className="text-xs text-muted-foreground">Auto-derived from Name. Edit to override.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workspace-location">Location</Label>
                  <Input id="workspace-location" value={form.locationName} onChange={(e) => setForm((current) => ({ ...current, locationName: e.target.value }))} />
                </div>
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
              {requiredHint && (
                <p className="text-xs text-muted-foreground">Name, Code and Slug are required to save.</p>
              )}
              <Button className="w-full" onClick={() => void handleSubmit()} disabled={isSubmitDisabled}>
                {saving ? "Saving…" : selectedWorkspace ? "Save workspace" : "Create workspace"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
