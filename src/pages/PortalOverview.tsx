import { BarChart3, Factory, Gauge, MapPin, Warehouse } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";

export default function PortalOverview() {
  const { profile } = useAuth();
  const { activeProfitCenter, modules, settings, assignments } = useWorkspace();

  const metrics = [
    { label: "Assigned workspaces", value: String(assignments.length), detail: "Access scope in current session", icon: Gauge },
    { label: "Configured modules", value: String(modules.length), detail: "Driven by backend configuration", icon: Warehouse },
    { label: "Active settings", value: String(settings.length), detail: "Workspace-level process records", icon: Factory },
    { label: "Workspace status", value: activeProfitCenter?.isActive ? "Active" : "Pending", detail: activeProfitCenter?.code || "No workspace", icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="border-border bg-panel-gradient shadow-panel">
          <CardHeader className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Workspace command view</p>
            <CardTitle className="text-3xl text-balance">
              {activeProfitCenter ? `${activeProfitCenter.name} operating context` : "Select a workspace to continue"}
            </CardTitle>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Signed in as {profile?.display_name || "employee"}. This portal shell now reads workspace access, modules, and process settings from backend configuration instead of hardcoded plant assumptions.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button className="h-11 gap-2">Open workspace brief</Button>
            <Button variant="outline" className="h-11">Review configured modules</Button>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-panel">
          <CardHeader>
            <CardTitle className="text-lg">Current workspace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
              <span className="text-muted-foreground">Role</span>
              <span className="font-semibold capitalize">{profile?.role || "user"}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
              <span className="text-muted-foreground">Location</span>
              <span className="font-semibold inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />{activeProfitCenter?.locationName || "Admin configured"}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
              <span className="text-muted-foreground">Process profile</span>
              <span className="font-semibold">{activeProfitCenter?.processProfile || "Workspace-defined"}</span>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((item) => (
          <Card key={item.label} className="border-border bg-card">
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="mt-3 text-2xl font-semibold">{item.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <div className="rounded-md bg-primary/12 p-3 text-primary">
                <item.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {modules.map((module) => (
          <Card key={module.id} className="border-border bg-card">
            <CardHeader>
              <div className="inline-flex w-fit rounded-full bg-primary/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                Configured module
              </div>
              <CardTitle className="mt-3 text-xl">{module.navLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">{module.description || "Workspace-controlled module prepared for future operational delivery."}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
