/**
 * Risk Monitoring tab — Phase D.
 *
 * Supply-chain risk register with severity, status, mitigation plan and
 * optional supplier link. Workflow: open → mitigated → closed (closed sets
 * resolved_at; reopening from mitigated clears it).
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  fetchRiskEvents,
  fetchSuppliers,
  transitionRiskEvent,
  upsertRiskEvent,
  type RiskEvent,
  type RiskSeverity,
  type RiskStatus,
  type Supplier,
} from "@/lib/procurement";

const SEVERITY: Record<RiskSeverity, { label: string; className: string }> = {
  low:      { label: "Low",      className: "bg-muted text-muted-foreground" },
  medium:   { label: "Medium",   className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  high:     { label: "High",     className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  critical: { label: "Critical", className: "bg-destructive/10 text-destructive" },
};

const STATUS: Record<RiskStatus, { label: string; className: string }> = {
  open:      { label: "Open",      className: "bg-destructive/10 text-destructive" },
  mitigated: { label: "Mitigated", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  closed:    { label: "Closed",    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
};

interface FormState {
  id?: string;
  supplierId: string;
  riskType: string;
  severity: RiskSeverity;
  description: string;
  mitigationPlan: string;
  occurredAt: string;
}

const todayLocalISO = () => new Date().toISOString().slice(0, 10);

const empty: FormState = {
  supplierId: "",
  riskType: "",
  severity: "medium",
  description: "",
  mitigationPlan: "",
  occurredAt: todayLocalISO(),
};

export function RiskTab() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();

  const [risks, setRisks] = useState<RiskEvent[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);
  const [transitioning, setTransitioning] = useState<string | null>(null);

  const supplierMap = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers]);

  const load = async () => {
    if (!activeProfitCenter) return;
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        fetchRiskEvents(activeProfitCenter.id),
        fetchSuppliers(activeProfitCenter.id),
      ]);
      setRisks(r);
      setSuppliers(s);
    } catch (e) {
      toast({ title: "Failed to load risks", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfitCenter?.id]);

  const openNew = () => { setForm(empty); setFormOpen(true); };
  const openEdit = (r: RiskEvent) => {
    setForm({
      id: r.id,
      supplierId: r.supplierId ?? "",
      riskType: r.riskType,
      severity: r.severity,
      description: r.description,
      mitigationPlan: r.mitigationPlan ?? "",
      occurredAt: r.occurredAt.slice(0, 10),
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!activeProfitCenter || !session?.user) return;
    setSaving(true);
    try {
      await upsertRiskEvent({
        id: form.id,
        profitCenterId: activeProfitCenter.id,
        supplierId: form.supplierId || null,
        riskType: form.riskType,
        severity: form.severity,
        description: form.description,
        mitigationPlan: form.mitigationPlan.trim() || null,
        occurredAt: form.occurredAt,
        createdBy: session.user.id,
      });
      toast({ title: form.id ? "Risk updated" : "Risk recorded" });
      setFormOpen(false);
      await load();
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const advance = async (r: RiskEvent, to: RiskStatus) => {
    setTransitioning(r.id);
    try {
      await transitionRiskEvent({ riskId: r.id, fromStatus: r.status, toStatus: to });
      toast({ title: `Risk ${STATUS[to].label}` });
      await load();
    } catch (e) {
      toast({ title: "Transition failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setTransitioning(null);
    }
  };

  if (!activeProfitCenter) {
    return (
      <Card>
        <CardHeader><CardTitle>Risk Monitoring</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground">Select a workspace first.</CardContent>
      </Card>
    );
  }

  const openCount = risks.filter((r) => r.status !== "closed").length;
  const criticalOpen = risks.filter((r) => r.status !== "closed" && r.severity === "critical").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" /> Risk Monitoring — {activeProfitCenter.name}
          </CardTitle>
          <CardDescription>
            {openCount} open · {criticalOpen} critical · {risks.length} total
          </CardDescription>
        </div>
        <Button onClick={openNew}>New Risk</Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : risks.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            No risks recorded. Use “New Risk” to add one.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Occurred</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {risks.map((r) => {
                const sev = SEVERITY[r.severity];
                const st = STATUS[r.status];
                const supplier = r.supplierId ? supplierMap.get(r.supplierId) : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm text-muted-foreground">{r.occurredAt.slice(0, 10)}</TableCell>
                    <TableCell className="font-medium">{r.riskType}</TableCell>
                    <TableCell><Badge className={`${sev.className} border-0`}>{sev.label}</Badge></TableCell>
                    <TableCell><Badge className={`${st.className} border-0`}>{st.label}</Badge></TableCell>
                    <TableCell className="text-sm">{supplier?.name ?? "—"}</TableCell>
                    <TableCell className="max-w-[26ch] truncate text-sm" title={r.description}>{r.description}</TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Edit</Button>
                      {r.status === "open" && (
                        <Button size="sm" variant="outline" disabled={transitioning === r.id}
                          onClick={() => void advance(r, "mitigated")}>→ Mitigated</Button>
                      )}
                      {r.status === "mitigated" && (
                        <Button size="sm" variant="outline" disabled={transitioning === r.id}
                          onClick={() => void advance(r, "open")}>Reopen</Button>
                      )}
                      {r.status !== "closed" && (
                        <Button size="sm" variant="outline" disabled={transitioning === r.id}
                          onClick={() => void advance(r, "closed")}>Close</Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Risk" : "New Risk"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Risk Type</Label>
                <Input placeholder="e.g. Supply delay, Quality defect"
                  value={form.riskType} onChange={(e) => setForm({ ...form, riskType: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v as RiskSeverity })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Occurred On</Label>
                <Input type="date" value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Supplier (optional)</Label>
                <Select value={form.supplierId || "__none"} onValueChange={(v) => setForm({ ...form, supplierId: v === "__none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None</SelectItem>
                    {suppliers.filter((s) => s.isActive).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Mitigation Plan</Label>
              <Textarea rows={3} value={form.mitigationPlan} onChange={(e) => setForm({ ...form, mitigationPlan: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving || !form.riskType.trim() || form.description.trim().length < 5}>
              {saving ? "Saving…" : form.id ? "Update Risk" : "Record Risk"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
