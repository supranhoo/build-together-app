import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, BarChart3, Factory, Gauge, MapPin, Pin, Users, Warehouse } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  buildDateRange,
  computeKpi,
  fetchKpiDefinitions,
  fetchKpiPins,
  persistPinOrder,
  reorderPins,
  splitPinsByScope,
  type KpiDefinition,
  type KpiPin,
} from "@/lib/reporting";
import { computeStockBalances, fetchLedger } from "@/lib/inventory";
import { fetchMasterItems, type MasterItem } from "@/lib/master-data";
import { classifyStockStatus } from "@/lib/inventory-min-max";

interface PinnedKpiCard {
  pin: KpiPin;
  definition: KpiDefinition;
  value: number | null;
}

export default function PortalOverview() {
  const { profile, session } = useAuth();
  const { activeProfitCenter, modules, settings, assignments } = useWorkspace();
  const { toast } = useToast();
  const [pinned, setPinned] = useState<PinnedKpiCard[]>([]);
  const [pinnedLoading, setPinnedLoading] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [lowStockCount, setLowStockCount] = useState<number | null>(null);
  const workspaceCardRef = useRef<HTMLDivElement | null>(null);
  const modulesGridRef = useRef<HTMLDivElement | null>(null);

  const scrollTo = (ref: React.RefObject<HTMLElement>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (!activeProfitCenter || !session?.user?.id) {
      setPinned([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setPinnedLoading(true);
      try {
        const [pins, defs] = await Promise.all([
          fetchKpiPins(session.user.id, activeProfitCenter.id),
          fetchKpiDefinitions(activeProfitCenter.id),
        ]);
        if (cancelled) return;
        const range = buildDateRange("today");
        const cards = await Promise.all(
          pins.map(async (pin) => {
            const def = defs.find((d) => d.id === pin.kpiDefinitionId);
            if (!def) return null;
            try {
              const result = await computeKpi(activeProfitCenter.id, def.key, range);
              return { pin, definition: def, value: result.value } satisfies PinnedKpiCard;
            } catch {
              return { pin, definition: def, value: null } satisfies PinnedKpiCard;
            }
          }),
        );
        if (cancelled) return;
        setPinned(cards.filter((c): c is PinnedKpiCard => c !== null));
      } catch {
        if (!cancelled) setPinned([]);
      } finally {
        if (!cancelled) setPinnedLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeProfitCenter, session?.user?.id]);

  // Surface min-max alerts on Overview (read-only count; details on Inventory tab).
  useEffect(() => {
    if (!activeProfitCenter) {
      setLowStockCount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [items, ledger] = await Promise.all([
          fetchMasterItems(activeProfitCenter.id),
          fetchLedger(activeProfitCenter.id),
        ]);
        if (cancelled) return;
        const balances = computeStockBalances(ledger);
        const count = items.reduce((acc, item) => {
          const qty = balances
            .filter((b) => b.materialId === item.id)
            .reduce((s, b) => s + b.quantity, 0);
          const status = classifyStockStatus(qty, {
            minLevel: item.minLevel,
            maxLevel: item.maxLevel,
            reorderLevel: item.reorderLevel,
          });
          return status === "below_min" || status === "reorder" ? acc + 1 : acc;
        }, 0);
        setLowStockCount(count);
      } catch {
        if (!cancelled) setLowStockCount(null);
      }
    })();
    return () => { cancelled = true; };
  }, [activeProfitCenter]);

  const { personalCards, sharedCards } = useMemo(() => {
    const split = splitPinsByScope(pinned.map((c) => c.pin));
    const personalIds = new Set(split.personal.map((p) => p.id));
    const sharedIds = new Set(split.shared.map((p) => p.id));
    return {
      personalCards: pinned.filter((c) => personalIds.has(c.pin.id)),
      sharedCards: pinned.filter((c) => sharedIds.has(c.pin.id)),
    };
  }, [pinned]);

  const movePin = async (pinId: string, direction: -1 | 1) => {
    if (reordering) return;
    // Operate only on personal pins; shared pins are not user-reorderable.
    const personalIdx = personalCards.findIndex((c) => c.pin.id === pinId);
    if (personalIdx === -1) return;
    const targetIdx = personalIdx + direction;
    if (targetIdx < 0 || targetIdx >= personalCards.length) return;

    const previous = pinned;
    const reorderedPersonal = reorderPins(personalCards.map((c) => c.pin), pinId, targetIdx);
    const cardById = new Map(personalCards.map((c) => [c.pin.id, c]));
    const optimisticPersonal = reorderedPersonal.map((p) => {
      const card = cardById.get(p.id)!;
      return { ...card, pin: { ...card.pin, sortOrder: p.sortOrder } };
    });
    // Recompose: shared cards keep their position, personal section is replaced.
    const optimistic = [
      ...optimisticPersonal,
      ...sharedCards,
    ];
    setPinned(optimistic);
    setReordering(true);
    try {
      const changed = reorderedPersonal.filter((p) => {
        const before = personalCards.find((c) => c.pin.id === p.id)?.pin.sortOrder;
        return before !== p.sortOrder;
      });
      await persistPinOrder(changed.map((p) => ({ id: p.id, sortOrder: p.sortOrder })));
    } catch (err) {
      setPinned(previous);
      toast({
        title: "Reorder failed",
        description: err instanceof Error ? err.message : "Could not save the new order.",
        variant: "destructive",
      });
    } finally {
      setReordering(false);
    }
  };

  const metrics = [
    { label: "Assigned workspaces", value: String(assignments.length), detail: "Access scope in current session", icon: Gauge },
    { label: "Configured modules", value: String(modules.length), detail: "Driven by backend configuration", icon: Warehouse },
    { label: "Active settings", value: String(settings.length), detail: "Workspace-level process records", icon: Factory },
    { label: "Workspace status", value: activeProfitCenter?.isActive ? "Active" : "Pending", detail: activeProfitCenter?.code || "No workspace", icon: BarChart3 },
  ];

  const renderPinnedCard = (
    card: PinnedKpiCard,
    options: { isShared: boolean; idx?: number; total?: number },
  ) => (
    <Card key={card.pin.id} className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-muted-foreground">{card.definition.displayName}</p>
          {options.isShared ? (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Users className="h-2.5 w-2.5" /> team
            </Badge>
          ) : (
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                aria-label="Move pin up"
                disabled={options.idx === 0 || reordering}
                onClick={() => void movePin(card.pin.id, -1)}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                aria-label="Move pin down"
                disabled={options.idx === (options.total ?? 0) - 1 || reordering}
                onClick={() => void movePin(card.pin.id, 1)}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        <CardTitle className="text-2xl">
          {card.value == null ? "—" : Number(card.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          {card.definition.unit ? <span className="ml-1 text-sm font-normal text-muted-foreground">{card.definition.unit}</span> : null}
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">Today</p>
      </CardHeader>
    </Card>
  );

  return (
    <div className="space-y-6">
      {activeProfitCenter && sharedCards.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pinned by your team</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {sharedCards.map((card) => renderPinnedCard(card, { isShared: true }))}
          </div>
        </section>
      )}

      {activeProfitCenter && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Pin className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your pins</h2>
          </div>
          {pinnedLoading ? (
            <p className="text-sm text-muted-foreground">Loading pinned KPIs…</p>
          ) : personalCards.length === 0 ? (
            <Card className="border-dashed border-border bg-card">
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Pin KPIs from the Reports page to see them here.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {personalCards.map((card, idx) => renderPinnedCard(card, { isShared: false, idx, total: personalCards.length }))}
            </div>
          )}
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="border-border bg-panel-gradient shadow-panel">
          <CardHeader className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Workspace command view</p>
            <CardTitle className="text-3xl text-balance">
              {activeProfitCenter ? `${activeProfitCenter.name} operating context` : "Select a workspace to continue"}
            </CardTitle>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Signed in as {profile?.display_name || "employee"}. This portal shell now reads workspace access, modules, and process settings from backend configuration instead of hardcoded plant assumptions.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button className="h-11 gap-2" onClick={() => scrollTo(workspaceCardRef)}>Open workspace brief</Button>
            <Button variant="outline" className="h-11" onClick={() => scrollTo(modulesGridRef)}>Review configured modules</Button>
          </CardContent>
        </Card>

        <Card ref={workspaceCardRef} className="border-border bg-card shadow-panel">
          <CardHeader>
            <CardTitle className="text-lg">Current workspace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
              <span className="text-muted-foreground">Role</span>
              <span className="font-semibold capitalize">{profile?.role || "user"}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
              <span className="text-muted-foreground">Location</span>
              <span className="font-semibold inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />{activeProfitCenter?.locationName || "Admin configured"}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
              <span className="text-muted-foreground">Process profile</span>
              <span className="font-semibold">{activeProfitCenter?.processProfile || "Workspace-defined"}</span>
            </div>
          </CardContent>
        </Card>
      </section>

      {activeProfitCenter && lowStockCount !== null && lowStockCount > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-destructive/15 p-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{lowStockCount} item{lowStockCount === 1 ? "" : "s"} need attention</p>
                <p className="text-xs text-muted-foreground">Stock at or below reorder / minimum thresholds.</p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/portal/inventory/min-max">Review Min-Max</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((item) => (
          <Card key={item.label} className="border-border bg-card">
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="mt-3 text-2xl font-semibold">{item.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <div className="rounded-md bg-primary/12 p-3 text-primary">
                <item.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section ref={modulesGridRef} className="grid gap-4 xl:grid-cols-3">
        {modules.map((module) => (
          <Link
            key={module.id}
            to={`/portal/${module.routeSegment}`}
            className="group rounded-lg outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Open ${module.navLabel}`}
          >
            <Card className="h-full border-border bg-card transition-colors group-hover:border-primary/60 group-hover:bg-panel">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="inline-flex w-fit rounded-full bg-primary/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                    Configured module
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                </div>
                <CardTitle className="mt-3 text-xl">{module.navLabel}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">{module.description || "Workspace-controlled module prepared for future operational delivery."}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}
