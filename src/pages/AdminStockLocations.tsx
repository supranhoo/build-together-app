import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { fetchStockLocations, upsertStockLocation, type StockLocation } from "@/lib/inventory";
import { createAuditLog } from "@/lib/workspace";
import { ProfitCenterSelectField } from "@/components/ProfitCenterSelectField";

interface FormState { id?: string; profitCenterId: string; code: string; name: string; isActive: boolean; }
const empty: FormState = { profitCenterId: "", code: "", name: "", isActive: true };

export default function AdminStockLocations() {
  const { activeProfitCenter, selectProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!activeProfitCenter) return;
    setLocations(await fetchStockLocations(activeProfitCenter.id));
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id]);

  const openNew = () => { setForm({ ...empty, profitCenterId: activeProfitCenter?.id ?? "" }); setOpen(true); };
  const openEdit = (l: StockLocation) => {
    setForm({ id: l.id, profitCenterId: l.profitCenterId ?? activeProfitCenter?.id ?? "", code: l.code, name: l.name, isActive: l.isActive });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (!form.profitCenterId) {
      toast({ title: "Profit Center mapping is mandatory", variant: "destructive" });
      return;
    }
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: "Code and name are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await upsertStockLocation({
        id: form.id,
        profitCenterId: form.profitCenterId,
        code: form.code,
        name: form.name,
        isActive: form.isActive,
      });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: form.profitCenterId,
        entityType: "stock_location",
        action: form.id ? "stock_location.updated" : "stock_location.created",
        changeSummary: { code: form.code, name: form.name, profit_center_id: form.profitCenterId },
      });
      const targetPcId = form.profitCenterId;
      const isCrossWorkspace = targetPcId !== activeProfitCenter.id;
      toast({
        title: "Stock location saved",
        description: isCrossWorkspace ? "Switched workspace to show the new record." : undefined,
      });
      setOpen(false);
      if (isCrossWorkspace) {
        selectProfitCenter(targetPcId);
      } else {
        await load();
      }
    } catch (error) {
      toast({ title: "Save failed", description: error instanceof Error ? error.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>Stock locations</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Stock locations — {activeProfitCenter.name}</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}>New location</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit location" : "New location"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <ProfitCenterSelectField
                value={form.profitCenterId}
                onChange={(v) => setForm({ ...form, profitCenterId: v })}
                disabled={Boolean(form.id)}
              />
              <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-3">
                <span>Active</span>
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {locations.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.code}</TableCell>
                <TableCell>{l.name}</TableCell>
                <TableCell>{l.isActive ? "Yes" : "No"}</TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => openEdit(l)}>Edit</Button></TableCell>
              </TableRow>
            ))}
            {locations.length === 0 && <TableRow><TableCell colSpan={4} className="text-muted-foreground">No stock locations yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
