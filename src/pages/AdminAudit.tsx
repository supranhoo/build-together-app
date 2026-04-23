import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWorkspace } from "@/hooks/use-workspace";

export default function AdminAudit() {
  const { auditLogs } = useWorkspace();

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader>
        <CardTitle>Audit review</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auditLogs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-medium text-foreground">{log.action}</TableCell>
                <TableCell>{log.entityType}</TableCell>
                <TableCell>{log.actorUserId}</TableCell>
                <TableCell className="max-w-[320px] truncate">{JSON.stringify(log.changeSummary)}</TableCell>
                <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {auditLogs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">No audit records are visible for the current scope yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
