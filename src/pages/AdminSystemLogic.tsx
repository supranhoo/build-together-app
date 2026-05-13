import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldAlert, Sliders, LayoutGrid } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { createAuditLog } from "@/lib/workspace";
import {
  DEFAULT_SYSTEM_LOGIC,
  getSystemLogic,
  saveSystemLogic,
  getModuleMappings,
  setModuleMapping,
  type AllocationBasis,
  type SystemLogicConfig,
  type ModuleMapping,
} from "@/lib/system-settings";
import { ALLOCATION_BASES } from "@/lib/master-data";
import { applyBulkMappings, BULK_APPROVAL_THRESHOLD, diffMappings, requiresApproval } from "@/lib/module-bulk";

export default function AdminSystemLogic() {
  const { isAdmin, allProfitCenters, appModules } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [config, setConfig] = useState<SystemLogicConfig>(DEFAULT_SYSTEM_LOGIC);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Per-PC module mapping state: pcId -> moduleId -> enabled
  const [mappings, setMappings] = useState<Record<string, Record<string, boolean>>>({});
  const [mappingsLoading, setMappingsLoading] = useState(true);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  // Confirmation state for disable actions (single toggle or row bulk-disable).
  // Disable is destructive (hides modules from the workspace nav), so we require
  // an explicit confirm to prevent accidental clicks. Enable stays one-click.
  const [pendingDisable, setPendingDisable] = useState<
    | { kind: "single"; pcId: string; pcName: string; moduleId: string; moduleLabel: string }
    | { kind: "bulk"; pcId: string; pcName: string; count: number }
    | null
  >(null);

  const activePCs = useMemo(
    () => allProfitCenters.filter((pc) => pc.isActive).sort((a, b) => a.name.localeCompare(b.name)),
    [allProfitCenters],
  );
  const sortedModules = useMemo(
    () => [...appModules].sort((a, b) => a.sortOrder - b.sortOrder),
    [appModules],
  );

  useEffect(() => {
    let mounted = true;
    getSystemLogic()
      .then((c) => { if (mounted) setConfig(c ?? DEFAULT_SYSTEM_LOGIC); })
      .catch((e) => toast({ title: "Failed to load", description: (e as Error).message, variant: "destructive" }))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [toast]);

  useEffect(() => {
    if (!isAdmin || activePCs.length === 0) {
      setMappingsLoading(false);
      return;
    }
    let mounted = true;
    setMappingsLoading(true);
    Promise.all(activePCs.map((pc) => getModuleMappings(pc.id).then((rows): [string, ModuleMapping[]] => [pc.id, rows])))
      .then((results) => {
        if (!mounted) return;
        const next: Record<string, Record<string, boolean>> = {};
        for (const [pcId, rows] of results) {
          next[pcId] = {};
          for (const r of rows) next[pcId][r.moduleId] = r.isEnabled;
        }
        setMappings(next);
      })
      .catch((e) => toast({ title: "Failed to load module mappings", description: (e as Error).message, variant: "destructive" }))
      .finally(() => { if (mounted) setMappingsLoading(false); });
    return () => { mounted = false; };
  }, [isAdmin, activePCs, toast]);

  if (!isAdmin) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Admin only</AlertTitle>
        <AlertDescription>This area is reserved for administrators.</AlertDescription>
      </Alert>
    );
  }

  const handleSave = async () => {
    if (!session?.user) return;
    setSaving(true);
    try {
      await saveSystemLogic(config, session.user.id);
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: null,
        entityType: "system_settings",
        action: "system_logic.updated",
        changeSummary: { config },
      });
      toast({ title: "System logic saved" });
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const isEnabled = (pcId: string, moduleId: string): boolean => {
    const row = mappings[pcId];
    if (!row || !(moduleId in row)) return true; // default-enabled when unmapped
    return row[moduleId];
  };

  const handleToggle = async (pcId: string, moduleId: string, next: boolean) => {
    if (!session?.user) return;
    const cellKey = `${pcId}:${moduleId}`;
    const previous = isEnabled(pcId, moduleId);
    // Optimistic
    setMappings((current) => ({
      ...current,
      [pcId]: { ...(current[pcId] ?? {}), [moduleId]: next },
    }));
    setSavingCell(cellKey);
    try {
      await setModuleMapping(pcId, moduleId, next, session.user.id);
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: pcId,
        entityType: "module_mapping",
        action: next ? "module.enabled" : "module.disabled",
        changeSummary: { moduleId, isEnabled: next },
      });
    } catch (e) {
      // Revert
      setMappings((current) => ({
        ...current,
        [pcId]: { ...(current[pcId] ?? {}), [moduleId]: previous },
      }));
      toast({ title: "Mapping save failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingCell(null);
    }
  };

  // Lifted bulk-disable runner so the confirm dialog (which lives outside the
  // row .map) can trigger the same code path used by the row's "Disable all" button.
  const runBulkDisable = async (pcId: string) => {
    if (!session?.user) return;
    const rowMappings: ModuleMapping[] = sortedModules.map((m) => ({
      profitCenterId: pcId,
      moduleId: m.id,
      isEnabled: isEnabled(pcId, m.id),
      updatedAt: "",
      updatedBy: null,
    }));
    const desired = sortedModules.map((m) => ({ moduleId: m.id, isEnabled: false }));
    const changes = diffMappings(rowMappings, desired);
    if (changes.length === 0) {
      toast({ title: "No changes" });
      return;
    }
    try {
      const direct = await applyBulkMappings({ profitCenterId: pcId, changes, actorUserId: session.user.id });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: pcId,
        entityType: "module_mapping",
        action: direct ? "module.bulk_applied" : "module.bulk_queued",
        changeSummary: { changeCount: changes.length, target: false },
      });
      toast({ title: direct ? `Updated ${changes.length} modules` : `Queued ${changes.length} changes for approval` });
      if (direct) {
        setMappings((current) => {
          const next = { ...current, [pcId]: { ...(current[pcId] ?? {}) } };
          for (const c of changes) next[pcId][c.moduleId] = c.isEnabled;
          return next;
        });
      }
    } catch (e) {
      toast({ title: "Bulk save failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sliders className="h-4 w-4" /> System Logic</CardTitle>
          <CardDescription>Global toggles that govern the cost-sheet engine. Changes are audited.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 max-w-2xl">
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>Enable slag credit</Label>
                  <p className="text-xs text-muted-foreground">Subtracts slag-quantity × CREDIT rate from total cost.</p>
                </div>
                <Switch checked={config.enableSlagCredit} onCheckedChange={(v) => setConfig({ ...config, enableSlagCredit: v })} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>Enable utility allocation</Label>
                  <p className="text-xs text-muted-foreground">Allocates utility rates by basis (per kWh, per Nm³, …).</p>
                </div>
                <Switch checked={config.enableUtilityAllocation} onCheckedChange={(v) => setConfig({ ...config, enableUtilityAllocation: v })} />
              </div>
              <div>
                <Label>Default allocation basis</Label>
                <Select value={config.defaultAllocationBasis} onValueChange={(v) => setConfig({ ...config, defaultAllocationBasis: v as AllocationBasis })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALLOCATION_BASES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cost rounding (decimal places)</Label>
                <Input
                  type="number"
                  min={0}
                  max={6}
                  value={config.costRoundingDp}
                  onChange={(e) => setConfig({ ...config, costRoundingDp: Math.max(0, Math.min(6, Number(e.target.value) || 0)) })}
                />
              </div>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save system logic"}</Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><LayoutGrid className="h-4 w-4" /> Module mappings per Profit Center</CardTitle>
          <CardDescription>
            Enable or disable application modules for each Profit Center. Unmapped cells default to enabled.
            Each toggle saves immediately and is audited. Bulk row actions of <strong>{BULK_APPROVAL_THRESHOLD}+</strong>{" "}
            module changes are routed through maker-checker approvals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mappingsLoading ? (
            <p className="text-sm text-muted-foreground">Loading mappings…</p>
          ) : activePCs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active profit centers.</p>
          ) : sortedModules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No app modules registered.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background min-w-[200px]">Profit Center</TableHead>
                    <TableHead className="min-w-[200px]">Bulk</TableHead>
                    {sortedModules.map((m) => (
                      <TableHead key={m.id} className="text-center min-w-[120px]">
                        <div className="font-medium">{m.defaultLabel}</div>
                        <div className="text-xs text-muted-foreground font-normal">{m.moduleKey}</div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activePCs.map((pc) => {
                    const rowMappings: ModuleMapping[] = sortedModules.map((m) => ({
                      profitCenterId: pc.id,
                      moduleId: m.id,
                      isEnabled: isEnabled(pc.id, m.id),
                      updatedAt: "",
                      updatedBy: null,
                    }));
                    const handleBulk = async (target: boolean) => {
                      if (!session?.user) return;
                      const desired = sortedModules.map((m) => ({ moduleId: m.id, isEnabled: target }));
                      const changes = diffMappings(rowMappings, desired);
                      if (changes.length === 0) {
                        toast({ title: "No changes" });
                        return;
                      }
                      try {
                        const direct = await applyBulkMappings({
                          profitCenterId: pc.id,
                          changes,
                          actorUserId: session.user.id,
                        });
                        await createAuditLog({
                          actorUserId: session.user.id,
                          profitCenterId: pc.id,
                          entityType: "module_mapping",
                          action: direct ? "module.bulk_applied" : "module.bulk_queued",
                          changeSummary: { changeCount: changes.length, target },
                        });
                        toast({
                          title: direct
                            ? `Updated ${changes.length} modules`
                            : `Queued ${changes.length} changes for approval`,
                        });
                        if (direct) {
                          // Reflect locally
                          setMappings((current) => {
                            const next = { ...current, [pc.id]: { ...(current[pc.id] ?? {}) } };
                            for (const c of changes) next[pc.id][c.moduleId] = c.isEnabled;
                            return next;
                          });
                        }
                      } catch (e) {
                        toast({ title: "Bulk save failed", description: (e as Error).message, variant: "destructive" });
                      }
                    };
                    const enableChanges = diffMappings(rowMappings, sortedModules.map((m) => ({ moduleId: m.id, isEnabled: true })));
                    const disableChanges = diffMappings(rowMappings, sortedModules.map((m) => ({ moduleId: m.id, isEnabled: false })));
                    return (
                      <TableRow key={pc.id}>
                        <TableCell className="sticky left-0 bg-background font-medium">{pc.name}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleBulk(true)}
                              title={requiresApproval(enableChanges) ? "Requires approval" : undefined}
                            >
                              Enable all{requiresApproval(enableChanges) ? " *" : ""}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (disableChanges.length === 0) {
                                  toast({ title: "No changes" });
                                  return;
                                }
                                setPendingDisable({ kind: "bulk", pcId: pc.id, pcName: pc.name, count: disableChanges.length });
                              }}
                              title={requiresApproval(disableChanges) ? "Requires approval" : undefined}
                            >
                              Disable all{requiresApproval(disableChanges) ? " *" : ""}
                            </Button>
                          </div>
                        </TableCell>
                        {sortedModules.map((m) => {
                          const cellKey = `${pc.id}:${m.id}`;
                          return (
                            <TableCell key={m.id} className="text-center">
                              <Switch
                                checked={isEnabled(pc.id, m.id)}
                                disabled={savingCell === cellKey}
                                onCheckedChange={(v) => {
                                  if (v) {
                                    void handleToggle(pc.id, m.id, true);
                                  } else {
                                    setPendingDisable({
                                      kind: "single",
                                      pcId: pc.id,
                                      pcName: pc.name,
                                      moduleId: m.id,
                                      moduleLabel: m.defaultLabel,
                                    });
                                  }
                                }}
                              />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={pendingDisable !== null} onOpenChange={(open) => { if (!open) setPendingDisable(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDisable?.kind === "bulk"
                ? `Disable ${pendingDisable.count} modules for ${pendingDisable.pcName}?`
                : pendingDisable
                  ? `Disable ${pendingDisable.moduleLabel} for ${pendingDisable.pcName}?`
                  : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Disabling hides the module(s) from the workspace navigation for everyone working in this Profit Center. This action is audited and can be re-enabled at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const p = pendingDisable;
                setPendingDisable(null);
                if (!p) return;
                if (p.kind === "single") {
                  void handleToggle(p.pcId, p.moduleId, false);
                } else {
                  void runBulkDisable(p.pcId);
                }
              }}
            >
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
