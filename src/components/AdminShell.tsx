import { useState } from "react";
import { Calculator, Cog, FlaskConical, LayoutDashboard, LogOut, Menu, ShoppingCart } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";
import { BFCLLogo } from "@/components/BFCLLogo";
import { NavLink } from "@/components/NavLink";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

export const adminNavItems = [
  { label: "Overview", to: "/admin", icon: LayoutDashboard },
  { label: "Admin Settings", to: "/admin/settings", icon: Cog },
  { label: "Procurement", to: "/admin/procurement", icon: ShoppingCart },
  { label: "Quality Control", to: "/admin/quality", icon: FlaskConical },
  { label: "Finance & Costing", to: "/admin/finance", icon: Calculator },
];

export function AdminShell() {
  const location = useLocation();
  const { logout } = useAuth();
  const { activeProfitCenter, isSuperAdmin } = useWorkspace();
  const { theme } = useTheme();
  const logoTheme = theme === "dark" ? "dark" : "light";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const renderSidebarBody = (onNavigate?: () => void) => (
    <>
      <div className="flex items-center justify-between border-b border-sidebar-border px-5 py-5">
        <BFCLLogo className="w-36" theme={logoTheme} />
        <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => void logout()} aria-label="Sign out">
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
              onClick={onNavigate}
              aria-label={item.label}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden border-sidebar-border bg-sidebar text-sidebar-foreground lg:block lg:min-h-screen lg:border-r">
        {renderSidebarBody()}
      </aside>

      <div className="min-w-0">
        <header className="border-b border-border bg-background/95 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open admin navigation" aria-expanded={mobileNavOpen}>
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
                  <div onClick={() => setMobileNavOpen(false)}>
                    {renderSidebarBody(() => setMobileNavOpen(false))}
                  </div>
                </SheetContent>
              </Sheet>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Configuration-first administration</p>
                <h1 className="mt-2 text-3xl">{adminNavItems.find((item) => item.to === location.pathname)?.label || "Admin"}</h1>
                <Breadcrumbs pathname={location.pathname} className="mt-2" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button asChild variant="outline">
                <NavLink to="/portal" className={cn("inline-flex items-center gap-2")}>Return to portal</NavLink>
              </Button>
            </div>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
