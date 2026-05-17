import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AdminMasterItems from "./AdminMasterItems";
import AdminItemCatalogue from "./AdminItemCatalogue";
import AdminMaterialGroups from "./AdminMaterialGroups";
import AdminSpecTemplates from "./AdminSpecTemplates";
import AdminFurnaces from "./AdminFurnaces";
import AdminKilns from "./AdminKilns";
import AdminSmsFurnaces from "./AdminSmsFurnaces";
import { resolveProcessProfile } from "@/lib/workspace-profiles";
import AdminCostRates from "./AdminCostRates";
import AdminUomConversions from "./AdminUomConversions";
import AdminStockLocations from "./AdminStockLocations";
import AdminKpis from "./AdminKpis";
import AdminItemProperties from "./AdminItemProperties";
import AdminPickerContexts from "./AdminPickerContexts";
import AdminTestData from "./AdminTestData";
import { useWorkspace } from "@/hooks/use-workspace";

/**
 * Master Data — single SSOT host for workspace-scoped reference data.
 * Each sub-tab is the existing or new admin page; nothing is duplicated.
 */
export const MASTER_DATA_TABS = [
  { key: "items", label: "Item Master", Component: AdminMasterItems },
  { key: "catalogue", label: "Item Catalogue", Component: AdminItemCatalogue },
  { key: "groups", label: "Group & Hierarchy", Component: AdminMaterialGroups },
  { key: "properties", label: "Properties & Mapping", Component: AdminItemProperties },
  { key: "pickers", label: "Picker Contexts", Component: AdminPickerContexts },
  { key: "specs", label: "Specifications", Component: AdminSpecTemplates },
  { key: "furnaces", label: "Furnace / Machine", Component: AdminFurnaces },
  { key: "kilns", label: "Kilns (DRI)", Component: AdminKilns, profiles: ["dri"] as const },
  { key: "sms-furnaces", label: "SMS Furnaces", Component: AdminSmsFurnaces, profiles: ["steel_melting"] as const },
  { key: "cost-rates", label: "Rate & Cost Pool", Component: AdminCostRates },
  { key: "uom", label: "UOM & Conversion", Component: AdminUomConversions },
  { key: "locations", label: "Location & Warehouse", Component: AdminStockLocations },
  { key: "kpis", label: "Master KPIs", Component: AdminKpis },
  { key: "test-data", label: "Test Data", Component: AdminTestData, adminOnly: true },
] as const;

export type MasterDataTabKey = (typeof MASTER_DATA_TABS)[number]["key"];

export function resolveMasterDataTab(raw: string | null | undefined): MasterDataTabKey {
  const valid = MASTER_DATA_TABS.map((t) => t.key);
  return (valid as readonly string[]).includes(raw ?? "")
    ? (raw as MasterDataTabKey)
    : MASTER_DATA_TABS[0].key;
}

export default function AdminMasterData() {
  const [params, setParams] = useSearchParams();
  const { isAdmin, activeProfitCenter } = useWorkspace();
  const profile = resolveProcessProfile(activeProfitCenter?.processProfile);
  const visibleTabs = useMemo(
    () => MASTER_DATA_TABS.filter((t) => {
      if ("adminOnly" in t && t.adminOnly && !isAdmin) return false;
      if ("profiles" in t && t.profiles && !(t.profiles as readonly string[]).includes(profile)) return false;
      return true;
    }),
    [isAdmin, profile],
  );
  const active = useMemo(() => {
    const raw = params.get("md");
    const valid = visibleTabs.map((t) => t.key);
    return (valid as readonly string[]).includes(raw ?? "") ? (raw as MasterDataTabKey) : visibleTabs[0].key;
  }, [params, visibleTabs]);

  const handleChange = (next: string) => {
    setParams((current) => {
      const updated = new URLSearchParams(current);
      updated.set("tab", "master-data");
      updated.set("md", next);
      return updated;
    }, { replace: true });
  };

  return (
    <Tabs value={active} onValueChange={handleChange} className="space-y-4">
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
        {visibleTabs.map((tab) => (
          <TabsTrigger key={tab.key} value={tab.key} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {visibleTabs.map(({ key, Component }) => (
        <TabsContent key={key} value={key} className="mt-2">
          <Component />
        </TabsContent>
      ))}
    </Tabs>
  );
}
