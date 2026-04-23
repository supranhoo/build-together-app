import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminAudit() {
  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader>
        <CardTitle>Audit review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          Sensitive configuration changes are designed to be appended to immutable audit records so governance can scale across plants and admins.
        </p>
        <div className="rounded-md border border-border bg-panel px-4 py-4">
          This foundation creates the audit log backend and reserves this page for the next implementation slice.
        </div>
      </CardContent>
    </Card>
  );
}
