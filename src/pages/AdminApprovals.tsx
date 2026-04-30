import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert, Inbox } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { canDecide, decideApproval, listApprovals, type PendingApproval } from "@/lib/approvals";

/**
 * Pending approvals inbox.
 *
 * Renders all pending sensitive admin actions. Admins/super_admins can approve
 * or reject items they did not themselves request — a self-approval guard
 * ensures separation of duties (Policy: Maker-Checker Approvals).
 */
export default function AdminApprovals() {
  const { isAdmin } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setRows(await listApprovals("pending"));
    } catch (e) {
      toast({ title: "Failed to load approvals", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const decide = async (row: PendingApproval, decision: "approve" | "reject") => {
    if (!session?.user) return;
    setBusyId(row.id);
    try {
      await decideApproval({ approvalId: row.id, decision });
      toast({ title: decision === "approve" ? "Approved & executed" : "Rejected" });
      await refresh();
    } catch (e) {
      toast({ title: "Decision failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  if (!isAdmin) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Admin only</AlertTitle>
        <AlertDescription>Only administrators can view the approvals inbox.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Inbox className="h-4 w-4" /> Pending approvals</CardTitle>
        <CardDescription>
          Sensitive actions (user create/delete, privileged role grants, bulk module changes) wait here for a second
          administrator. The original requester cannot approve their own item.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending items.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Payload</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const allow = session?.user ? canDecide(session.user.id, r) : false;
                return (
                  <TableRow key={r.id}>
                    <TableCell><Badge variant="outline">{r.actionType}</Badge></TableCell>
                    <TableCell>
                      <pre className="text-xs whitespace-pre-wrap max-w-md">{JSON.stringify(r.payload, null, 2)}</pre>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.requestedBy.slice(0, 8)}…</TableCell>
                    <TableCell className="text-xs">{new Date(r.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!allow || busyId === r.id}
                        onClick={() => void decide(r, "reject")}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        disabled={!allow || busyId === r.id}
                        onClick={() => void decide(r, "approve")}
                      >
                        {busyId === r.id ? "…" : "Approve"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
