import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { createAuditLog, upsertProfitCenterSetting } from "@/lib/workspace";

export default function AdminSettings() {
  const { session } = useAuth();
  const { toast } = useToast();
  const { settings, activeProfitCenter, refreshWorkspace } = useWorkspace();
  const [settingKey, setSettingKey] = useState("");
  const [scope, setScope] = useState("workspace");
  const [settingValue, setSettingValue] = useState('{\n  "label": ""\n}');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!session?.user || !activeProfitCenter) return;

    setSaving(true);
    try {
      const parsedValue = JSON.parse(settingValue) as Record<string, unknown>;
      await upsertProfitCenterSetting({ profitCenterId: activeProfitCenter.id, settingKey, scope, settingValue: parsedValue });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "profit_center_settings",
        action: "setting.upserted",
        changeSummary: { settingKey, scope },
      });
      await refreshWorkspace();
      toast({ title: "Setting saved", description: "Workspace settings were updated." });
      setSettingKey("");
      setSettingValue('{\n  "label": ""\n}');
    } catch (error) {
      toast({ title: "Setting save failed", description: error instanceof Error ? error.message : "Ensure the JSON is valid.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
      <Card className="border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>Active workspace settings</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.map((setting) => (
                <TableRow key={setting.id}>
                  <TableCell className="font-medium text-foreground">{setting.settingKey}</TableCell>
                  <TableCell>{setting.scope}</TableCell>
                  <TableCell className="max-w-[420px] truncate">{JSON.stringify(setting.settingValue)}</TableCell>
                </TableRow>
              ))}
              {settings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">No workspace settings stored yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>Upsert workspace setting</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label htmlFor="setting-key">Setting key</Label><Input id="setting-key" value={settingKey} onChange={(e) => setSettingKey(e.target.value)} placeholder="production.recovery_formula" /></div>
          <div className="space-y-2"><Label htmlFor="setting-scope">Scope</Label><Input id="setting-scope" value={scope} onChange={(e) => setScope(e.target.value)} placeholder="workspace" /></div>
          <div className="space-y-2"><Label htmlFor="setting-value">JSON value</Label><Textarea id="setting-value" className="min-h-[220px] font-mono text-xs" value={settingValue} onChange={(e) => setSettingValue(e.target.value)} /></div>
          <Button onClick={() => void handleSave()} disabled={saving || !activeProfitCenter || !settingKey}>
            {saving ? "Saving…" : "Save setting"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
