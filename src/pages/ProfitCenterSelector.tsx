import { ArrowRight, Building2, Factory, LogOut, MapPin } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { BFCLLogo } from "@/components/BFCLLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

function getWorkspaceTarget(routeSegment?: string) {
  return routeSegment ? `/portal/${routeSegment}` : "/portal";
}

export default function ProfitCenterSelector() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const {
    loading,
    assignments,
    selectableProfitCenters,
    activeProfitCenterId,
    defaultModule,
    selectProfitCenter,
    isSuperAdmin,
  } = useWorkspace();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Preparing your workspace options…</p>
        </div>
      </div>
    );
  }

  if (assignments.length === 1 && activeProfitCenterId) {
    return <Navigate to={getWorkspaceTarget(defaultModule?.routeSegment)} replace />;
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
          <div className="space-y-4">
            <BFCLLogo className="w-44" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Workspace selector</p>
              <h1 className="mt-3 text-4xl">Choose your operating workspace</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Access is assigned by administrators. Each workspace can expose different modules, naming, and process settings.
              </p>
            </div>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => void logout()}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </header>

        <div className="grid flex-1 gap-6 py-8 xl:grid-cols-[1.4fr_0.8fr]">
          <section className="space-y-4">
            {assignments.length === 0 ? (
              <Card className="border-border bg-card shadow-panel">
                <CardHeader>
                  <CardTitle>No workspace assigned</CardTitle>
                  <CardDescription>
                    Your account is active, but no plant workspace has been assigned yet. Contact your administrator to continue.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {assignments.map((assignment) => {
                  const isActive = assignment.profitCenterId === activeProfitCenterId;

                  return (
                    <button
                      key={assignment.id}
                      type="button"
                      onClick={() => selectProfitCenter(assignment.profitCenterId)}
                      className={cn(
                        "rounded-md border text-left transition-colors",
                        isActive ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/50 hover:bg-panel",
                      )}
                    >
                      <Card className="h-full border-0 bg-transparent shadow-none">
                        <CardHeader className="space-y-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="rounded-md bg-primary/12 p-3 text-primary">
                              <Factory className="h-5 w-5" />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {assignment.isDefault && <Badge>Default</Badge>}
                              <Badge variant="outline">{assignment.profitCenter.code}</Badge>
                            </div>
                          </div>
                          <div>
                            <CardTitle className="text-2xl">{assignment.profitCenter.name}</CardTitle>
                            <CardDescription className="mt-2 leading-6">
                              {assignment.profitCenter.description || "Configurable workspace for plant operations and reporting."}
                            </CardDescription>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-primary" />
                            <span>{assignment.profitCenter.locationName || "Location will be configured by admin"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-primary" />
                            <span>{assignment.profitCenter.processProfile || "Process profile will be configured per workspace"}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <aside>
            <Card className="border-border bg-panel-gradient shadow-panel">
              <CardHeader>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Access policy</p>
                <CardTitle className="mt-3 text-2xl">Configuration decides what opens next</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 text-sm text-muted-foreground">
                <p>
                  The selected workspace controls which modules, labels, and process settings load into the portal. Nothing operational is hardcoded per plant.
                </p>
                <div className="rounded-md border border-border bg-card px-4 py-4">
                  {activeProfitCenterId ? (
                    <div className="space-y-3">
                      <p className="text-foreground">Workspace selected and ready.</p>
                      <Button className="w-full justify-between" onClick={() => navigate(getWorkspaceTarget(defaultModule?.routeSegment))}>
                        Continue to workspace <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <p>Select a workspace to continue into the portal.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </section>
    </main>
  );
}
