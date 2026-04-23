import { Factory, FileBarChart2, Warehouse } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const iconMap = {
  inventory: Warehouse,
  production: Factory,
  reports: FileBarChart2,
};

const copyMap = {
  inventory: {
    eyebrow: "Inventory foundation",
    title: "Material visibility for every shift",
    text: "This workspace is prepared for receipts, stock reconciliation, yard positioning, and heat-linked traceability.",
    bullets: ["Inbound raw materials", "Bin and yard balances", "Critical consumable alerts"],
  },
  production: {
    eyebrow: "Production foundation",
    title: "Heat planning and execution control",
    text: "This workspace is prepared for furnace planning, live production stages, tapping control, and output monitoring.",
    bullets: ["Shift scheduling", "Heat progress states", "Line utilization snapshots"],
  },
  reports: {
    eyebrow: "Reporting foundation",
    title: "Plant reporting, packed for management",
    text: "This workspace is prepared for operational summaries, compliance packs, and management-ready daily reporting.",
    bullets: ["Daily plant summary", "Exception reporting", "Trend and KPI packs"],
  },
};

export default function ModulePlaceholder({ module }: { module: keyof typeof copyMap }) {
  const Icon = iconMap[module];
  const copy = copyMap[module];

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="space-y-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-md bg-primary/12 text-primary">
          <Icon className="h-7 w-7" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">{copy.eyebrow}</p>
          <CardTitle className="mt-3 text-3xl">{copy.title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 text-sm text-muted-foreground">
        <p className="max-w-3xl leading-7">{copy.text}</p>
        <div className="grid gap-3 md:grid-cols-3">
          {copy.bullets.map((bullet) => (
            <div key={bullet} className="rounded-md border border-border bg-panel px-4 py-5 text-foreground">
              {bullet}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
