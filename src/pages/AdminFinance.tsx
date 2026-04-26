/**
 * Admin Finance & Costing — Phase A shell.
 *
 * 9-tab control panel for finance configuration. Phase A wires the existing
 * Rate & Cost Pool editor as the working "Rate Pool" tab; the other 8 tabs
 * are registered with phase badges so admins see the full configuration
 * surface and the rollout sequence.
 *
 * Mounted under /admin/finance (admin-gated) AND /portal/finance (so the
 * plant sidebar route stays consistent — handled by App router).
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  ClipboardList,
  Coins,
  Globe,
  Layers,
  Recycle,
  Sparkles,
  Tag,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/hooks/use-workspace";
import AdminCostRates from "@/pages/AdminCostRates";
import AdminStandardBom from "@/pages/AdminStandardBom";
import AdminPowerTariff from "@/pages/AdminPowerTariff";
import AdminSellingPrices from "@/pages/AdminSellingPrices";
import AdminPeriodClose from "@/pages/AdminPeriodClose";

type TabSpec = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  live?: boolean;
  phase: "A" | "B" | "C" | "D";
};

const TABS: TabSpec[] = [
  {
    id: "rate_pool",
    label: "Rate & Cost Pool",
    icon: Coins,
    description: "Effective-dated cost rates per material — purchasing posts new rates, history is append-only.",
    live: true,
    phase: "A",
  },
  {
    id: "standard_bom",
    label: "Standard BOM",
    icon: Layers,
    description: "Standard recipe per grade — std qty per MT and std rate per material. Drives IDEAL cost.",
    live: true,
    phase: "B",
  },
  {
    id: "byproducts",
    label: "By-product Credits",
    icon: Recycle,
    description: "Sale rates for slag, dust, fines by effective period. Netted off gross cost per MT.",
    phase: "B",
  },
  {
    id: "power_tariff",
    label: "Power Tariff",
    icon: Zap,
    description: "Time-Of-Day tariff slabs, demand-charge rates and seasonal rates.",
    live: true,
    phase: "C",
  },
  {
    id: "selling_prices",
    label: "Selling Prices",
    icon: Tag,
    description: "Current selling price per grade — feeds the Profitability tab.",
    live: true,
    phase: "C",
  },
  {
    id: "budgets",
    label: "Budget Targets",
    icon: ClipboardList,
    description: "Monthly cost-per-MT and cost-element budgets (material, power, fixed).",
    phase: "D",
  },
  {
    id: "alert_rules",
    label: "Cost Alert Rules",
    icon: AlertTriangle,
    description: "Threshold rules per KPI (e.g. cost/MT > ₹95K) with severity levels.",
    phase: "D",
  },
  {
    id: "period_close",
    label: "Period Close",
    icon: Calendar,
    description: "Lock a month — writes an immutable snapshot. Subsequent reads serve from the snapshot.",
    live: true,
    phase: "C",
  },
  {
    id: "fx_currency",
    label: "FX & Currency",
    icon: Globe,
    description: "Foreign exchange rates applied to imported materials at consumption date.",
    phase: "D",
  },
];

const phaseBadgeVariant: Record<TabSpec["phase"], "default" | "secondary" | "outline"> = {
  A: "default",
  B: "secondary",
  C: "outline",
  D: "outline",
};

export default function AdminFinance() {
  const { activeProfitCenter } = useWorkspace();
  const [active, setActive] = useState<string>("rate_pool");

  const activeTab = useMemo(() => TABS.find((t) => t.id === active) ?? TABS[0], [active]);

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
              Phase C · power, prices & period close live
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
              if (t.id === "rate_pool") liveBody = <AdminCostRates />;
              else if (t.id === "standard_bom") liveBody = <AdminStandardBom />;
              else if (t.id === "power_tariff") liveBody = <AdminPowerTariff />;
              else if (t.id === "selling_prices") liveBody = <AdminSellingPrices />;
              else if (t.id === "period_close") liveBody = <AdminPeriodClose />;
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
                        Configuration surface is registered. The schema table backing this tab
                        is already deployed (Phase A). Editor UI lands in Phase {t.phase}.
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
