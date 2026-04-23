import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { createAuditLog, upsertProfitCenterModuleConfig } from "@/lib/workspace";

export default function AdminModules() {
  const { session } = useAuth();
  const { toast } = useToast();
  const { activeProfitCenter, appModules, modules, refreshWorkspace } = useWorkspace();
  const [saving, setSaving] = useState(false);

  const rows = useMemo(
    () => appModules.map((module) => {
      const configured = modules.find((item) => item.moduleId === module.id || item.moduleKey === module.moduleKey);
      return {
        module,
        navLabel: configured?.navLabel || module.defaultLabel,
        routeSegment: configured?.routeSegment || module.routeSegment,
        sortOrder: configured?.sortOrder ?? module.sortOrder,
        isEnabled: configured ? true : false,
        isDefaultEntry: configured?.isDefaultEntry ?? false,
      };
    }),
    [appModules, modules],
  );

  const [drafts, setDrafts] = useState(rows);

  useEffect(() => {
    setDrafts(rows);
  }, [rows]);

  const handleSave = async () => {
    if (!session?.user || !activeProfitCenter) return;

    setSaving(true);
    try {
      for (const row of drafts) {
        await upsertProfitCenterModuleConfig({
          profitCenterId: activeProfitCenter.id,
          moduleId: row.module.id,
          navLabel: row.navLabel,
          routeSegment: row.routeSegment,
          sortOrder: Number(row.sortOrder),
          isEnabled: row.isEnabled,
          isDefaultEntry: row.isDefaultEntry,
        });
      }

      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "profit_center_modules",
        action: "modules.updated",
        changeSummary: { count: drafts.length },
      });
      await refreshWorkspace();
      toast({ title: "Module configuration saved", description: "Workspace navigation now reflects the saved configuration." });
    } catch (error) {
      toast({ title: "Module save failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader>
        <CardTitle>Module configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!activeProfitCenter ? (
          <div className="rounded-md border border-border bg-panel px-4 py-4 text-sm text-muted-foreground">Select a workspace first to manage module behavior.</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Module</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Default</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((row, index) => (
                  <TableRow key={row.module.id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{row.module.defaultLabel}</p>
                      <p className="text-xs text-muted-foreground">{row.module.description || row.module.moduleKey}</p>
                    </TableCell>
                    <TableCell><Switch checked={row.isEnabled} onCheckedChange={(checked) => setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, isEnabled: checked } : item))} /></TableCell>
                    <TableCell><Input value={row.navLabel} onChange={(e) => setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, navLabel: e.target.value } : item))} /></TableCell>
                    <TableCell><Input value={row.routeSegment} onChange={(e) => setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, routeSegment: e.target.value } : item))} /></TableCell>
                    <TableCell><Input type="number" value={row.sortOrder} onChange={(e) => setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, sortOrder: Number(e.target.value) } : item))} /></TableCell>
                    <TableCell><Switch checked={row.isDefaultEntry} onCheckedChange={(checked) => setDrafts((current) => current.map((item, itemIndex) => ({ ...item, isDefaultEntry: itemIndex === index ? checked : false })))} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="rounded-md border border-border bg-panel px-4 py-4 text-sm text-muted-foreground">
              Only one module should be marked as the default entry for a workspace.
            </div>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving…" : "Save module configuration"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
