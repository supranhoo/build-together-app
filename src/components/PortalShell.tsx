import { useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import {
  Bell,
  ChevronRight,
  ClipboardList,
  Factory,
  FileBarChart2,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Warehouse,
} from "lucide-react";
import { BFCLLogo } from "@/components/BFCLLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  { label: "Overview", icon: LayoutDashboard, to: "/portal" },
  { label: "Inventory", icon: Warehouse, to: "/portal/inventory" },
  { label: "Production", icon: Factory, to: "/portal/production" },
  { label: "Reports", icon: FileBarChart2, to: "/portal/reports" },
];

export function PortalShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { profile, logout } = useAuth();
  const location = useLocation();

  const initials = useMemo(() => {
    const source = profile?.display_name?.trim() || "Plant User";
    return source
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }, [profile?.display_name]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside
        className={cn(
          "hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex lg:flex-col",
          sidebarOpen ? "lg:w-72" : "lg:w-24",
        )}
      >
        <div className="flex h-20 items-center justify-between border-b border-sidebar-border px-5">
          <BFCLLogo className={cn("transition-all", sidebarOpen ? "w-40" : "w-10")} theme="dark" iconOnly={!sidebarOpen} />
          {sidebarOpen && (
            <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => setSidebarOpen(false)}>
              <Menu />
            </Button>
          )}
        </div>

        <div className="flex-1 px-3 py-5">
          {!sidebarOpen && (
            <Button variant="ghost" size="icon" className="mb-5 w-full text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => setSidebarOpen(true)}>
              <Menu />
            </Button>
          )}

          <div className="mb-6 rounded-md border border-sidebar-border bg-sidebar-accent/60 p-3">
            {sidebarOpen ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Portal mode</p>
                <p className="mt-2 text-sm font-medium">Employee access active</p>
                <p className="mt-1 text-xs text-muted-foreground">Inventory, production, and reporting workspaces are prepared for rollout.</p>
              </>
            ) : (
              <ShieldCheck className="mx-auto text-primary" />
            )}
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/portal"}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-muted-foreground transition-colors",
                  !sidebarOpen && "justify-center px-2",
                )}
                activeClassName="bg-primary text-primary-foreground"
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {sidebarOpen && <span>{item.label}</span>}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="border-t border-sidebar-border p-4">
          <div className={cn("flex items-center gap-3", !sidebarOpen && "justify-center")}>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">
              {initials}
            </div>
            {sidebarOpen && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{profile?.display_name || "Plant User"}</p>
                <p className="truncate text-xs text-muted-foreground">{profile?.department || "Operations"} · {profile?.role}</p>
              </div>
            )}
            {sidebarOpen && (
              <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground" onClick={() => void logout()}>
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
          <div className="flex h-20 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" className="lg:hidden" onClick={() => setSidebarOpen((open) => !open)}>
                <Menu className="h-5 w-5" />
              </Button>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">SteelFlow ERP</p>
                <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{location.pathname === "/portal" ? "Overview" : navItems.find((item) => item.to === location.pathname)?.label || "Module"}</span>
                  <ChevronRight className="h-4 w-4" />
                  <span>Plant operations</span>
                </div>
              </div>
            </div>

            <div className="hidden min-w-[260px] max-w-sm flex-1 md:block">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-11 border-border bg-panel pl-10 text-sm" placeholder="Search heat logs, inventory, reports" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" className="hidden h-11 gap-2 md:inline-flex">
                <ClipboardList className="h-4 w-4" /> Shift log
              </Button>
              <Button variant="ghost" size="icon" className="relative h-11 w-11 rounded-full border border-border bg-panel">
                <Bell className="h-5 w-5" />
                <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-accent" />
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
