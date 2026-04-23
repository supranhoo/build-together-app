import { ClipboardList, Cog, LayoutDashboard, LogOut, Map, ScrollText, ShieldCheck } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import { BFCLLogo } from "@/components/BFCLLogo";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

const adminNavItems = [
  { label: "Overview", to: "/admin", icon: LayoutDashboard },
  { label: "Workspaces", to: "/admin/workspaces", icon: Map },
  { label: "Modules", to: "/admin/modules", icon: ClipboardList },
  { label: "Access", to: "/admin/access", icon: ShieldCheck },
  { label: "Settings", to: "/admin/settings", icon: Cog },
  { label: "Audit", to: "/admin/audit", icon: ScrollText },
];

export function AdminShell() {
  const location = useLocation();
  const { logout } = useAuth();
  const { activeProfitCenter, isSuperAdmin } = useWorkspace();

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="border-b border-sidebar-border bg-sidebar text-sidebar-foreground lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between border-b border-sidebar-border px-5 py-5">
          <BFCLLogo className="w-36" theme="dark" />
          <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => void logout()}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        <div className="px-3 py-5">
          <div className="mb-6 rounded-md border border-sidebar-border bg-sidebar-accent/60 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Admin control</p>
            <p className="mt-2 text-sm font-medium">{isSuperAdmin ? "Global architecture access" : "Scoped configuration access"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeProfitCenter ? `Current workspace: ${activeProfitCenter.name}` : "No workspace selected; global controls remain available."}
            </p>
          </div>
          <nav className="space-y-1">
            {adminNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/admin"}
                className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-muted-foreground transition-colors"
                activeClassName="bg-primary text-primary-foreground"
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-b border-border bg-background/95 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6 lg:px-8">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Configuration-first administration</p>
              <h1 className="mt-2 text-3xl">{adminNavItems.find((item) => item.to === location.pathname)?.label || "Admin"}</h1>
            </div>
            <Button asChild variant="outline">
              <NavLink to="/portal" className={cn("inline-flex items-center gap-2")}>Return to portal</NavLink>
            </Button>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
