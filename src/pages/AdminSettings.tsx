import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspace } from "@/hooks/use-workspace";

export default function AdminSettings() {
  const { settings, activeProfitCenter } = useWorkspace();

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader>
        <CardTitle>Workspace settings and process configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          Workspace settings are scoped records for plant-specific process variation. Future forms, formulas, and approvals should consume these values rather than hardcoded branches.
        </p>
        <div className="rounded-md border border-border bg-panel px-4 py-4">
          Active workspace: <span className="font-semibold text-foreground">{activeProfitCenter?.name || "Not selected"}</span>
        </div>
        <div className="rounded-md border border-border bg-panel px-4 py-4">
          Active setting records loaded: <span className="font-semibold text-foreground">{settings.length}</span>
        </div>
      </CardContent>
    </Card>
  );
}
