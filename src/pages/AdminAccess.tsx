import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { assignUserToProfitCenter, createAuditLog } from "@/lib/workspace";

export default function AdminAccess() {
  const { session } = useAuth();
  const { toast } = useToast();
  const { activeProfitCenter, manageableProfiles, workspaceAssignments, refreshWorkspace } = useWorkspace();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  const assignedProfiles = useMemo(
    () => workspaceAssignments.map((assignment) => ({
      ...assignment,
      profile: manageableProfiles.find((profile) => profile.userId === assignment.userId),
    })),
    [manageableProfiles, workspaceAssignments],
  );

  const handleAssign = async () => {
    if (!session?.user || !activeProfitCenter || !selectedUserId) return;

    setSaving(true);
    try {
      await assignUserToProfitCenter({ userId: selectedUserId, profitCenterId: activeProfitCenter.id, isDefault });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "user_profit_center",
        action: "assignment.upserted",
        changeSummary: { userId: selectedUserId, isDefault },
      });
      await refreshWorkspace();
      toast({ title: "Assignment saved", description: "User access for the workspace has been updated." });
      setSelectedUserId("");
      setIsDefault(false);
    } catch (error) {
      toast({ title: "Assignment failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_0.95fr]">
      <Card className="border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>Current workspace assignments</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Job title</TableHead>
                <TableHead>Default</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignedProfiles.map((assignment) => (
                <TableRow key={assignment.userId}>
                  <TableCell className="font-medium text-foreground">{assignment.profile?.displayName || assignment.userId}</TableCell>
                  <TableCell>{assignment.profile?.department || "—"}</TableCell>
                  <TableCell>{assignment.profile?.jobTitle || "—"}</TableCell>
                  <TableCell>{assignment.isDefault ? "Yes" : "No"}</TableCell>
                </TableRow>
              ))}
              {assignedProfiles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">No users assigned to this workspace yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border bg-card shadow-panel">
        <CardHeader>
          <CardTitle>Assign user to workspace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a user" />
            </SelectTrigger>
            <SelectContent>
              {manageableProfiles.map((profile) => (
                <SelectItem key={profile.userId} value={profile.userId}>
                  {profile.displayName || profile.userId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
            <div>
              <p className="font-medium text-foreground">Default workspace</p>
              <p className="text-sm text-muted-foreground">Marks this workspace as the user’s preferred entry point.</p>
            </div>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </div>
          <Button onClick={() => void handleAssign()} disabled={saving || !activeProfitCenter || !selectedUserId}>
            {saving ? "Saving…" : "Save assignment"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
