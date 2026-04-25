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

/**
 * Admin Users — edit profile fields (display name, department, job title)
 * for users the current admin can manage. Scope is enforced server-side by
 * the "Admins can update manageable profiles" RLS policy on public.profiles.
 *
 * No user creation here: users are provisioned via self sign-up, and the
 * handle_new_user_profile() trigger creates the profile + default role.
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
        entityId: null,
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

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader>
        <CardTitle>Manageable users</CardTitle>
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
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => openEdit(profile)}>Edit</Button>
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
    </Card>
  );
}
