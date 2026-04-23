import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspace } from "@/hooks/use-workspace";

export default function AdminAccess() {
  const { assignments, isSuperAdmin } = useWorkspace();

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader>
        <CardTitle>User assignment and access mapping</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          Access remains admin-controlled. User-to-workspace assignments define what each user can enter, while roles determine whether they can manage configuration.
        </p>
        <div className="rounded-md border border-border bg-panel px-4 py-4">
          Elevated scope: <span className="font-semibold text-foreground">{isSuperAdmin ? "Super Admin" : "Admin"}</span>
        </div>
        <div className="rounded-md border border-border bg-panel px-4 py-4">
          Visible workspace assignments in session: <span className="font-semibold text-foreground">{assignments.length}</span>
        </div>
      </CardContent>
    </Card>
  );
}
