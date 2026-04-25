import { useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/use-workspace";

/**
 * Inventory shell — 7 tabs (Dashboard, Stock Ledger, GRN, Issue, Transfers,
 * Min-Max, Reports). Each tab is a nested route. Default index renders the
 * Dashboard. Existing `/portal/inventory/receipts` and `/ledger` paths still
 * work for backwards compatibility.
 */
const TABS: Array<{ value: string; label: string; path: string }> = [
  { value: "dashboard", label: "Dashboard", path: "/portal/inventory" },
  { value: "stock", label: "Stock Ledger", path: "/portal/inventory/stock" },
  { value: "grn", label: "GRN (Inward)", path: "/portal/inventory/grn" },
  { value: "issue", label: "Issue (Outward)", path: "/portal/inventory/issue" },
  { value: "transfers", label: "Transfers", path: "/portal/inventory/transfers" },
  { value: "min-max", label: "Min-Max", path: "/portal/inventory/min-max" },
  { value: "reports", label: "Reports", path: "/portal/inventory/reports" },
];

export default function PortalInventory() {
  const { activeProfitCenter } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = useMemo(() => {
    const exact = TABS.find((t) => t.path === location.pathname);
    if (exact) return exact.value;
    // Map legacy routes back to the closest tab so the strip still highlights.
    if (location.pathname.endsWith("/receipts")) return "grn";
    if (location.pathname.endsWith("/ledger")) return "stock";
    return "dashboard";
  }, [location.pathname]);

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardHeader><CardTitle>Inventory</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">Select a workspace to view inventory.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          const next = TABS.find((t) => t.value === value);
          if (next) navigate(next.path);
        }}
      >
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Outlet />
    </div>
  );
}
