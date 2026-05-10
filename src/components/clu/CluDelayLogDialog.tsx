/**
 * CLU delay logging dialog. Persists via clu-production.logDelay (which
 * computes duration_min server-side from start/end). Optional heat link.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { logDelay, type CluDelayCategory, type CluHeatRecord } from "@/lib/clu-production";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  profitCenterId: string;
  userId: string;
  heats: CluHeatRecord[];
}

const CATEGORIES: CluDelayCategory[] = ["MECHANICAL", "PROCESS", "MATERIAL", "POWER", "MANPOWER", "OTHER"];

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function CluDelayLogDialog({ open, onClose, onSaved, profitCenterId, userId, heats }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState<CluDelayCategory>("PROCESS");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [reason, setReason] = useState("");
  const [heatId, setHeatId] = useState<string>("__none");

  useEffect(() => {
    if (!open) return;
    setCategory("PROCESS");
    setStartedAt(nowLocal());
    setEndedAt("");
    setReason("");
    setHeatId("__none");
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await logDelay({
        profitCenterId,
        heatId: heatId === "__none" ? null : heatId,
        category,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: endedAt ? new Date(endedAt).toISOString() : null,
        reason,
        createdBy: userId,
      });
      toast({ title: "Delay logged" });
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

  const reasonValid = reason.trim().length >= 3;
  const startValid = !!startedAt;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log delay</DialogTitle>
          <DialogDescription>Capture downtime against the workspace, optionally tied to a heat.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as CluDelayCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Started at *</Label>
              <Input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Ended at</Label>
              <Input type="datetime-local" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Linked heat (optional)</Label>
            <Select value={heatId} onValueChange={setHeatId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— none —</SelectItem>
                {heats.map((h) => (
                  <SelectItem key={h.id} value={h.id}>#{h.heatNumber}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Reason *</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Min 3 characters" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !reasonValid || !startValid}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Save delay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
