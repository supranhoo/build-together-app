/**
 * Admin Selling Prices editor — Phase C.
 *
 * Append-only per-grade selling price (₹/MT) with effective dates.
 * Feeds the Profitability tab. Currency defaults to INR; FX wiring is Phase D.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { createAuditLog } from "@/lib/workspace";
import {
  createSellingPrice,
  deactivateSellingPrice,
  fetchSellingPrices,
  type SellingPrice,
} from "@/lib/finance";

interface FormState {
  grade: string;
  product: string;
  pricePerMt: string;
  currencyCode: string;
  effectiveFrom: string;
  effectiveTo: string;
  notes: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const empty = (): FormState => ({
  grade: "", product: "", pricePerMt: "", currencyCode: "INR",
  effectiveFrom: today(), effectiveTo: "", notes: "",
});

export default function AdminSellingPrices() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [prices, setPrices] = useState<SellingPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty());
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const load = async () => {
    if (!activeProfitCenter) return;
    setLoading(true);
    try { setPrices(await fetchSellingPrices(activeProfitCenter.id)); }
    catch (e) { toast({ title: "Failed to load prices", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeProfitCenter?.id]);

  const filtered = useMemo(() => prices.filter((p) => showInactive || p.isActive), [prices, showInactive]);

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (!form.grade.trim()) { toast({ title: "Grade required", variant: "destructive" }); return; }
    const price = Number(form.pricePerMt);
    if (!Number.isFinite(price) || price < 0) { toast({ title: "Price must be ≥ 0", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const created = await createSellingPrice({
        profitCenterId: activeProfitCenter.id,
        grade: form.grade.trim(),
        product: form.product.trim() || null,
        pricePerMt: price,
        currencyCode: form.currencyCode.trim() || "INR",
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || null,
        notes: form.notes.trim() || null,
        createdBy: session.user.id,
      });
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "selling_prices",
        entityId: created.id,
        action: "selling_price.created",
        changeSummary: { grade: created.grade, price: created.pricePerMt, effective_from: created.effectiveFrom },
      });
      toast({ title: "Selling price added" });
      setOpen(false); setForm(empty()); await load();
    } catch (e) { toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDeactivate = async (row: SellingPrice) => {
    if (!session?.user || !activeProfitCenter) return;
    if (!confirm(`Deactivate selling price for ${row.grade}?`)) return;
    try {
      await deactivateSellingPrice(row.id);
      await createAuditLog({
        actorUserId: session.user.id,
        profitCenterId: activeProfitCenter.id,
        entityType: "selling_prices",
        entityId: row.id,
        action: "selling_price.deactivated",
        changeSummary: { grade: row.grade },
      });
      toast({ title: "Selling price deactivated" });
      await load();
    } catch (e) { toast({ title: "Deactivate failed", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
  };

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>Selling Prices</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Selling Prices — {activeProfitCenter.name}</CardTitle>
          <CardDescription>
            Per-grade selling price (₹/MT). Drives the Profitability tab. Append-only — supersede a price by adding a new row with a later effective date.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={showInactive ? "default" : "outline"} onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? "Hiding none" : "Show inactive"}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button>New price</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New selling price</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Grade</Label>
                  <Input placeholder="e.g. Si-Mn-65" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
                </div>
                <div>
                  <Label>Product (optional)</Label>
                  <Input value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} />
                </div>
                <div>
                  <Label>Price per MT</Label>
                  <Input type="number" step="0.01" value={form.pricePerMt} onChange={(e) => setForm({ ...form, pricePerMt: e.target.value })} />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Input value={form.currencyCode} onChange={(e) => setForm({ ...form, currencyCode: e.target.value.toUpperCase() })} />
                </div>
                <div>
                  <Label>Effective from</Label>
                  <Input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
                </div>
                <div>
                  <Label>Effective to (optional)</Label>
                  <Input type="date" value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label>Notes</Label>
                  <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving…" : "Add price"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Grade</TableHead>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Price / MT</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead>Effective from</TableHead>
            <TableHead>Effective to</TableHead>
            <TableHead>Status</TableHead>
            <TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={8} className="text-muted-foreground">Loading…</TableCell></TableRow>}
            {!loading && filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.grade}</TableCell>
                <TableCell>{p.product ?? "—"}</TableCell>
                <TableCell className="text-right">{p.pricePerMt.toLocaleString()}</TableCell>
                <TableCell>{p.currencyCode}</TableCell>
                <TableCell>{p.effectiveFrom}</TableCell>
                <TableCell>{p.effectiveTo ?? "—"}</TableCell>
                <TableCell>{p.isActive ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                <TableCell>{p.isActive && <Button size="sm" variant="ghost" onClick={() => void handleDeactivate(p)}>Deactivate</Button>}</TableCell>
              </TableRow>
            ))}
            {!loading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-muted-foreground">No selling prices yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
