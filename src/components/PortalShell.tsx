import { useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bell, ChevronRight, ClipboardList, Factory, FileBarChart2, LayoutDashboard, LogOut, Menu, Search, Settings2, ShieldCheck, Warehouse } from "lucide-react";
import { BFCLLogo } from "@/components/BFCLLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { cn } from "@/lib/utils";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useWorkspace } from "@/hooks/use-workspace";

const iconMap = {
  inventory: Warehouse,
  production: Factory,
  reports: FileBarChart2,
};

// Static (non-module) portal nav entries. Exported so the route-audit test can
// validate every link against the App router.
export const portalStaticNavItems = [
  { label: "Overview", to: "/portal" },
];

export function PortalShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { profile, logout } = useAuth();
  const { activeProfitCenter, modules, settings, isAdmin } = useWorkspace();
  const { theme } = useTheme();
  const logoTheme = theme === "dark" ? "dark" : "light";
  const location = useLocation();
  const navigate = useNavigate();

  const initials = useMemo(() => {
    const source = profile?.display_name?.trim() || "Plant User";
    return source
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }, [profile?.display_name]);

  const navItems = useMemo(
    () => [
      ...portalStaticNavItems.map((item) => ({ ...item, icon: LayoutDashboard })),
      ...modules.map((module) => ({
        label: module.navLabel,
        to: `/portal/${module.routeSegment}`,
        icon: iconMap[module.moduleKey as keyof typeof iconMap] ?? Factory,
      })),
    ],
    [modules],
  );

  const moduleLabelOverrides = useMemo(() => {
    const overrides: Record<string, string> = {};
    modules.forEach((m) => {
      overrides[m.routeSegment] = m.navLabel;
    });
    return overrides;
  }, [modules]);

  // Renders the navigation list. Used for both desktop sidebar and mobile sheet.
  const renderNav = (variant: "expanded" | "collapsed" | "mobile") => {
    const isCollapsed = variant === "collapsed";
    const onNavigate = variant === "mobile" ? () => setMobileNavOpen(false) : undefined;
    const linkClassName = cn(
      "flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-muted-foreground transition-colors",
      isCollapsed && "justify-center px-2",
    );

    return (
      <nav className="space-y-1">
        {navItems.map((item) => {
          const link = (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/portal"}
              className={linkClassName}
              activeClassName="bg-primary text-primary-foreground"
              onClick={onNavigate}
              aria-label={item.label}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span>{item.label}</span>}
            </NavLink>
          );
          if (!isCollapsed) return link;
          return (
            <Tooltip key={item.to} delayDuration={150}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
        {isAdmin && (
          isCollapsed ? (
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <NavLink
                  to="/admin"
                  className={linkClassName}
                  activeClassName="bg-primary text-primary-foreground"
                  onClick={onNavigate}
                  aria-label="Admin"
                >
                  <Settings2 className="h-5 w-5 shrink-0" />
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right">Admin</TooltipContent>
            </Tooltip>
          ) : (
            <NavLink
              to="/admin"
              className={linkClassName}
              activeClassName="bg-primary text-primary-foreground"
              onClick={onNavigate}
              aria-label="Admin"
            >
              <Settings2 className="h-5 w-5 shrink-0" />
              <span>Admin</span>
            </NavLink>
          )
        )}
      </nav>
    );
  };

  const workspaceCard = (collapsed: boolean) => (
    <div className="mb-6 rounded-md border border-sidebar-border bg-sidebar-accent/60 p-3">
      {collapsed ? (
        <ShieldCheck className="mx-auto text-primary" />
      ) : (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Active workspace</p>
          <p className="mt-2 text-sm font-medium">{activeProfitCenter?.name || "No workspace selected"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {activeProfitCenter?.processProfile || "Modules, naming, and processes are driven by configuration."}
          </p>
        </>
      )}
    </div>
  );

  const userFooter = (collapsed: boolean) => (
    <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">
        {initials}
      </div>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{profile?.display_name || "Plant User"}</p>
          <p className="truncate text-xs text-muted-foreground">{profile?.department || "Operations"} · {profile?.role}</p>
        </div>
      )}
      {!collapsed && (
        <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground" onClick={() => void logout()} aria-label="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

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
            <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => setSidebarOpen(false)} aria-label="Collapse sidebar">
              <Menu />
            </Button>
          )}
        </div>

        <div className="flex-1 px-3 py-5">
          {!sidebarOpen && (
            <Button variant="ghost" size="icon" className="mb-5 w-full text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => setSidebarOpen(true)} aria-label="Expand sidebar">
              <Menu />
            </Button>
          )}
          {workspaceCard(!sidebarOpen)}
          {renderNav(sidebarOpen ? "expanded" : "collapsed")}
        </div>

        <div className="border-t border-sidebar-border p-4">{userFooter(!sidebarOpen)}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
          <div className="flex h-20 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-4">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open navigation" aria-expanded={mobileNavOpen}>
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
                  <div className="flex h-20 items-center border-b border-sidebar-border px-5">
                    <BFCLLogo className="w-40" theme="dark" />
                  </div>
                  <div className="flex-1 overflow-y-auto px-3 py-5">
                    {workspaceCard(false)}
                    {renderNav("mobile")}
                  </div>
                  <div className="border-t border-sidebar-border p-4">{userFooter(false)}</div>
                </SheetContent>
              </Sheet>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">SteelFlow ERP</p>
                <Breadcrumbs
                  pathname={location.pathname}
                  labelOverrides={moduleLabelOverrides}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="hidden min-w-[260px] max-w-sm flex-1 md:block">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-11 border-border bg-panel pl-10 text-sm"
                  placeholder="Search (coming soon)"
                  disabled
                  aria-label="Global search (coming soon)"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {activeProfitCenter && (
                <span className="hidden rounded-md border border-border bg-panel px-3 py-1 text-xs text-muted-foreground xl:inline-flex xl:items-center xl:gap-1">
                  <span>Workspace</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="font-medium text-foreground">{activeProfitCenter.name}</span>
                </span>
              )}
              <Button
                variant="outline"
                className="hidden h-11 gap-2 md:inline-flex"
                onClick={() => navigate("/profit-centers")}
              >
                <ClipboardList className="h-4 w-4" /> Switch workspace
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="md:hidden"
                onClick={() => navigate("/profit-centers")}
                aria-label="Switch workspace"
              >
                <ClipboardList className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="relative h-11 w-11 rounded-full border border-border bg-panel" aria-label="Notifications">
                <Bell className="h-5 w-5" />
                <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-accent" />
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet context={{ settings }} />
        </main>
      </div>
    </div>
  );
}
