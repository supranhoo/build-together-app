import { ArrowUpRight, BarChart3, Factory, Gauge, Warehouse } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const metrics = [
  { label: "Shift uptime", value: "98.4%", detail: "+1.6% vs target", icon: Gauge },
  { label: "Billet stock", value: "4,280 MT", detail: "12 heats buffered", icon: Warehouse },
  { label: "Rolling output", value: "1,240 T/day", detail: "3 lines active", icon: Factory },
  { label: "Report queue", value: "14", detail: "Daily packs pending", icon: BarChart3 },
];

const modules = [
  {
    title: "Inventory workspace",
    text: "Raw material receipts, stock positioning, consumable levels, and heat-wise traceability are ready for operational rollout.",
    accent: "bg-primary/12 text-primary",
  },
  {
    title: "Production workspace",
    text: "Furnace planning, heat progress, tapping milestones, and line utilization mirror the industrial reference structure.",
    accent: "bg-accent/14 text-accent",
  },
  {
    title: "Reporting workspace",
    text: "Leadership packs, plant summaries, and compliance snapshots are staged inside the authenticated portal shell.",
    accent: "bg-success/14 text-success",
  },
];

export default function PortalOverview() {
  const { profile } = useAuth();

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="border-border bg-panel-gradient shadow-panel">
          <CardHeader className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Employee portal</p>
            <CardTitle className="text-3xl text-balance">Operational command view for {profile?.department || "plant"} teams</CardTitle>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Signed in as {profile?.display_name || "employee"}. This starter portal keeps the layout dense and shift-focused while preparing Inventory, Production, and Reports for the next delivery.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button className="h-11 gap-2">Open daily brief <ArrowUpRight className="h-4 w-4" /></Button>
            <Button variant="outline" className="h-11">View release roadmap</Button>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-panel">
          <CardHeader>
            <CardTitle className="text-lg">Current access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
              <span className="text-muted-foreground">Role</span>
              <span className="font-semibold capitalize">{profile?.role || "user"}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
              <span className="text-muted-foreground">Department</span>
              <span className="font-semibold">{profile?.department || "Operations"}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
              <span className="text-muted-foreground">Job title</span>
              <span className="font-semibold">{profile?.job_title || "Plant staff"}</span>
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
          <Card key={module.title} className="border-border bg-card">
            <CardHeader>
              <div className={`inline-flex w-fit rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${module.accent}`}>
                Planned module
              </div>
              <CardTitle className="mt-3 text-xl">{module.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">{module.text}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
