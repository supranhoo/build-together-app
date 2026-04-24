import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
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
import ModulePlaceholder from "./pages/ModulePlaceholder";
import PortalProduction from "./pages/PortalProduction";
import PortalInventory from "./pages/PortalInventory";
import PortalInventoryReceipts from "./pages/PortalInventoryReceipts";
import PortalInventoryLedger from "./pages/PortalInventoryLedger";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
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
                    <Route path="production" element={<PortalProduction />} />
                    <Route path="inventory" element={<PortalInventory />}>
                      <Route path="receipts" element={<PortalInventoryReceipts />} />
                      <Route path="ledger" element={<PortalInventoryLedger />} />
                    </Route>
                    <Route path=":module" element={<ModulePlaceholder />} />
                  </Route>
                </Route>
                <Route element={<RequireAdmin />}>
                  <Route path="/admin" element={<AdminShell />}>
                    <Route index element={<AdminOverview />} />
                    <Route path="workspaces" element={<AdminWorkspaces />} />
                    <Route path="modules" element={<AdminModules />} />
                    <Route path="access" element={<AdminAccess />} />
                    <Route path="settings" element={<AdminSettings />} />
                    <Route path="audit" element={<AdminAudit />} />
                    <Route path="furnaces" element={<AdminFurnaces />} />
                    <Route path="shifts" element={<AdminShifts />} />
                    <Route path="materials" element={<AdminMaterials />} />
                    <Route path="stock-locations" element={<AdminStockLocations />} />
                    <Route path="roles" element={<AdminRoles />} />
                  </Route>
                </Route>
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </WorkspaceProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
