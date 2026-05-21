import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { createAuditLog, updateUserProfile, type ManageableProfile } from "@/lib/workspace";
import { requestApproval } from "@/lib/approvals";
import { validatePasswordStrength } from "@/lib/auth";
import { changeUserEmail, createUserDirect, resetUserPassword, setUserActive } from "@/lib/users-admin";
import { AtSign, KeyRound, Trash2, UserPlus } from "lucide-react";

/**
 * Admin Users — view, create, edit, reset-password, activate/deactivate, and
 * request-deletion of users.
 *
 * Per POLICY.md → User Management:
 *  - Create / reset password / activate-deactivate are DIRECT admin actions.
 *    The corresponding edge functions enforce role + audit logging.
 *  - Deleting (deactivating) a user via the destructive "Delete" button still
 *    routes through the maker-checker approvals queue.
 *  - Editing display name / department / job title applies directly under the
 *    "Admins can update manageable profiles" RLS policy.
 */
export default function AdminUsers() {
  const { session } = useAuth();
  const { toast } = useToast();
  const { manageableProfiles, refreshWorkspace, activeProfitCenter } = useWorkspace();

  const [editing, setEditing] = useState<ManageableProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [department, setDepartment] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [saving, setSaving] = useState(false);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newDept, setNewDept] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [creating, setCreating] = useState(false);

  // Reset password dialog
  const [resetTarget, setResetTarget] = useState<ManageableProfile | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [resetPwConfirm, setResetPwConfirm] = useState("");
  const [resetting, setResetting] = useState(false);

  // Active toggle in-flight set
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Change email dialog
  const [emailTarget, setEmailTarget] = useState<ManageableProfile | null>(null);
  const [newLoginEmail, setNewLoginEmail] = useState("");
  const [changingEmail, setChangingEmail] = useState(false);

  // Delete confirmation
  const [deletingProfile, setDeletingProfile] = useState<ManageableProfile | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const openEdit = (profile: ManageableProfile) => {
    setEditing(profile);
    setDisplayName(profile.displayName ?? "");
    setDepartment(profile.department ?? "");
    setJobTitle(profile.jobTitle ?? "");
  };

  const handleSave = async () => {
    if (!editing || !session?.user) return;
    const trimmedName = displayName.trim();
    if (trimmedName.length === 0 || trimmedName.length > 100) {
      toast({ title: "Invalid name", description: "Display name must be 1–100 characters.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const next = {
        displayName: trimmedName,
        department: department.trim() || null,
        jobTitle: jobTitle.trim() || null,
      };
      await updateUserProfile({ userId: editing.userId, ...next });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter?.id ?? null,
        entityType: "profile",
        action: "profile.updated",
        changeSummary: {
          userId: editing.userId,
          before: { displayName: editing.displayName, department: editing.department, jobTitle: editing.jobTitle },
          after: next,
        },
      });
      toast({ title: "Profile updated" });
      setEditing(null);
      await refreshWorkspace();
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const resetCreateForm = () => {
    setNewEmail(""); setNewName(""); setNewDept(""); setNewTitle("");
    setNewPassword(""); setNewPasswordConfirm("");
  };

  const handleCreate = async () => {
    if (!session?.user) return;
    const email = newEmail.trim();
    if (!email.includes("@")) {
      toast({ title: "Invalid email", variant: "destructive" });
      return;
    }
    const pwCheck = validatePasswordStrength(newPassword);
    if (!pwCheck.ok) {
      toast({ title: "Weak password", description: (pwCheck as { reason?: string }).reason, variant: "destructive" });
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      await createUserDirect({
        email,
        password: newPassword,
        displayName: newName.trim() || email.split("@")[0],
        department: newDept.trim() || null,
        jobTitle: newTitle.trim() || null,
      });
      toast({ title: "User created", description: `${email} can now sign in.` });
      setCreateOpen(false);
      resetCreateForm();
      await refreshWorkspace();
    } catch (e) {
      toast({ title: "Could not create user", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    const pwCheck = validatePasswordStrength(resetPw);
    if (!pwCheck.ok) {
      toast({ title: "Weak password", description: (pwCheck as { reason?: string }).reason, variant: "destructive" });
      return;
    }
    if (resetPw !== resetPwConfirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setResetting(true);
    try {
      await resetUserPassword({ userId: resetTarget.userId, password: resetPw });
      toast({ title: "Password reset" });
      setResetTarget(null);
      setResetPw(""); setResetPwConfirm("");
    } catch (e) {
      toast({ title: "Reset failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const handleToggleActive = async (profile: ManageableProfile, next: boolean) => {
    if (!session?.user) return;
    if (profile.userId === session.user.id && !next) {
      toast({ title: "Cannot deactivate yourself", variant: "destructive" });
      return;
    }
    setTogglingId(profile.userId);
    try {
      await setUserActive({ userId: profile.userId, isActive: next });
      toast({ title: next ? "User activated" : "User deactivated" });
      await refreshWorkspace();
    } catch (e) {
      toast({ title: "Update failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!session?.user || !deletingProfile) return;
    setDeletingBusy(true);
    try {
      await requestApproval({
        actionType: "user.delete",
        payload: { userId: deletingProfile.userId, displayName: deletingProfile.displayName },
        requestedBy: session.user.id,
      });
      toast({ title: "Deletion queued for approval" });
      setDeletingProfile(null);
    } catch (e) {
      toast({ title: "Could not queue deletion", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDeletingBusy(false);
    }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleChangeEmail = async () => {
    if (!emailTarget) return;
    const next = newLoginEmail.trim();
    if (!EMAIL_RE.test(next)) {
      toast({ title: "Invalid email", variant: "destructive" });
      return;
    }
    if (next.toLowerCase() === (emailTarget.email ?? "").toLowerCase()) {
      toast({ title: "Email unchanged", description: "Enter a different address.", variant: "destructive" });
      return;
    }
    setChangingEmail(true);
    try {
      await changeUserEmail({ userId: emailTarget.userId, email: next });
      toast({ title: "Email updated", description: `${emailTarget.displayName ?? "User"} now signs in with ${next}.` });
      setEmailTarget(null);
      setNewLoginEmail("");
      await refreshWorkspace();
    } catch (e) {
      toast({ title: "Could not change email", description: (e as Error).message, variant: "destructive" });
    } finally {
      setChangingEmail(false);
    }
  };

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>User Management</CardTitle>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" /> Create user
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Display name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Job title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {manageableProfiles.map((profile) => {
              const isSelf = profile.userId === session?.user?.id;
              return (
                <TableRow key={profile.userId}>
                  <TableCell className="font-medium text-foreground">{profile.displayName || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{profile.email || "—"}</TableCell>
                  <TableCell>{profile.department || "—"}</TableCell>
                  <TableCell>{profile.jobTitle || "—"}</TableCell>
          <TableBody>
            {manageableProfiles.map((profile) => {
              const isSelf = profile.userId === session?.user?.id;
              return (
                <TableRow key={profile.userId}>
                  <TableCell className="font-medium text-foreground">{profile.displayName || "—"}</TableCell>
                  <TableCell>{profile.department || "—"}</TableCell>
                  <TableCell>{profile.jobTitle || "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={profile.isActive}
                        disabled={isSelf || togglingId === profile.userId}
                        onCheckedChange={(v) => void handleToggleActive(profile, v)}
                        aria-label={profile.isActive ? "Deactivate user" : "Activate user"}
                      />
                      <Badge variant={profile.isActive ? "secondary" : "outline"}>
                        {profile.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => openEdit(profile)}>Edit</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setResetTarget(profile); setResetPw(""); setResetPwConfirm(""); }}
                      title="Reset password"
                    >
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeletingProfile(profile)}
                      disabled={isSelf}
                      title={isSelf ? "You cannot delete your own account" : "Delete user"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {manageableProfiles.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">No users in scope.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit user profile</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Display name</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={100} />
              </div>
              <div>
                <Label>Department</Label>
                <Input value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={100} />
              </div>
              <div>
                <Label>Job title</Label>
                <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={100} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) resetCreateForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create user</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Email *</Label>
              <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} type="email" autoComplete="off" />
            </div>
            <div>
              <Label>Display name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={100} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Department</Label>
                <Input value={newDept} onChange={(e) => setNewDept(e.target.value)} maxLength={100} />
              </div>
              <div>
                <Label>Job title</Label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={100} />
              </div>
            </div>
            <div>
              <Label>Password *</Label>
              <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" autoComplete="new-password" />
            </div>
            <div>
              <Label>Confirm password *</Label>
              <Input value={newPasswordConfirm} onChange={(e) => setNewPasswordConfirm(e.target.value)} type="password" autoComplete="new-password" />
            </div>
            <p className="text-xs text-muted-foreground">
              Minimum 8 characters with at least one letter and one digit. The user can sign in immediately.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={creating}>{creating ? "Creating…" : "Create user"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(v) => !v && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Set a new password for <strong>{resetTarget?.displayName || resetTarget?.userId}</strong>. Share it securely; they can change it after signing in.
          </p>
          <div className="space-y-3">
            <div>
              <Label>New password *</Label>
              <Input value={resetPw} onChange={(e) => setResetPw(e.target.value)} type="password" autoComplete="new-password" />
            </div>
            <div>
              <Label>Confirm *</Label>
              <Input value={resetPwConfirm} onChange={(e) => setResetPwConfirm(e.target.value)} type="password" autoComplete="new-password" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button onClick={() => void handleResetPassword()} disabled={resetting}>
              {resetting ? "Resetting…" : "Reset password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deletingProfile} onOpenChange={(v) => !v && setDeletingProfile(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete user (requires approval)</DialogTitle></DialogHeader>
          <p className="text-sm">
            Queue deactivation of <strong>{deletingProfile?.displayName || deletingProfile?.userId}</strong>?
            They will be marked inactive, removed from all profit centers, and have all roles revoked once a second
            administrator approves.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingProfile(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={deletingBusy}>
              {deletingBusy ? "Queuing…" : "Queue deletion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
