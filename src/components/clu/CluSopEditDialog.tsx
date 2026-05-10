/**
 * CLU SOP master editor — create/edit per-grade target ranges.
 * Pure presentational dialog; persistence delegated to clu-production.upsertSop.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { upsertSop, type CluSopRecord } from "@/lib/clu-production";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  profitCenterId: string;
  userId: string;
  sop: CluSopRecord | null;
}

const numOrNull = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function CluSopEditDialog({ open, onClose, onSaved, profitCenterId, userId, sop }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [grade, setGrade] = useState("");
  const [carbonFrom, setCarbonFrom] = useState("");
  const [carbonTo, setCarbonTo] = useState("");
  const [blowingMin, setBlowingMin] = useState("");
  const [o2Flow, setO2Flow] = useState("");
  const [fluxQty, setFluxQty] = useState("");
  const [temp, setTemp] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setGrade(sop?.grade ?? "");
    setCarbonFrom(sop?.carbonFrom?.toString() ?? "");
    setCarbonTo(sop?.carbonTo?.toString() ?? "");
    setBlowingMin(sop?.blowingTimeTargetMin?.toString() ?? "");
    setO2Flow(sop?.oxygenFlowTarget?.toString() ?? "");
    setFluxQty(sop?.fluxQtyTarget?.toString() ?? "");
    setTemp(sop?.tempTarget?.toString() ?? "");
    setNotes(sop?.notes ?? "");
    setActive(sop?.isActive ?? true);
  }, [open, sop]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await upsertSop({
        id: sop?.id,
        profitCenterId,
        grade,
        carbonFrom: numOrNull(carbonFrom),
        carbonTo: numOrNull(carbonTo),
        blowingTimeTargetMin: numOrNull(blowingMin),
        oxygenFlowTarget: numOrNull(o2Flow),
        fluxQtyTarget: numOrNull(fluxQty),
        tempTarget: numOrNull(temp),
        notes: notes.trim() || null,
        isActive: active,
        createdBy: userId,
      });
      toast({ title: sop ? "SOP updated" : "SOP created" });
      onSaved();
      onClose();
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{sop ? "Edit SOP" : "New SOP"}</DialogTitle>
          <DialogDescription>Per-grade target ranges drive heat-entry guidance and AI analysis.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="sop-grade">Grade *</Label>
            <Input id="sop-grade" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. SiMn-65/16" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Carbon from %</Label>
              <Input type="number" step="0.01" value={carbonFrom} onChange={(e) => setCarbonFrom(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Carbon to %</Label>
              <Input type="number" step="0.01" value={carbonTo} onChange={(e) => setCarbonTo(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Blowing time (min)</Label>
              <Input type="number" step="1" value={blowingMin} onChange={(e) => setBlowingMin(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>O₂ flow target</Label>
              <Input type="number" step="1" value={o2Flow} onChange={(e) => setO2Flow(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Flux qty target</Label>
              <Input type="number" step="1" value={fluxQty} onChange={(e) => setFluxQty(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Temperature target °C</Label>
              <Input type="number" step="1" value={temp} onChange={(e) => setTemp(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={active} onCheckedChange={setActive} id="sop-active" />
            <Label htmlFor="sop-active">Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !grade.trim()}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {sop ? "Save changes" : "Create SOP"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
