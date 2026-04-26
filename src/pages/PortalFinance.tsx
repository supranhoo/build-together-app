/**
 * Portal Finance & Costing — Phase A shell.
 *
 * 9-tab module entry point for the plant-side Finance & Costing experience.
 * Phase A wires the existing PortalCosting page as the legacy "Cost Sheet"
 * tab so users see real data immediately. The remaining 8 tabs render an
 * empty-state card describing what Phase B / C / D will add — this satisfies
 * the zero-hardcoding rule (no fake data) while letting users see the full
 * navigation map.
 *
 * Hard rules:
 *  - Semantic tokens only.
 *  - Workspace-scoped via useWorkspace.
 *  - No business logic in this file — every active tab delegates to either
 *    a dedicated component or an SSOT page.
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  Calendar,
  CheckSquare,
  FileBarChart2,
  GitCompareArrows,
  LayoutDashboard,
  LineChart,
  Recycle,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/hooks/use-workspace";
import PortalCosting from "@/pages/PortalCosting";
import PortalFerroCostSheet from "@/pages/PortalFerroCostSheet";
import PortalFinanceVariance from "@/pages/PortalFinanceVariance";
import PortalHeatApprovals from "@/pages/PortalHeatApprovals";
import PortalPowerAnalysis from "@/pages/PortalPowerAnalysis";
import PortalProfitability from "@/pages/PortalProfitability";
import PortalRecoveryCosting from "@/pages/PortalRecoveryCosting";
import PortalSnapshots from "@/pages/PortalSnapshots";

type TabSpec = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  /** When true, the tab renders the working PortalCosting page. */
  live?: boolean;
  /** Phase that will activate this tab. */
  phase: "A" | "B" | "C" | "D";
};

const TABS: TabSpec[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "MTD vs budget, top-3 variance drivers and the alert feed.",
    phase: "D",
  },
  {
    id: "heat_approvals",
    label: "Heat Approvals",
    icon: CheckSquare,
    description:
      "Submit completed heats for approval. Only approved heats can drive a Ferro Cost Sheet.",
    live: true,
    phase: "D",
  },
  {
    id: "cost_sheet",
    label: "Cost Sheet",
    icon: Calculator,
    description:
      "Ferro Costing Engine — pick an approved heat to compute material + conversion − by-product credits, save the sheet, and export.",
    live: true,
    phase: "D",
  },
  {
    id: "recovery_costing",
    label: "Recovery & Costing",
    icon: GitCompareArrows,
    description:
      "Multi-slot Report Comparison Engine — compare furnaces × date ranges side-by-side with deltas vs a baseline.",
    live: true,
    phase: "D",
  },
  {
    id: "variance",
    label: "Variance Analysis",
    icon: TrendingUp,
    description: "IDEAL vs ACTUAL vs VAR per furnace, decomposed into price and usage variance.",
    live: true,
    phase: "B",
  },
  {
    id: "power",
    label: "Power Analysis",
    icon: Zap,
    description: "kWh per MT trend, Time-Of-Day tariff slab decomposition and demand-charge tracking.",
    live: true,
    phase: "C",
  },
  {
    id: "byproducts",
    label: "By-products",
    icon: Recycle,
    description: "Slag and dust valorization — tonnage produced × current sale rate, netted off cost per MT.",
    phase: "B",
  },
  {
    id: "profitability",
    label: "Profitability",
    icon: LineChart,
    description: "Selling price − net cost = margin per MT, split by grade and product.",
    live: true,
    phase: "C",
  },
  {
    id: "snapshots",
    label: "Period Snapshots",
    icon: Calendar,
    description:
      "Locked monthly closes. Once a period is locked, its numbers never change even if rates are back-dated.",
    live: true,
    phase: "C",
  },
  {
    id: "alerts",
    label: "Cost Alerts",
    icon: AlertTriangle,
    description: "Live feed of breached thresholds (cost/MT, kWh/MT, recovery loss, etc.).",
    phase: "D",
  },
  {
    id: "reports",
    label: "Reports",
    icon: FileBarChart2,
    description: "Period-over-period Excel exports with all sheets — summary, heats, variance, by-products, power, profitability.",
    phase: "D",
  },
];

const phaseBadgeVariant: Record<TabSpec["phase"], "default" | "secondary" | "outline"> = {
  A: "default",
  B: "secondary",
  C: "outline",
  D: "outline",
};

export default function PortalFinance() {
  const { activeProfitCenter } = useWorkspace();
  const [active, setActive] = useState<string>("cost_sheet");

  const activeTab = useMemo(() => TABS.find((t) => t.id === active) ?? TABS[1], [active]);

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Finance & Costing</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">Select a workspace.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card shadow-panel">
        <CardHeader className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Finance & Costing — {activeProfitCenter.name}</CardTitle>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
              Phase C · power, profitability & snapshots live
            </Badge>
          </div>
          <CardDescription>{activeTab.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={active} onValueChange={setActive} className="w-full">
            <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-muted/40 p-1">
              {TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <TabsTrigger
                    key={t.id}
                    value={t.id}
                    className="gap-2 data-[state=active]:bg-background"
                    aria-label={t.label}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{t.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {TABS.map((t) => {
              let liveBody: React.ReactNode = null;
              if (t.id === "cost_sheet") liveBody = <PortalCosting />;
              else if (t.id === "variance") liveBody = <PortalFinanceVariance />;
              else if (t.id === "power") liveBody = <PortalPowerAnalysis />;
              else if (t.id === "profitability") liveBody = <PortalProfitability />;
              else if (t.id === "snapshots") liveBody = <PortalSnapshots />;
              return (
                <TabsContent key={t.id} value={t.id} className="mt-6">
                  {t.live && liveBody ? liveBody : (
                    <Card className="border-dashed">
                      <CardHeader className="flex flex-row items-start gap-3">
                        <Sparkles className="mt-1 h-5 w-5 text-primary" aria-hidden />
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            {t.label}
                            <Badge variant={phaseBadgeVariant[t.phase]} className="text-[10px] uppercase">
                              Phase {t.phase}
                            </Badge>
                          </CardTitle>
                          <CardDescription className="mt-1">{t.description}</CardDescription>
                        </div>
                      </CardHeader>
                      <CardContent className="text-sm text-muted-foreground">
                        This tab is registered in the Finance & Costing module map and will
                        activate in Phase {t.phase}. Until then it intentionally shows no data — the
                        module never displays placeholder numbers.
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
