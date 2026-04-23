import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useWorkspace } from "@/hooks/use-workspace";

export function RequireWorkspace() {
  const location = useLocation();
  const { loading, assignments, activeProfitCenter } = useWorkspace();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading workspace configuration…</p>
        </div>
      </div>
    );
  }

  if (assignments.length === 0 || !activeProfitCenter) {
    return <Navigate to="/profit-centers" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
