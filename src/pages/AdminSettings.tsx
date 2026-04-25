import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AdminWorkspaces from "./AdminWorkspaces";
import AdminModules from "./AdminModules";
import AdminAccess from "./AdminAccess";
import AdminRawSettings from "./AdminRawSettings";
import AdminFurnaces from "./AdminFurnaces";
import AdminShifts from "./AdminShifts";
import AdminMaterials from "./AdminMaterials";
import AdminStockLocations from "./AdminStockLocations";
import AdminKpis from "./AdminKpis";
import AdminReportDeliveries from "./AdminReportDeliveries";
import AdminRoles from "./AdminRoles";
import AdminAudit from "./AdminAudit";
import AdminUsers from "./AdminUsers";
import AdminMasterData from "./AdminMasterData";

/**
 * Admin Settings tabs — single entry point that hosts every administrative
 * configuration section. Each tab simply renders the existing page component
 * unchanged, so business logic, RLS, and audit behavior are preserved.
 */
export const ADMIN_SETTINGS_TABS = [
  { key: "workspaces", label: "Profit Centers", Component: AdminWorkspaces },
  { key: "modules", label: "Modules", Component: AdminModules },
  { key: "users", label: "Users", Component: AdminUsers },
  { key: "master-data", label: "Master Data", Component: AdminMasterData },
  { key: "access", label: "Access", Component: AdminAccess },
  { key: "settings", label: "Settings", Component: AdminRawSettings },
  { key: "furnaces", label: "Furnaces", Component: AdminFurnaces },
  { key: "shifts", label: "Shifts", Component: AdminShifts },
  { key: "materials", label: "Materials", Component: AdminMaterials },
  { key: "stock-locations", label: "Stock Locations", Component: AdminStockLocations },
  { key: "kpis", label: "KPIs", Component: AdminKpis },
  { key: "report-deliveries", label: "Report Deliveries", Component: AdminReportDeliveries },
  { key: "roles", label: "Roles & Permissions", Component: AdminRoles },
  { key: "audit", label: "Audit", Component: AdminAudit },
] as const;

export type AdminSettingsTabKey = (typeof ADMIN_SETTINGS_TABS)[number]["key"];

/** Pure helper — exported for unit tests. Falls back to the first tab when invalid. */
export function resolveAdminSettingsTab(raw: string | null | undefined): AdminSettingsTabKey {
  const valid = ADMIN_SETTINGS_TABS.map((t) => t.key);
  return (valid as readonly string[]).includes(raw ?? "")
    ? (raw as AdminSettingsTabKey)
    : ADMIN_SETTINGS_TABS[0].key;
}

export default function AdminSettings() {
  const [params, setParams] = useSearchParams();
  const active = useMemo(() => resolveAdminSettingsTab(params.get("tab")), [params]);

  const handleChange = (next: string) => {
    setParams((current) => {
      const updated = new URLSearchParams(current);
      updated.set("tab", next);
      return updated;
    }, { replace: true });
  };

  return (
    <Tabs value={active} onValueChange={handleChange} className="space-y-6">
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
        {ADMIN_SETTINGS_TABS.map((tab) => (
          <TabsTrigger key={tab.key} value={tab.key} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {ADMIN_SETTINGS_TABS.map(({ key, Component }) => (
        <TabsContent key={key} value={key} className="mt-4">
          <Component />
        </TabsContent>
      ))}
    </Tabs>
  );
}
