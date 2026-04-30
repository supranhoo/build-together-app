import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { createAuditLog, updateUserProfile, type ManageableProfile } from "@/lib/workspace";
import { requestApproval } from "@/lib/approvals";
import { supabase } from "@/integrations/supabase/client";
import { UserPlus, Trash2 } from "lucide-react";

/**
 * Admin Users — view, edit, invite (create) and request-deletion of users
 * the current admin can manage.
 *
 * Per POLICY.md → Maker-Checker Approvals:
 *  - Inviting (creating) a user requires checker approval and is executed by
 *    the `admin-approve-action` edge function with the service role.
 *  - Deleting (deactivating) a user requires checker approval as well; the
 *    edge function flips `profiles.is_active=false`, deactivates PC
 *    assignments, and revokes roles.
 *  - Editing display name / department / job title applies directly under the
 *    existing "Admins can update manageable profiles" RLS policy.
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

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteDept, setInviteDept] = useState("");
  const [inviteTitle, setInviteTitle] = useState("");
  const [inviting, setInviting] = useState(false);

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

  const handleInvite = async () => {
    if (!session?.user) return;
    const email = inviteEmail.trim();
    if (!email.includes("@")) {
      toast({ title: "Invalid email", variant: "destructive" });
      return;
    }
    setInviting(true);
    try {
      await requestApproval({
        actionType: "user.create",
        payload: {
          email,
          displayName: inviteName.trim() || email.split("@")[0],
          department: inviteDept.trim() || null,
          jobTitle: inviteTitle.trim() || null,
        },
        requestedBy: session.user.id,
      });
      toast({ title: "Invite queued for approval", description: "A second administrator must approve before the user is created." });
      setInviteOpen(false);
      setInviteEmail(""); setInviteName(""); setInviteDept(""); setInviteTitle("");
    } catch (e) {
      toast({ title: "Could not queue invite", description: (e as Error).message, variant: "destructive" });
    } finally {
      setInviting(false);
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
  };

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Manageable users</CardTitle>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" /> Invite user
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Display name</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Job title</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {manageableProfiles.map((profile) => (
              <TableRow key={profile.userId}>
                <TableCell className="font-medium text-foreground">{profile.displayName || "—"}</TableCell>
                <TableCell>{profile.department || "—"}</TableCell>
                <TableCell>{profile.jobTitle || "—"}</TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => openEdit(profile)}>Edit</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeletingProfile(profile)}
                    disabled={profile.userId === session?.user?.id}
                    title={profile.userId === session?.user?.id ? "You cannot delete your own account" : undefined}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {manageableProfiles.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">No users in scope.</TableCell>
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

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite user (requires approval)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Email *</Label>
              <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" />
            </div>
            <div>
              <Label>Display name</Label>
              <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} maxLength={100} />
            </div>
            <div>
              <Label>Department</Label>
              <Input value={inviteDept} onChange={(e) => setInviteDept(e.target.value)} maxLength={100} />
            </div>
            <div>
              <Label>Job title</Label>
              <Input value={inviteTitle} onChange={(e) => setInviteTitle(e.target.value)} maxLength={100} />
            </div>
            <p className="text-xs text-muted-foreground">
              The user will be created only after a second administrator approves this request from the Approvals inbox.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleInvite()} disabled={inviting}>{inviting ? "Queuing…" : "Queue invite"}</Button>
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

// Touch supabase import to silence linter when no direct call (kept for future)
void supabase;
