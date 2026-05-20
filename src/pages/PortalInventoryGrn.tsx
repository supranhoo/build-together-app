import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MaterialPicker } from "@/components/MaterialPicker";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  fetchMaterials,
  fetchStockLocations,
  type Material,
  type StockLocation,
} from "@/lib/inventory";
import { fetchPermissionGrants, userRoleAllows, type PermissionGrant } from "@/lib/permissions";
import { fetchGrnLogs, postGrn, type GrnRecord } from "@/lib/grn";
import { parseGrnCsv, buildGrnTemplateRows, type ParsedGrnRow, type ParsedGrnError } from "@/lib/grn-csv";
import { parseCsv, toCsv, downloadCsv } from "@/lib/csv";

const MAX_BULK_ROWS = 500;

interface FormState {
  materialId: string;
  stockLocationId: string;
  quantity: string;
  unitCost: string;
  vendor: string;
  invoiceNo: string;
  mnPct: string;
  fePct: string;
  moisturePct: string;
  notes: string;
}

const empty: FormState = {
  materialId: "", stockLocationId: "", quantity: "", unitCost: "",
  vendor: "", invoiceNo: "", mnPct: "", fePct: "", moisturePct: "", notes: "",
};

export default function PortalInventoryGrn() {
  const { activeProfitCenter } = useWorkspace();
  const { session, profile } = useAuth();
  const { toast } = useToast();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [grns, setGrns] = useState<GrnRecord[]>([]);
  const [grants, setGrants] = useState<PermissionGrant[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    if (!activeProfitCenter) return;
    try {
      const [m, l, g, p] = await Promise.all([
        fetchMaterials(activeProfitCenter.id),
        fetchStockLocations(activeProfitCenter.id),
        fetchGrnLogs(activeProfitCenter.id),
        fetchPermissionGrants(),
      ]);
      setMaterials(m); setLocations(l); setGrns(g); setGrants(p);
    } catch (e) {
      toast({ title: "Failed to load GRNs", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id]);

  const allowed = useMemo(() => userRoleAllows(grants, (profile as any)?.role, "inventory", "receipt"), [grants, profile]);
  const matLabel = (id: string) => {
    const m = materials.find((x) => x.id === id);
    return m ? `${m.code} (${m.uom})` : "—";
  };

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (!form.materialId || !form.stockLocationId) {
      toast({ title: "Material and location required", variant: "destructive" });
      return;
    }
    const q = Number(form.quantity);
    if (!Number.isFinite(q) || q <= 0) {
      toast({ title: "Quantity must be > 0", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await postGrn({
        profitCenterId: activeProfitCenter.id,
        materialId: form.materialId,
        stockLocationId: form.stockLocationId,
        quantity: q,
        unitCost: form.unitCost ? Number(form.unitCost) : null,
        createdBy: session.user.id,
        quality: {
          vendor: form.vendor.trim() || null,
          invoiceNo: form.invoiceNo.trim() || null,
          mnPct: form.mnPct ? Number(form.mnPct) : null,
          fePct: form.fePct ? Number(form.fePct) : null,
          moisturePct: form.moisturePct ? Number(form.moisturePct) : null,
          notes: form.notes.trim() || null,
        },
      });
      toast({ title: "GRN posted" });
      setOpen(false); setForm(empty);
      await reload();
    } catch (e) {
      toast({ title: "GRN failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>GRN (Inward) — quality records</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={!allowed || materials.length === 0 || locations.length === 0}>New GRN</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>Post GRN</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Material</Label>
                <MaterialPicker
                  contextKey="inventory.grn"
                  profitCenterId={activeProfitCenter?.id ?? null}
                  materials={materials}
                  value={form.materialId}
                  onChange={(v) => setForm({ ...form, materialId: v })}
                />
              </div>
              <div>
                <Label>Location</Label>
                <Select value={form.stockLocationId} onValueChange={(v) => setForm({ ...form, stockLocationId: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                  <SelectContent>
                    {locations.filter((l) => l.isActive).map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantity</Label>
                <Input type="number" step="0.001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div>
                <Label>Unit cost</Label>
                <Input type="number" step="0.01" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} />
              </div>
              <div>
                <Label>Vendor</Label>
                <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
              </div>
              <div>
                <Label>Invoice #</Label>
                <Input value={form.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} />
              </div>
              <div>
                <Label>Mn %</Label>
                <Input type="number" step="0.01" value={form.mnPct} onChange={(e) => setForm({ ...form, mnPct: e.target.value })} />
              </div>
              <div>
                <Label>Fe %</Label>
                <Input type="number" step="0.01" value={form.fePct} onChange={(e) => setForm({ ...form, fePct: e.target.value })} />
              </div>
              <div>
                <Label>Moisture %</Label>
                <Input type="number" step="0.01" value={form.moisturePct} onChange={(e) => setForm({ ...form, moisturePct: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleSave()} disabled={saving}>{saving ? "Posting…" : "Post GRN"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead className="text-right">Mn %</TableHead>
              <TableHead className="text-right">Fe %</TableHead>
              <TableHead className="text-right">Moisture %</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grns.map((g) => (
              <TableRow key={g.id}>
                <TableCell>{new Date(g.createdAt).toLocaleString()}</TableCell>
                <TableCell>{g.vendor ?? "—"}</TableCell>
                <TableCell>{g.invoiceNo ?? "—"}</TableCell>
                <TableCell className="text-right">{g.mnPct ?? "—"}</TableCell>
                <TableCell className="text-right">{g.fePct ?? "—"}</TableCell>
                <TableCell className="text-right">{g.moisturePct ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{g.notes ?? ""}</TableCell>
              </TableRow>
            ))}
            {grns.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-muted-foreground">No GRN records yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
