/**
 * Plant Head Command Deck — dedicated cross-module monitoring module.
 *
 * Lives at /portal/command-deck (own sidebar entry) so the unified plant
 * view is treated as a first-class module instead of being embedded inside
 * the Overview page. The actual aggregation/health logic stays in
 * PlantHeadDashboard + src/lib/plant-health.ts (SSOT) — this page is a
 * thin shell that supplies the active workspace and an empty-state.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Gauge } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { PlantHeadDashboard } from "@/components/portal/PlantHeadDashboard";

export default function PortalCommandDeck() {
  const { activeProfitCenter } = useWorkspace();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
          <Gauge className="h-3.5 w-3.5" />
          Plant Head View
        </div>
        <h1 className="text-3xl font-semibold text-balance">Command Deck</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Unified, read-only monitoring across Production, Quality, Inventory,
          Procurement, Maintenance, Finance and Sales. All metrics are derived
          live from each module's source of truth.
        </p>
      </header>

      {activeProfitCenter ? (
        <PlantHeadDashboard profitCenterId={activeProfitCenter.id} />
      ) : (
        <Card className="border-dashed border-border bg-card">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Select a workspace to load the Command Deck.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
