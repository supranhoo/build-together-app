import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert, Sliders } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { createAuditLog } from "@/lib/workspace";
import {
  DEFAULT_SYSTEM_LOGIC,
  getSystemLogic,
  saveSystemLogic,
  type AllocationBasis,
  type SystemLogicConfig,
} from "@/lib/system-settings";
import { ALLOCATION_BASES } from "@/lib/master-data";

export default function AdminSystemLogic() {
  const { isAdmin } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [config, setConfig] = useState<SystemLogicConfig>(DEFAULT_SYSTEM_LOGIC);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    getSystemLogic()
      .then((c) => { if (mounted) setConfig(c ?? DEFAULT_SYSTEM_LOGIC); })
      .catch((e) => toast({ title: "Failed to load", description: (e as Error).message, variant: "destructive" }))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [toast]);

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

  return (
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
  );
}
