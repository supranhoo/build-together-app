/**
 * Sales & Export — Phase A page shell.
 *
 * Domestic/Export toggle in header drives a boolean filter on every tab.
 * 4 live tabs (Dashboard, Customers, Inquiries, Orders) and 8 scaffold
 * tabs (Production Allocation, Dispatch, Quality, Logistics, Billing,
 * Banking & LC [Export-only], Insights). Scaffolds either deep-link to
 * existing SSOT pages or note the upcoming phase.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  LayoutDashboard, Users, FileText, ShoppingCart, Factory, Truck,
  CheckCircle, Ship, FileCheck, CreditCard, BarChart2, ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/use-workspace";
import { DashboardTab } from "@/components/sales/DashboardTab";
import { CustomersTab } from "@/components/sales/CustomersTab";
import { InquiriesTab } from "@/components/sales/InquiriesTab";
import { OrdersTab } from "@/components/sales/OrdersTab";

type SalesView = "domestic" | "export";

export default function PortalSales() {
  const { activeProfitCenter } = useWorkspace();
  const [view, setView] = useState<SalesView>("domestic");
  const [tab, setTab] = useState("dashboard");

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardHeader><CardTitle>Sales & Export</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">Select a workspace first.</CardContent>
      </Card>
    );
  }

  const isExport = view === "export";
  const pcId = activeProfitCenter.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sales & Export</h1>
          <p className="text-sm text-muted-foreground">
            End-to-end sales cycle for {activeProfitCenter.name}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-muted p-1">
          <button
            onClick={() => setView("domestic")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === "domestic" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >Domestic</button>
          <button
            onClick={() => setView("export")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === "export" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >Export</button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="dashboard"><LayoutDashboard className="h-4 w-4 mr-1.5" />Dashboard</TabsTrigger>
          <TabsTrigger value="customers"><Users className="h-4 w-4 mr-1.5" />Customers</TabsTrigger>
          <TabsTrigger value="inquiries"><FileText className="h-4 w-4 mr-1.5" />Inquiries</TabsTrigger>
          <TabsTrigger value="orders"><ShoppingCart className="h-4 w-4 mr-1.5" />Orders</TabsTrigger>
          <TabsTrigger value="production"><Factory className="h-4 w-4 mr-1.5" />Production</TabsTrigger>
          <TabsTrigger value="dispatch"><Truck className="h-4 w-4 mr-1.5" />Dispatch</TabsTrigger>
          <TabsTrigger value="quality"><CheckCircle className="h-4 w-4 mr-1.5" />Quality</TabsTrigger>
          <TabsTrigger value="logistics"><Ship className="h-4 w-4 mr-1.5" />Logistics</TabsTrigger>
          <TabsTrigger value="invoices"><FileCheck className="h-4 w-4 mr-1.5" />Billing</TabsTrigger>
          {isExport && <TabsTrigger value="banking"><CreditCard className="h-4 w-4 mr-1.5" />Banking & LC</TabsTrigger>}
          <TabsTrigger value="reports"><BarChart2 className="h-4 w-4 mr-1.5" />Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><DashboardTab profitCenterId={pcId} isExport={isExport} onJumpTab={setTab} /></TabsContent>
        <TabsContent value="customers"><CustomersTab profitCenterId={pcId} isExport={isExport} /></TabsContent>
        <TabsContent value="inquiries"><InquiriesTab profitCenterId={pcId} isExport={isExport} /></TabsContent>
        <TabsContent value="orders"><OrdersTab profitCenterId={pcId} isExport={isExport} /></TabsContent>

        <TabsContent value="production"><DeepLinkScaffold
          title="Production Allocation"
          description="Allocate confirmed orders to furnace heats. Coming in Phase B — uses existing heat_logs as the supply pool."
          to="/portal/production" linkLabel="Open Production module" /></TabsContent>
        <TabsContent value="dispatch"><DeepLinkScaffold
          title="Dispatch"
          description="Dispatch clearances are managed in the Quality module (single source of truth)."
          to="/portal/quality" linkLabel="Open Dispatch Clearance" /></TabsContent>
        <TabsContent value="quality"><DeepLinkScaffold
          title="Pre-Dispatch Quality"
          description="FG inspections and quality compliance are owned by the Quality module."
          to="/portal/quality" linkLabel="Open Quality module" /></TabsContent>
        <TabsContent value="logistics"><PhaseScaffold phase="B" title="Logistics & Shipping"
          description="Vessel/container booking, BL tracking, document checklist." /></TabsContent>
        <TabsContent value="invoices"><PhaseScaffold phase="C" title="Billing & Documents"
          description="Commercial invoicing (multi-currency), packing list, doc package, payment receipts." /></TabsContent>
        {isExport && <TabsContent value="banking"><PhaseScaffold phase="D" title="Banking & LC"
          description="Letters of Credit, FX forwards, document negotiation." /></TabsContent>}
        <TabsContent value="reports"><PhaseScaffold phase="D" title="Insights"
          description="Management summary report, KPI matrix, period analytics." /></TabsContent>
      </Tabs>
    </div>
  );
}

function DeepLinkScaffold({ title, description, to, linkLabel }: {
  title: string; description: string; to: string; linkLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{title} <Badge variant="outline">SSOT</Badge></CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline"><Link to={to}>{linkLabel} <ExternalLink className="h-4 w-4 ml-2" /></Link></Button>
      </CardContent>
    </Card>
  );
}

function PhaseScaffold({ phase, title, description }: { phase: "B" | "C" | "D"; title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{title} <Badge>Phase {phase}</Badge></CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        This tab will be activated when Phase {phase} of the Sales & Export rollout ships.
      </CardContent>
    </Card>
  );
}
