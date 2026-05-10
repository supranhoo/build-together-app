/**
 * CLU (Converter Ladle Unit) Production module — page scaffold.
 *
 * PR2 deliverable: profit-center-scoped read-only views (Dashboard, Planning,
 * History, SOP Master). Heat-entry lifecycle and AI analysis ship in later PRs.
 *
 * Backend: clu_heats / clu_sop_master / clu_delays (RLS-scoped per PC).
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FlaskConical, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchHeats,
  fetchDelays,
  fetchSopMaster,
  runHeatAnalysis,
  type CluHeatRecord,
  type CluDelayRecord,
  type CluSopRecord,
} from "@/lib/clu-production";
import { CluHeatEntrySheet } from "@/components/clu/CluHeatEntrySheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles } from "lucide-react";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString();
const fmtNum = (v: number | null, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(digits);

const statusVariant: Record<CluHeatRecord["status"], "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  pending_approval: "secondary",
  approved: "default",
  rejected: "destructive",
  voided: "destructive",
};

export default function PortalProductionCLU() {
  const { activeProfitCenter } = useWorkspace();
  const { toast } = useToast();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  const [heats, setHeats] = useState<CluHeatRecord[]>([]);
  const [delays, setDelays] = useState<CluDelayRecord[]>([]);
  const [sops, setSops] = useState<CluSopRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeHeat, setActiveHeat] = useState<CluHeatRecord | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [aiHeatId, setAiHeatId] = useState<string>("");
  const [aiRunning, setAiRunning] = useState(false);
  const [aiSummary, setAiSummary] = useState<string>("");

  const aiHeat = useMemo(() => heats.find((h) => h.id === aiHeatId) ?? null, [heats, aiHeatId]);

  useEffect(() => {
    const meta = aiHeat?.metadata as { last_ai_analysis?: { summary?: string } } | undefined;
    setAiSummary(meta?.last_ai_analysis?.summary ?? "");
  }, [aiHeatId, aiHeat]);

  const handleRunAnalysis = async () => {
    if (!aiHeatId) return;
    setAiRunning(true);
    try {
      const res = await runHeatAnalysis(aiHeatId);
      setAiSummary(res.summary);
      setReloadKey((k) => k + 1);
      toast({ title: "Analysis complete", description: `Model: ${res.model}` });
    } catch (e) {
      toast({
        title: "AI analysis failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setAiRunning(false);
    }
  };

  useEffect(() => {
    if (!activeProfitCenter) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchHeats(activeProfitCenter.id),
      fetchDelays(activeProfitCenter.id),
      fetchSopMaster(activeProfitCenter.id),
    ])
      .then(([h, d, s]) => {
        if (cancelled) return;
        setHeats(h);
        setDelays(d);
        setSops(s);
      })
      .catch((error) => {
        if (cancelled) return;
        toast({
          title: "Failed to load CLU data",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProfitCenter?.id, toast, reloadKey]);

  const dashboardStats = useMemo(() => {
    const today = new Date().toDateString();
    const todayHeats = heats.filter((h) => new Date(h.heatDate).toDateString() === today);
    const pending = heats.filter((h) => h.status === "pending_approval").length;
    const approved = heats.filter((h) => h.status === "approved").length;
    const totalDelayMin = delays.reduce((sum, d) => sum + (d.durationMin ?? 0), 0);
    return { today: todayHeats.length, pending, approved, totalDelayMin };
  }, [heats, delays]);

  const planning = useMemo(() => heats.filter((h) => h.status === "draft" || h.status === "pending_approval"), [heats]);
  const history = useMemo(() => heats.filter((h) => h.status === "approved" || h.status === "rejected" || h.status === "voided"), [heats]);

  if (!activeProfitCenter) {
    return (
      <Card className="border-border bg-card shadow-panel">
        <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
          <AlertTriangle className="h-5 w-5" />
          Select a workspace to view the CLU production module.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Production</p>
          <h1 className="mt-1 text-2xl font-semibold">CLU — Converter Ladle Unit</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            21-step heat lifecycle, blowing &amp; sampling, additions, output and SOP master for {activeProfitCenter.name}.
          </p>
        </div>
        <Button onClick={() => { setActiveHeat(null); setSheetOpen(true); }} size="sm">
          <Plus className="mr-1 h-4 w-4" /> New heat
        </Button>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="planning">Planning</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="sop">SOP Master</TabsTrigger>
          <TabsTrigger value="ai">AI Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Heats today" value={dashboardStats.today} loading={loading} />
            <StatCard label="Pending approval" value={dashboardStats.pending} loading={loading} />
            <StatCard label="Approved (all time)" value={dashboardStats.approved} loading={loading} />
            <StatCard
              label="Recent delay minutes"
              value={dashboardStats.totalDelayMin}
              loading={loading}
            />
          </div>

          <Card className="border-border bg-card shadow-panel">
            <CardHeader>
              <CardTitle>Recent delays</CardTitle>
              <CardDescription>Latest 100 logged delays for this workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <LoadingRow />
              ) : delays.length === 0 ? (
                <EmptyState icon={<FlaskConical className="h-5 w-5" />} text="No delays logged yet." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Started</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Duration (min)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {delays.slice(0, 20).map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>{fmtDateTime(d.startedAt)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{d.category}</Badge>
                        </TableCell>
                        <TableCell className="max-w-md truncate">{d.reason}</TableCell>
                        <TableCell className="text-right">{fmtNum(d.durationMin, 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="planning">
          <Card className="border-border bg-card shadow-panel">
            <CardHeader>
              <CardTitle>Planned &amp; in-progress heats</CardTitle>
              <CardDescription>Heats in draft or pending approval.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <LoadingRow />
              ) : planning.length === 0 ? (
                <EmptyState text="No heats in planning." />
              ) : (
                <HeatTable rows={planning} onOpen={(h) => { setActiveHeat(h); setSheetOpen(true); }} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="border-border bg-card shadow-panel">
            <CardHeader>
              <CardTitle>Heat history</CardTitle>
              <CardDescription>Approved, rejected and voided heats.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <LoadingRow />
              ) : history.length === 0 ? (
                <EmptyState text="No completed heats yet." />
              ) : (
                <HeatTable rows={history} onOpen={(h) => { setActiveHeat(h); setSheetOpen(true); }} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sop">
          <Card className="border-border bg-card shadow-panel">
            <CardHeader>
              <CardTitle>SOP master</CardTitle>
              <CardDescription>Per-grade target ranges. Editable in a future release.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <LoadingRow />
              ) : sops.length === 0 ? (
                <EmptyState text="No SOPs configured." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Grade</TableHead>
                      <TableHead className="text-right">Carbon range %</TableHead>
                      <TableHead className="text-right">Blowing min</TableHead>
                      <TableHead className="text-right">O₂ flow</TableHead>
                      <TableHead className="text-right">Flux qty</TableHead>
                      <TableHead className="text-right">Temp °C</TableHead>
                      <TableHead>Active</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sops.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.grade}</TableCell>
                        <TableCell className="text-right">
                          {s.carbonFrom !== null && s.carbonTo !== null
                            ? `${fmtNum(s.carbonFrom)}–${fmtNum(s.carbonTo)}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">{fmtNum(s.blowingTimeTargetMin, 0)}</TableCell>
                        <TableCell className="text-right">{fmtNum(s.oxygenFlowTarget, 0)}</TableCell>
                        <TableCell className="text-right">{fmtNum(s.fluxQtyTarget, 0)}</TableCell>
                        <TableCell className="text-right">{fmtNum(s.tempTarget, 0)}</TableCell>
                        <TableCell>
                          <Badge variant={s.isActive ? "default" : "outline"}>
                            {s.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai">
          <Card className="border-border bg-card shadow-panel">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> AI heat analysis
              </CardTitle>
              <CardDescription>
                Pick a heat to generate a metallurgist's review (recovery, deviations, suggested actions). Powered by Lovable AI.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Select value={aiHeatId} onValueChange={setAiHeatId}>
                  <SelectTrigger className="w-[280px]">
                    <SelectValue placeholder="Select a heat…" />
                  </SelectTrigger>
                  <SelectContent>
                    {heats.length === 0 ? (
                      <SelectItem value="__none" disabled>No heats available</SelectItem>
                    ) : (
                      heats.map((h) => (
                        <SelectItem key={h.id} value={h.id}>
                          #{h.heatNumber} — {fmtDate(h.heatDate)} ({h.status.replace("_", " ")})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button onClick={handleRunAnalysis} disabled={!aiHeatId || aiRunning} size="sm">
                  {aiRunning ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
                  {aiRunning ? "Analysing…" : "Run analysis"}
                </Button>
                {aiHeat && (() => {
                  const meta = aiHeat.metadata as { last_ai_analysis?: { generated_at?: string } } | undefined;
                  const at = meta?.last_ai_analysis?.generated_at;
                  return at ? (
                    <span className="text-xs text-muted-foreground">Last run: {fmtDateTime(at)}</span>
                  ) : null;
                })()}
              </div>

              {aiSummary ? (
                <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-4 text-sm leading-relaxed">
                  {aiSummary}
                </pre>
              ) : (
                <EmptyState text={aiHeatId ? "No analysis yet — click Run analysis." : "Pick a heat to begin."} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CluHeatEntrySheet
        open={sheetOpen}
        heat={activeHeat}
        profitCenterId={activeProfitCenter.id}
        isAdmin={isAdmin}
        onClose={() => setSheetOpen(false)}
        onChanged={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}

function StatCard({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <Card className="border-border bg-card shadow-panel">
      <CardContent className="py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">
          {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : value}
        </p>
      </CardContent>
    </Card>
  );
}

function HeatTable({ rows, onOpen }: { rows: CluHeatRecord[]; onOpen: (h: CluHeatRecord) => void }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Heat #</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Grade</TableHead>
          <TableHead>Tapping</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Step</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((h) => (
          <TableRow key={h.id} className="cursor-pointer hover:bg-muted/40" onClick={() => onOpen(h)}>
            <TableCell className="font-medium">{h.heatNumber}</TableCell>
            <TableCell>{fmtDate(h.heatDate)}</TableCell>
            <TableCell>{h.grade ?? "—"}</TableCell>
            <TableCell>{h.tappingNo ?? "—"}</TableCell>
            <TableCell>
              <Badge variant={statusVariant[h.status]}>{h.status.replace("_", " ")}</Badge>
            </TableCell>
            <TableCell className="text-right">{h.currentStepIndex + 1} / 21</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}

function EmptyState({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      {icon ?? <FlaskConical className="h-5 w-5" />}
      {text}
    </div>
  );
}
