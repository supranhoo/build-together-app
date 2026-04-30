import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { describeRule, fetchPermissionGrants, updatePermissionGrant, type PermissionGrant, type PermissionRule } from "@/lib/permissions";
import { createAuditLog } from "@/lib/workspace";
import {
  ALL_APP_ROLES,
  grantRole,
  isPrivilegedRole,
  listUserRoles,
  revokeRole,
  type AppRole,
  type UserRoleRow,
} from "@/lib/user-roles";

type RuleType = PermissionRule["type"];

export default function AdminRoles() {
  const { isAdmin, isSuperAdmin, manageableProfiles } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [grants, setGrants] = useState<PermissionGrant[]>([]);
  const [editing, setEditing] = useState<PermissionGrant | null>(null);
  const [ruleType, setRuleType] = useState<RuleType>("never");
  const [minutes, setMinutes] = useState("60");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userRoles, setUserRoles] = useState<UserRoleRow[]>([]);
  const [assignBusy, setAssignBusy] = useState<string | null>(null);
  const [pickRole, setPickRole] = useState<Record<string, AppRole>>({});

  const load = async () => setGrants(await fetchPermissionGrants());
  const loadUserRoles = async () => {
    try { setUserRoles(await listUserRoles()); } catch { /* RLS may block non-admins; tolerate */ }
  };
  useEffect(() => { void load(); void loadUserRoles(); }, []);


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

  const rolesByUser = useMemo(() => {
    const m = new Map<string, AppRole[]>();
    userRoles.forEach((r) => {
      const cur = m.get(r.userId) ?? [];
      cur.push(r.role);
      m.set(r.userId, cur);
    });
    return m;
  }, [userRoles]);

  const handleGrant = async (userId: string) => {
    if (!session?.user) return;
    const role = pickRole[userId];
    if (!role) return;
    setAssignBusy(`${userId}:grant:${role}`);
    try {
      const direct = await grantRole({ userId, role, actorUserId: session.user.id });
      await createAuditLog({
        actorUserId: session.user.id,
        entityType: "user_role",
        action: direct ? "role.granted" : "role.grant.queued",
        changeSummary: { userId, role },
      });
      toast({ title: direct ? "Role granted" : "Grant queued for approval" });
      await loadUserRoles();
    } catch (e) {
      toast({ title: "Grant failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setAssignBusy(null);
    }
  };

  const handleRevoke = async (userId: string, role: AppRole) => {
    if (!session?.user) return;
    setAssignBusy(`${userId}:revoke:${role}`);
    try {
      const direct = await revokeRole({ userId, role, actorUserId: session.user.id });
      await createAuditLog({
        actorUserId: session.user.id,
        entityType: "user_role",
        action: direct ? "role.revoked" : "role.revoke.queued",
        changeSummary: { userId, role },
      });
      toast({ title: direct ? "Role revoked" : "Revoke queued for approval" });
      await loadUserRoles();
    } catch (e) {
      toast({ title: "Revoke failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setAssignBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {isAdmin && (
        <Card className="border-border bg-card shadow-panel">
          <CardHeader>
            <CardTitle>User role assignments</CardTitle>
            <CardDescription>
              Grant or revoke per-user roles. Granting <strong>admin</strong> or <strong>super_admin</strong> requires
              checker approval (Maker-Checker policy).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Current roles</TableHead>
                  <TableHead className="w-[300px]">Add role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {manageableProfiles.map((p) => {
                  const roles = rolesByUser.get(p.userId) ?? [];
                  const sel = pickRole[p.userId];
                  return (
                    <TableRow key={p.userId}>
                      <TableCell className="font-medium">{p.displayName || p.userId.slice(0, 8)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                          {roles.map((r) => (
                            <Badge key={r} variant={isPrivilegedRole(r) ? "default" : "outline"} className="gap-1">
                              {r}
                              <button
                                className="ml-1 text-xs opacity-70 hover:opacity-100"
                                disabled={assignBusy === `${p.userId}:revoke:${r}`}
                                onClick={() => void handleRevoke(p.userId, r)}
                                title={isPrivilegedRole(r) ? "Revoke (requires approval)" : "Revoke"}
                              >
                                ×
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Select value={sel ?? ""} onValueChange={(v) => setPickRole({ ...pickRole, [p.userId]: v as AppRole })}>
                            <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                            <SelectContent>
                              {ALL_APP_ROLES.filter((r) => !roles.includes(r)).map((r) => (
                                <SelectItem key={r} value={r}>
                                  {r}{isPrivilegedRole(r) ? " (approval)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            disabled={!sel || assignBusy?.startsWith(`${p.userId}:grant`)}
                            onClick={() => void handleGrant(p.userId)}
                          >
                            Add
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {manageableProfiles.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-muted-foreground">No users in scope.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!isSuperAdmin && (
        <Card>
          <CardHeader><CardTitle>Permission rules</CardTitle></CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Only super admins can edit the role-permission matrix.
          </CardContent>
        </Card>
      )}

      {isSuperAdmin && grouped.map(([resource, items]) => (

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
