import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
import { WorkspaceProvider } from "@/hooks/use-workspace";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RequireWorkspace } from "@/components/RequireWorkspace";
import { RequireAdmin } from "@/components/RequireAdmin";
import { PortalShell } from "@/components/PortalShell";
import { AdminShell } from "@/components/AdminShell";
import Index from "./pages/Index";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import ProfitCenterSelector from "./pages/ProfitCenterSelector";
import PortalOverview from "./pages/PortalOverview";
import PortalCommandDeck from "./pages/PortalCommandDeck";
import AdminOverview from "./pages/AdminOverview";
import AdminWorkspaces from "./pages/AdminWorkspaces";
import AdminModules from "./pages/AdminModules";
import AdminAccess from "./pages/AdminAccess";
import AdminSettings from "./pages/AdminSettings";
import AdminAudit from "./pages/AdminAudit";
import AdminFurnaces from "./pages/AdminFurnaces";
import AdminShifts from "./pages/AdminShifts";
import AdminRoles from "./pages/AdminRoles";
import AdminMaterials from "./pages/AdminMaterials";
import AdminStockLocations from "./pages/AdminStockLocations";
import AdminKpis from "./pages/AdminKpis";
import AdminReportDeliveries from "./pages/AdminReportDeliveries";
import AdminProcurement from "./pages/AdminProcurement";
import AdminQuality from "./pages/AdminQuality";
import AdminFinance from "./pages/AdminFinance";
import PortalFinance from "./pages/PortalFinance";
import PortalSales from "./pages/PortalSales";
import PortalMaintenance from "./pages/PortalMaintenance";
import ModulePlaceholder from "./pages/ModulePlaceholder";
import PortalProduction from "./pages/PortalProduction";
import PortalProductionFAD from "./pages/PortalProductionFAD";
import PortalInventory from "./pages/PortalInventory";
import PortalInventoryDashboard from "./pages/PortalInventoryDashboard";
import PortalInventoryStock from "./pages/PortalInventoryStock";
import PortalInventoryReceipts from "./pages/PortalInventoryReceipts";
import PortalInventoryGrn from "./pages/PortalInventoryGrn";
import PortalInventoryIssue from "./pages/PortalInventoryIssue";
import PortalInventoryTransfers from "./pages/PortalInventoryTransfers";
import PortalInventoryMinMax from "./pages/PortalInventoryMinMax";
import PortalInventoryReports from "./pages/PortalInventoryReports";
import PortalInventoryLedger from "./pages/PortalInventoryLedger";
import PortalCosting from "./pages/PortalCosting";
import PortalReports from "./pages/PortalReports";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <AuthProvider>
          <WorkspaceProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/profit-centers" element={<ProfitCenterSelector />} />
                <Route element={<RequireWorkspace />}>
                  <Route path="/portal" element={<PortalShell />}>
                    <Route index element={<PortalOverview />} />
                    <Route path="command-deck" element={<PortalCommandDeck />} />
                    <Route path="production" element={<PortalProduction />} />
                    <Route path="production-fad" element={<PortalProductionFAD />} />
                    <Route path="inventory" element={<PortalInventory />}>
                      <Route index element={<PortalInventoryDashboard />} />
                      <Route path="stock" element={<PortalInventoryStock />} />
                      <Route path="grn" element={<PortalInventoryGrn />} />
                      <Route path="receipts" element={<PortalInventoryReceipts />} />
                      <Route path="issue" element={<PortalInventoryIssue />} />
                      <Route path="transfers" element={<PortalInventoryTransfers />} />
                      <Route path="min-max" element={<PortalInventoryMinMax />} />
                      <Route path="reports" element={<PortalInventoryReports />} />
                      <Route path="ledger" element={<PortalInventoryLedger />} />
                    </Route>
                    <Route path="costing" element={<PortalCosting />} />
                    <Route path="reports" element={<PortalReports />} />
                    {/* Procurement & Quality are rendered inside the Portal
                        shell so the plant module sidebar stays visible. The
                        same components (SSOT) are also mounted under /admin
                        for Control Panel access. */}
                    <Route path="procurement" element={<AdminProcurement />} />
                    <Route path="quality" element={<AdminQuality />} />
                    <Route path="finance" element={<PortalFinance />} />
                    <Route path="sales" element={<PortalSales />} />
                    <Route path="maintenance" element={<PortalMaintenance />} />
                    <Route path=":module" element={<ModulePlaceholder />} />
                  </Route>
                </Route>
                <Route element={<RequireAdmin />}>
                  <Route path="/admin" element={<AdminShell />}>
                    <Route index element={<AdminOverview />} />
                    <Route path="settings" element={<AdminSettings />} />
                    <Route path="procurement" element={<AdminProcurement />} />
                    <Route path="quality" element={<AdminQuality />} />
                    <Route path="finance" element={<AdminFinance />} />
                    {/* Legacy admin routes — consolidated under Admin Settings tabs. */}
                    <Route path="workspaces" element={<Navigate to="/admin/settings?tab=workspaces" replace />} />
                    <Route path="modules" element={<Navigate to="/admin/settings?tab=modules" replace />} />
                    <Route path="access" element={<Navigate to="/admin/settings?tab=access" replace />} />
                    <Route path="audit" element={<Navigate to="/admin/settings?tab=audit" replace />} />
                    <Route path="furnaces" element={<Navigate to="/admin/settings?tab=furnaces" replace />} />
                    <Route path="shifts" element={<Navigate to="/admin/settings?tab=shifts" replace />} />
                    <Route path="materials" element={<Navigate to="/admin/settings?tab=materials" replace />} />
                    <Route path="stock-locations" element={<Navigate to="/admin/settings?tab=stock-locations" replace />} />
                    <Route path="kpis" element={<Navigate to="/admin/settings?tab=kpis" replace />} />
                    <Route path="report-deliveries" element={<Navigate to="/admin/settings?tab=report-deliveries" replace />} />
                    <Route path="roles" element={<Navigate to="/admin/settings?tab=roles" replace />} />
                    <Route path="users" element={<Navigate to="/admin/settings?tab=users" replace />} />
                  </Route>
                </Route>
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </WorkspaceProvider>
      </AuthProvider>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
