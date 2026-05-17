import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GitMerge, Plus, Trash2, Pencil } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import {
  ACTOR_ROLES,
  TRIGGER_TYPES,
  type ApprovalWorkflow,
  type WorkflowInput,
  type WorkflowStep,
  deleteWorkflow,
  listWorkflows,
  saveWorkflow,
  toggleWorkflow,
} from "@/lib/workflows";

/**
 * Dynamic Workflow Engine — admin CRUD for Maker-Checker rules.
 * Schema lives in `approval_workflows`; runtime hookup into PR/PO flows
 * lands in a follow-up phase (POLICY.md → "Dynamic Workflow Engine").
 */
export default function AdminWorkflows() {
  const { activeProfitCenterId, isAdmin } = useWorkspace();
  const { toast } = useToast();
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ApprovalWorkflow | "new" | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setWorkflows(await listWorkflows(activeProfitCenterId));
    } catch (e: any) {
      toast({ title: "Failed to load workflows", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfitCenterId, isAdmin]);

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Workflows</CardTitle>
          <CardDescription>Admin access required.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <GitMerge className="h-4 w-4" /> Dynamic Workflow Engine
          </CardTitle>
          <CardDescription>
            Configure Maker-Checker rules and approval hierarchies for sensitive actions.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="mr-1 h-4 w-4" /> New Workflow
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && workflows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No workflows configured yet. Click <b>New Workflow</b> to define one.
          </p>
        )}
        {workflows.map((wf) => (
          <WorkflowRow
            key={wf.id}
            wf={wf}
            onEdit={() => setEditing(wf)}
            onToggle={async (next) => {
              try {
                await toggleWorkflow(wf.id, next);
                await refresh();
              } catch (e: any) {
                toast({ title: "Toggle failed", description: e.message, variant: "destructive" });
              }
            }}
            onDelete={async () => {
              if (!confirm(`Delete workflow "${wf.name}"?`)) return;
              try {
                await deleteWorkflow(wf.id);
                await refresh();
              } catch (e: any) {
                toast({ title: "Delete failed", description: e.message, variant: "destructive" });
              }
            }}
          />
        ))}
      </CardContent>

      {editing && (
        <WorkflowEditor
          initial={editing === "new" ? null : editing}
          profitCenterId={activeProfitCenterId}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
    </Card>
  );
}

function WorkflowRow({
  wf,
  onEdit,
  onToggle,
  onDelete,
}: {
  wf: ApprovalWorkflow;
  onEdit: () => void;
  onToggle: (next: boolean) => void;
  onDelete: () => void;
}) {
  const triggerLabel = TRIGGER_TYPES.find((t) => t.value === wf.triggerType)?.label ?? wf.triggerType;
  return (
    <div className="rounded-lg border border-border p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{wf.name}</h3>
          <p className="text-sm text-muted-foreground">
            Trigger: <span className="font-medium">{triggerLabel}</span>
            {wf.condition?.amountAbove != null && (
              <> · Fires when amount &gt; {wf.condition.amountAbove}</>
            )}
            {wf.profitCenterId == null && <> · Global</>}
          </p>
          {wf.description && <p className="mt-1 text-xs text-muted-foreground">{wf.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={wf.isEnabled} onCheckedChange={onToggle} />
          <Button variant="outline" size="icon" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex flex-col items-stretch gap-3 text-sm md:flex-row md:items-center">
        {wf.steps.map((step, i) => {
          const actorLabel = ACTOR_ROLES.find((a) => a.value === step.actor)?.label ?? step.actor;
          return (
            <div key={i} className="contents">
              <div className="relative flex-1 rounded border border-border bg-muted/40 p-3 text-center">
                <span className="mb-1 block font-semibold">{step.label}</span>
                <Badge variant="outline">{actorLabel}</Badge>
                {step.amountThreshold != null && (
                  <div className="absolute -right-2 -top-2 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium">
                    If &gt; {step.amountThreshold}
                  </div>
                )}
              </div>
              {i < wf.steps.length - 1 && <div className="text-center text-muted-foreground">→</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkflowEditor({
  initial,
  profitCenterId,
  onClose,
  onSaved,
}: {
  initial: ApprovalWorkflow | null;
  profitCenterId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<WorkflowInput>(() =>
    initial
      ? {
          id: initial.id,
          profitCenterId: initial.profitCenterId,
          triggerType: initial.triggerType,
          name: initial.name,
          description: initial.description ?? "",
          isEnabled: initial.isEnabled,
          steps: initial.steps.length
            ? initial.steps
            : [{ label: "Maker", actor: "any_user" }],
          condition: initial.condition,
        }
      : {
          profitCenterId,
          triggerType: "purchase_requisition",
          name: "",
          description: "",
          isEnabled: true,
          steps: [
            { label: "Maker", actor: "any_user" },
            { label: "Checker", actor: "department_head" },
          ],
          condition: null,
        },
  );
  const [saving, setSaving] = useState(false);

  const updateStep = (i: number, patch: Partial<WorkflowStep>) =>
    setForm((f) => ({ ...f, steps: f.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));

  const addStep = () =>
    setForm((f) => ({
      ...f,
      steps: [...f.steps, { label: `Checker ${f.steps.length}`, actor: "department_head" }],
    }));

  const removeStep = (i: number) =>
    setForm((f) => ({ ...f, steps: f.steps.filter((_, idx) => idx !== i) }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveWorkflow(form);
      toast({ title: "Workflow saved" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit workflow" : "New workflow"}</DialogTitle>
          <DialogDescription>
            Define the Maker-Checker chain. Persists to the workflow rules table.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Purchase Requisition Approval"
              />
            </div>
            <div>
              <Label>Trigger</Label>
              <Select
                value={form.triggerType}
                onValueChange={(v) => setForm((f) => ({ ...f, triggerType: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={form.description ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Triggered when a new PR is created…"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fire only when amount &gt;</Label>
              <Input
                type="number"
                value={form.condition?.amountAbove ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    condition: e.target.value === "" ? null : { amountAbove: Number(e.target.value) },
                  }))
                }
                placeholder="Optional, e.g. 100000"
              />
            </div>
            <div className="flex items-end gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.isEnabled}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isEnabled: v }))}
                />
                <Label className="m-0">Enabled</Label>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Steps</Label>
              <Button size="sm" variant="outline" onClick={addStep}>
                <Plus className="mr-1 h-4 w-4" /> Add step
              </Button>
            </div>
            {form.steps.map((step, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 rounded border border-border p-2">
                <Input
                  className="col-span-4"
                  value={step.label}
                  onChange={(e) => updateStep(i, { label: e.target.value })}
                  placeholder="Step label"
                />
                <Select value={step.actor} onValueChange={(v) => updateStep(i, { actor: v as any })}>
                  <SelectTrigger className="col-span-4"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTOR_ROLES.map((a) => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="col-span-3"
                  type="number"
                  value={step.amountThreshold ?? ""}
                  onChange={(e) =>
                    updateStep(i, {
                      amountThreshold: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  placeholder="Threshold"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="col-span-1"
                  onClick={() => removeStep(i)}
                  disabled={form.steps.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save workflow"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
