/**
 * Quality Control (Phase A — shell only).
 *
 * 9-tab control panel surface for the Ferro Alloys Division. Per Phase A scope:
 *  - 2 tabs deep-link to existing single-source-of-truth pages
 *    (Raw Material QC → GRN, Furnace Quality → PortalProductionQuality).
 *  - 7 new tabs (Dashboard, Sampling, Bunker Feed QC, Finished Goods, Dispatch,
 *    Complaints, Compliance) render scaffolds and become functional in
 *    Phases B/C/D per .lovable/plan.md.
 *
 * Notes vs. uploaded reference module:
 *  - "CLU Quality" was removed (not part of Ferro Alloys Division).
 *  - "Bunker Feed QC" was added — pre-consumption ore/reductant testing
 *    against material specs.
 *
 * Hard rules followed:
 *  - Uses semantic tokens only (no bg-white / text-slate-* hardcoding).
 *  - Uses shadcn Tabs + Card primitives.
 *  - Workspace-scoped via useWorkspace (no manual profit_center props).
 *  - Admin-gated by the /admin route's RequireAdmin wrapper; also mounted
 *    inside PortalShell so the plant sidebar stays visible (same pattern
 *    as Procurement).
 */
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle,
  ClipboardCheck,
  ExternalLink,
  FileCheck,
  FlaskConical,
  LayoutDashboard,
  Package,
  Target,
  Thermometer,
  Truck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useWorkspace } from "@/hooks/use-workspace";

type DeepLinkTarget = { to: string; label: string };
type TabSpec =
  | { id: string; label: string; icon: React.ComponentType<{ className?: string }>; kind: "scaffold"; description: string; phase: "B" | "C" | "D" }
  | { id: string; label: string; icon: React.ComponentType<{ className?: string }>; kind: "deeplink"; description: string; target: DeepLinkTarget };

const TABS: TabSpec[] = [
  { id: "dashboard", label: "Dashboard & KPIs", icon: LayoutDashboard, kind: "scaffold",
    description: "KPIs across samples, bunker tests, finished goods, dispatch and complaints.",
    phase: "D" },
  { id: "raw_material", label: "Raw Material QC", icon: FlaskConical, kind: "deeplink",
    description: "Incoming material quality (Mn %, Fe %, moisture %) is captured on each GRN. Single source of truth.",
    target: { to: "/portal/inventory/grn", label: "Open GRN with quality fields" } },
  { id: "sampling", label: "Sampling Management", icon: Target, kind: "scaffold",
    description: "Sample plans, lot tracking and status workflow (planned → collected → tested → released/rejected).",
    phase: "B" },
  { id: "bunker_feed", label: "Bunker Feed QC", icon: ClipboardCheck, kind: "scaffold",
    description: "Per-bunker test of ore and reductant before charging. Verifies consumed material meets spec.",
    phase: "B" },
  { id: "furnace", label: "Furnace Quality", icon: Thermometer, kind: "deeplink",
    description: "FG Mn %, slag MnO % and dust Mn % per heat are recorded with each heat in the production module.",
    target: { to: "/portal/production", label: "Open production quality" } },
  { id: "finished_goods", label: "Finished Goods QC", icon: Package, kind: "scaffold",
    description: "Batch-level FG inspection with pass / conditional / fail result and certificate-of-analysis data.",
    phase: "C" },
  { id: "dispatch", label: "Dispatch Clearance", icon: Truck, kind: "scaffold",
    description: "Release gate before shipment. Requires a passed FG inspection.",
    phase: "C" },
  { id: "complaints", label: "Customer Complaints", icon: AlertCircle, kind: "scaffold",
    description: "8D-style complaint workflow: open → investigating → corrective action → closed.",
    phase: "D" },
  { id: "compliance", label: "Compliance & Lab", icon: FileCheck, kind: "scaffold",
    description: "Lab certificates and instrument calibrations with expiry tracking.",
    phase: "D" },
];

export default function AdminQuality() {
  const { activeProfitCenter } = useWorkspace();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Quality Control Module</h2>
          <p className="text-sm text-muted-foreground">
            {activeProfitCenter
              ? <>Workspace: <span className="font-medium text-foreground">{activeProfitCenter.name}</span></>
              : "Select a workspace to scope quality data."}
          </p>
        </div>
        <Badge variant="outline" className="border-primary/40 bg-primary/10">
          Phase A — schema live · UI activates in Phases B / C / D
        </Badge>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-muted p-1">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="gap-2 whitespace-nowrap data-[state=active]:bg-background">
              <t.icon className="h-4 w-4" />
              <span className="text-xs font-medium">{t.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent key={t.id} value={t.id} className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <t.icon className="h-5 w-5 text-primary" />
                    {t.label}
                  </CardTitle>
                  <CardDescription>{t.description}</CardDescription>
                </div>
                {t.kind === "deeplink" && (
                  <Button onClick={() => navigate(t.target.to)} variant="outline" className="gap-2">
                    <ExternalLink className="h-4 w-4" /> {t.target.label}
                  </Button>
                )}
                {t.kind === "scaffold" && (
                  <Badge variant="secondary">Activates in Phase {t.phase}</Badge>
                )}
              </CardHeader>
              <CardContent>
                {t.kind === "deeplink" ? (
                  <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
                    This screen lives in another module to keep a single source of truth.
                    The button above opens the existing page; data shown there is shared with Quality.
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground space-y-2">
                    <p>Schema, RLS, audit triggers and permission grants for this tab are live in the database.</p>
                    <p className="flex items-center gap-2 text-xs">
                      <CheckCircle className="h-3.5 w-3.5 text-primary" />
                      The interactive UI is delivered in Phase {t.phase}.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
