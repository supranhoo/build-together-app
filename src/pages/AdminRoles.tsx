import { useEffect, useMemo, useState } from "react";
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
import { describeRule, fetchPermissionGrants, updatePermissionGrant, type PermissionGrant, type PermissionRule } from "@/lib/permissions";
import { createAuditLog } from "@/lib/workspace";

type RuleType = PermissionRule["type"];

export default function AdminRoles() {
  const { isSuperAdmin } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [grants, setGrants] = useState<PermissionGrant[]>([]);
  const [editing, setEditing] = useState<PermissionGrant | null>(null);
  const [ruleType, setRuleType] = useState<RuleType>("never");
  const [minutes, setMinutes] = useState("60");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => setGrants(await fetchPermissionGrants());
  useEffect(() => { void load(); }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionGrant[]>();
    grants.forEach((g) => {
      const key = g.resource;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    });
    return Array.from(map.entries());
  }, [grants]);

  const openEdit = (g: PermissionGrant) => {
    setEditing(g);
    setRuleType(g.rule.type);
    setMinutes(g.rule.type === "within_minutes" ? String(g.rule.minutes) : "60");
    setIsActive(g.isActive);
  };

  const buildRule = (): PermissionRule => {
    if (ruleType === "within_minutes") return { type: "within_minutes", minutes: Math.max(1, Number(minutes) || 0) };
    if (ruleType === "always") return { type: "always" };
    if (ruleType === "same_shift") return { type: "same_shift" };
    return { type: "never" };
  };

  const handleSave = async () => {
    if (!editing || !session?.user) return;
    setSaving(true);
    try {
      const rule = buildRule();
      await updatePermissionGrant({ id: editing.id, rule, isActive });
      await createAuditLog({
        actorUserId: session.user.id,
        entityType: "permission_grant",
        entityId: editing.id,
        action: "permission_grant.updated",
        changeSummary: { role: editing.role, resource: editing.resource, action: editing.action, rule, isActive },
      });
      toast({ title: "Permission updated" });
      setEditing(null);
      await load();
    } catch (error) {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <Card><CardHeader><CardTitle>Roles & Permissions</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">Only super admins can edit role permissions.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(([resource, items]) => (
        <Card key={resource} className="border-border bg-card shadow-panel">
          <CardHeader><CardTitle className="capitalize">Resource: {resource.replace(/_/g, " ")}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Role</TableHead><TableHead>Action</TableHead><TableHead>Rule</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {items.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium capitalize">{g.role}</TableCell>
                    <TableCell>{g.action}</TableCell>
                    <TableCell>{describeRule(g.rule)}</TableCell>
                    <TableCell>{g.isActive ? "Yes" : "No"}</TableCell>
                    <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(g)}>Edit</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit permission</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {editing.role} → {editing.resource} → {editing.action}
              </p>
              <div>
                <Label>Rule type</Label>
                <Select value={ruleType} onValueChange={(v) => setRuleType(v as RuleType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="always">Always allowed</SelectItem>
                    <SelectItem value="never">Never allowed</SelectItem>
                    <SelectItem value="within_minutes">Within N minutes of creation</SelectItem>
                    <SelectItem value="same_shift">Same shift / same day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {ruleType === "within_minutes" && (
                <div>
                  <Label>Minutes</Label>
                  <Input type="number" min="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                </div>
              )}
              <div className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
                <span>Grant active</span>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
