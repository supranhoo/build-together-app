import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspace } from "@/hooks/use-workspace";

export default function AdminModules() {
  const { modules } = useWorkspace();

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader>
        <CardTitle>Module configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          Module enablement, labels, sort order, and landing behavior are designed to come from backend configuration so different plants can run different portal shells.
        </p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => (
            <div key={module.id} className="rounded-md border border-border bg-panel px-4 py-4">
              <p className="font-semibold text-foreground">{module.navLabel}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-primary">/{module.routeSegment}</p>
            </div>
          ))}
          {modules.length === 0 && <div className="rounded-md border border-border bg-panel px-4 py-4">No configured modules available for the current workspace.</div>}
        </div>
      </CardContent>
    </Card>
  );
}
