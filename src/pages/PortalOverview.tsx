import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BarChart3, Factory, Gauge, MapPin, Pin, Users, Warehouse } from "lucide-react";
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

  const movePin = async (pinId: string, direction: -1 | 1) => {
    if (reordering) return;
    const currentIdx = pinned.findIndex((c) => c.pin.id === pinId);
    if (currentIdx === -1) return;
    const targetIdx = currentIdx + direction;
    if (targetIdx < 0 || targetIdx >= pinned.length) return;

    const previous = pinned;
    const reorderedPins = reorderPins(pinned.map((c) => c.pin), pinId, targetIdx);
    const cardById = new Map(pinned.map((c) => [c.pin.id, c]));
    const optimistic = reorderedPins.map((p) => {
      const card = cardById.get(p.id)!;
      return { ...card, pin: { ...card.pin, sortOrder: p.sortOrder } };
    });
    setPinned(optimistic);
    setReordering(true);
    try {
      // Persist only the two pins whose sort_order actually changed.
      const changed = reorderedPins.filter((p) => {
        const before = previous.find((c) => c.pin.id === p.id)?.pin.sortOrder;
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

  return (
    <div className="space-y-6">
      {activeProfitCenter && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Pin className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pinned KPIs</h2>
          </div>
          {pinnedLoading ? (
            <p className="text-sm text-muted-foreground">Loading pinned KPIs…</p>
          ) : pinned.length === 0 ? (
            <Card className="border-dashed border-border bg-card">
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Pin KPIs from the Reports page to see them here.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {pinned.map((card, idx) => (
                <Card key={card.pin.id} className="border-border bg-card">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-muted-foreground">{card.definition.displayName}</p>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          aria-label="Move pin up"
                          disabled={idx === 0 || reordering}
                          onClick={() => void movePin(card.pin.id, -1)}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          aria-label="Move pin down"
                          disabled={idx === pinned.length - 1 || reordering}
                          onClick={() => void movePin(card.pin.id, 1)}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <CardTitle className="text-2xl">
                      {card.value == null ? "—" : Number(card.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      {card.definition.unit ? <span className="ml-1 text-sm font-normal text-muted-foreground">{card.definition.unit}</span> : null}
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground">Today</p>
                  </CardHeader>
                </Card>
              ))}
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
            <Button className="h-11 gap-2">Open workspace brief</Button>
            <Button variant="outline" className="h-11">Review configured modules</Button>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-panel">
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

      <section className="grid gap-4 xl:grid-cols-3">
        {modules.map((module) => (
          <Card key={module.id} className="border-border bg-card">
            <CardHeader>
              <div className="inline-flex w-fit rounded-full bg-primary/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                Configured module
              </div>
              <CardTitle className="mt-3 text-xl">{module.navLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">{module.description || "Workspace-controlled module prepared for future operational delivery."}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
