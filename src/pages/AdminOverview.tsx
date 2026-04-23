import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspace } from "@/hooks/use-workspace";

const adminSections = [
  {
    title: "Workspace management",
    text: "Create and govern plant workspaces, codes, active status, and operational identity without shipping new code.",
  },
  {
    title: "Module configuration",
    text: "Enable, rename, order, and define the default landing module per workspace from backend configuration.",
  },
  {
    title: "Process settings",
    text: "Store scoped settings for plant-specific process variation so future forms and logic remain data-driven.",
  },
];

export default function AdminOverview() {
  const { activeProfitCenter, assignments } = useWorkspace();

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card className="border-border bg-panel-gradient shadow-panel">
          <CardHeader>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Admin architecture</p>
            <CardTitle className="mt-3 text-3xl">Configuration governs scale across plants and process variants</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-7 text-muted-foreground">
            The admin area is split into dedicated pages so workspace structure, module visibility, user assignments, settings, and audit history can scale without hardcoded portal behavior.
          </CardContent>
        </Card>
        <Card className="border-border bg-card shadow-panel">
          <CardHeader>
            <CardTitle className="text-lg">Current scope</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-md border border-border bg-panel px-4 py-3">
              Active workspace: <span className="font-semibold text-foreground">{activeProfitCenter?.name || "Not selected"}</span>
            </div>
            <div className="rounded-md border border-border bg-panel px-4 py-3">
              Assigned workspaces: <span className="font-semibold text-foreground">{assignments.length}</span>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {adminSections.map((section) => (
          <Card key={section.title} className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-xl">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">{section.text}</CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
