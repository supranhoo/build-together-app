import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspace } from "@/hooks/use-workspace";

export default function AdminWorkspaces() {
  const { assignments, activeProfitCenter } = useWorkspace();

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader>
        <CardTitle>Workspace management</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          This area governs plant workspaces, activation state, descriptive metadata, and future onboarding of new plants or profit centers.
        </p>
        <div className="rounded-md border border-border bg-panel px-4 py-4">
          Current workspace focus: <span className="font-semibold text-foreground">{activeProfitCenter?.name || "Not selected"}</span>
        </div>
        <div className="rounded-md border border-border bg-panel px-4 py-4">
          Your current access scope spans <span className="font-semibold text-foreground">{assignments.length}</span> assigned workspace(s).
        </div>
      </CardContent>
    </Card>
  );
}
