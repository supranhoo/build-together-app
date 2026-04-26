/**
 * Maintenance Module — Phase A page shell.
 *
 * Mounts the 10 functional tabs against the active workspace. Pure layout —
 * all data flows through src/lib/maintenance.ts (RLS-enforced). Tab IDs are
 * also used by the Dashboard's KPI cards for click-through navigation.
 */
import { useState } from "react";
import {
  LayoutDashboard, Settings, Calendar, AlertTriangle, ClipboardList,
  Package, Clock, Activity, FileText, DollarSign,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/use-workspace";

import { MaintenanceDashboardTab } from "@/components/maintenance/DashboardTab";
import { EquipmentMasterTab } from "@/components/maintenance/EquipmentMasterTab";
import { PreventiveMaintenanceTab } from "@/components/maintenance/PreventiveMaintenanceTab";
import { BreakdownMaintenanceTab } from "@/components/maintenance/BreakdownMaintenanceTab";
import { WorkOrderTab } from "@/components/maintenance/WorkOrderTab";
import { SparePartsTab } from "@/components/maintenance/SparePartsTab";
import { DowntimeTrackingTab } from "@/components/maintenance/DowntimeTrackingTab";
import { ConditionMonitoringTab } from "@/components/maintenance/ConditionMonitoringTab";
import { SOPManagementTab } from "@/components/maintenance/SOPManagementTab";
import { CostTrackingTab } from "@/components/maintenance/CostTrackingTab";

export default function PortalMaintenance() {
  const { activeProfitCenter } = useWorkspace();
  const [tab, setTab] = useState("dashboard");

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardHeader><CardTitle>Maintenance</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">Select a workspace first.</CardContent>
      </Card>
    );
  }

  const pcId = activeProfitCenter.id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Maintenance Management</h1>
        <p className="text-sm text-muted-foreground">
          Equipment, preventive &amp; breakdown maintenance, work orders, condition monitoring and cost tracking
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto bg-muted/50 p-1">
          <TabsTrigger value="dashboard"><LayoutDashboard className="h-4 w-4 mr-1.5" />Dashboard</TabsTrigger>
          <TabsTrigger value="equipment"><Settings className="h-4 w-4 mr-1.5" />Equipment</TabsTrigger>
          <TabsTrigger value="preventive"><Calendar className="h-4 w-4 mr-1.5" />Preventive</TabsTrigger>
          <TabsTrigger value="breakdown"><AlertTriangle className="h-4 w-4 mr-1.5" />Breakdown</TabsTrigger>
          <TabsTrigger value="workorders"><ClipboardList className="h-4 w-4 mr-1.5" />Work Orders</TabsTrigger>
          <TabsTrigger value="spares"><Package className="h-4 w-4 mr-1.5" />Spare Parts</TabsTrigger>
          <TabsTrigger value="downtime"><Clock className="h-4 w-4 mr-1.5" />Downtime</TabsTrigger>
          <TabsTrigger value="condition"><Activity className="h-4 w-4 mr-1.5" />Condition</TabsTrigger>
          <TabsTrigger value="sops"><FileText className="h-4 w-4 mr-1.5" />SOPs</TabsTrigger>
          <TabsTrigger value="costs"><DollarSign className="h-4 w-4 mr-1.5" />Costs</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><MaintenanceDashboardTab profitCenterId={pcId} onJumpTab={setTab} /></TabsContent>
        <TabsContent value="equipment"><EquipmentMasterTab profitCenterId={pcId} /></TabsContent>
        <TabsContent value="preventive"><PreventiveMaintenanceTab profitCenterId={pcId} /></TabsContent>
        <TabsContent value="breakdown"><BreakdownMaintenanceTab profitCenterId={pcId} /></TabsContent>
        <TabsContent value="workorders"><WorkOrderTab profitCenterId={pcId} /></TabsContent>
        <TabsContent value="spares"><SparePartsTab profitCenterId={pcId} /></TabsContent>
        <TabsContent value="downtime"><DowntimeTrackingTab profitCenterId={pcId} /></TabsContent>
        <TabsContent value="condition"><ConditionMonitoringTab profitCenterId={pcId} /></TabsContent>
        <TabsContent value="sops"><SOPManagementTab profitCenterId={pcId} /></TabsContent>
        <TabsContent value="costs"><CostTrackingTab profitCenterId={pcId} /></TabsContent>
      </Tabs>
    </div>
  );
}
