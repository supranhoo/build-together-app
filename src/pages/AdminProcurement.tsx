/**
 * Procurement (Phase A — shell only).
 *
 * 16-tab control panel surface. Per Phase A scope:
 *  - 8 tabs deep-link to existing single-source-of-truth pages
 *    (RM Master, MIN-MAX, GRN, Inventory, Reports, KPIs, Quality, Cost).
 *  - 8 new tabs (Dashboard, Suppliers, MRP, PR, PO, Shipments,
 *    Supplier Performance, Risk) render scaffolds and will become
 *    functional in Phases B/C/D per .lovable plan.
 *
 * Hard rules followed:
 *  - Uses semantic tokens only (no bg-white / text-slate-* hardcoding).
 *  - Uses shadcn Tabs + Card primitives; no native prompt() entry.
 *  - Workspace-scoped via useWorkspace (no manual profit_center props).
 *  - Admin-gated by the /admin route's RequireAdmin wrapper.
 */
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart2,
  Calculator,
  CheckCircle,
  ClipboardCheck,
  Database,
  DollarSign,
  ExternalLink,
  FileText,
  LayoutDashboard,
  Package,
  PieChart,
  ShieldAlert,
  Ship,
  ShoppingCart,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/use-workspace";
import { SuppliersTab } from "@/components/procurement/SuppliersTab";
import { PRTab } from "@/components/procurement/PRTab";
import { POTab } from "@/components/procurement/POTab";
import { MRPTab } from "@/components/procurement/MRPTab";
import { ShipmentsTab } from "@/components/procurement/ShipmentsTab";

type DeepLinkTarget = { to: string; label: string };
type TabSpec =
  | { id: string; label: string; icon: React.ComponentType<{ className?: string }>; kind: "scaffold"; description: string; phase: "B" | "C" | "D" }
  | { id: string; label: string; icon: React.ComponentType<{ className?: string }>; kind: "deeplink"; description: string; target: DeepLinkTarget }
  | { id: string; label: string; icon: React.ComponentType<{ className?: string }>; kind: "live"; description: string; render: () => JSX.Element };

const TABS: TabSpec[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, kind: "scaffold", phase: "D",
    description: "KPIs across PRs, POs, shipments, supplier performance and risk events." },
  { id: "rm_master", label: "RM Master", icon: Database, kind: "deeplink",
    description: "Raw material master is managed in Admin → Materials. Single source of truth.",
    target: { to: "/admin/settings?tab=materials", label: "Open Materials master" } },
  { id: "min_max", label: "MIN-MAX Control", icon: AlertTriangle, kind: "deeplink",
    description: "MIN / MAX / Reorder thresholds live on each material and surface in the inventory module.",
    target: { to: "/portal/inventory/min-max", label: "Open MIN-MAX dashboard" } },
  { id: "mrp", label: "MRP", icon: Calculator, kind: "live",
    description: "Material Requirements Planning — shortages from on-hand + open POs against thresholds.",
    render: () => <MRPTab /> },
  { id: "suppliers", label: "Suppliers", icon: Users, kind: "live",
    description: "Vendor directory: contacts, payment terms, lead time, preferred status.",
    render: () => <SuppliersTab /> },
  { id: "pr", label: "Purchase Requisitions", icon: FileText, kind: "live",
    description: "Internal material requests. Draft → Submitted → Approved → Converted to PO.",
    render: () => <PRTab /> },
  { id: "po", label: "Purchase Orders", icon: ShoppingCart, kind: "live",
    description: "Supplier orders with multi-currency value, expected delivery and receipt tracking.",
    render: () => <POTab /> },
  { id: "shipments", label: "Import Shipments", icon: Ship, kind: "live",
    description: "International transit: vessel, BL, ETA, customs and freight cost.",
    render: () => <ShipmentsTab /> },
  { id: "grn", label: "GRN", icon: ClipboardCheck, kind: "deeplink",
    description: "Goods Receipt Notes are recorded in the inventory module and post directly to the ledger.",
    target: { to: "/portal/inventory/grn", label: "Open GRN entry" } },
  { id: "quality", label: "Quality Inspection", icon: CheckCircle, kind: "deeplink",
    description: "Incoming quality (Mn %, Fe %, moisture %) is captured on each GRN.",
    target: { to: "/portal/inventory/grn", label: "Open GRN with quality fields" } },
  { id: "inventory", label: "Inventory Update", icon: Package, kind: "deeplink",
    description: "Live stock by location is in the inventory module. Procurement consumes — does not duplicate.",
    target: { to: "/portal/inventory/stock", label: "Open stock view" } },
  { id: "supplier_perf", label: "Supplier Performance", icon: TrendingUp, kind: "scaffold", phase: "D",
    description: "Periodic scorecards: on-time %, quality %, price competitiveness, overall score." },
  { id: "cost", label: "Cost Monitoring", icon: DollarSign, kind: "deeplink",
    description: "Cost rates and price trends are managed in Admin → Cost Rates. Procurement reads against them.",
    target: { to: "/admin/settings?tab=cost-rates", label: "Open Cost Rates" } },
  { id: "risk", label: "Risk Monitoring", icon: ShieldAlert, kind: "scaffold", phase: "D",
    description: "Supply-chain risk register: severity, status, mitigation plan, optional supplier link." },
  { id: "reports", label: "Reports", icon: BarChart2, kind: "deeplink",
    description: "Cross-module reporting lives in the central reports surface.",
    target: { to: "/portal/reports", label: "Open reports" } },
  { id: "kpis", label: "KPIs", icon: PieChart, kind: "deeplink",
    description: "KPI definitions and pins are managed centrally. Procurement KPIs will be seeded as part of Phase D.",
    target: { to: "/admin/settings?tab=kpis", label: "Open KPI definitions" } },
];

export default function AdminProcurement() {
  const { activeProfitCenter } = useWorkspace();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Procurement Management</h2>
          <p className="text-sm text-muted-foreground">
            {activeProfitCenter
              ? <>Workspace: <span className="font-medium text-foreground">{activeProfitCenter.name}</span></>
              : "Select a workspace to scope procurement data."}
          </p>
        </div>
        <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
          Phase C live · Suppliers · PR · PO · MRP · Shipments · Receipts → Phase D: Performance, Risk, Dashboard
        </Badge>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-muted p-1">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="gap-2 whitespace-nowrap data-[state=active]:bg-background">
              <t.icon className="h-4 w-4" />
              <span className="text-xs font-medium">{t.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent key={t.id} value={t.id} className="space-y-4">
            {t.kind === "live" ? (
              t.render()
            ) : (
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      <t.icon className="h-5 w-5 text-primary" />
                      {t.label}
                    </CardTitle>
                    <CardDescription>{t.description}</CardDescription>
                  </div>
                  {t.kind === "deeplink" && (
                    <Button onClick={() => navigate(t.target.to)} variant="outline" className="gap-2">
                      <ExternalLink className="h-4 w-4" /> {t.target.label}
                    </Button>
                  )}
                  {t.kind === "scaffold" && (
                    <Badge variant="secondary">Activates in Phase {t.phase}</Badge>
                  )}
                </CardHeader>
                <CardContent>
                  {t.kind === "deeplink" ? (
                    <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
                      This screen lives in another module to keep a single source of truth.
                      The button above opens the existing page; data shown there is shared with Procurement.
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
                      Schema, RLS, audit triggers and permission grants for this tab are live in the database.
                      The interactive UI is delivered in Phase {t.phase}.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
