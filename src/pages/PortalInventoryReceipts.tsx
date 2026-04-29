import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MaterialPicker } from "@/components/MaterialPicker";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  createReceipt,
  fetchMaterials,
  fetchStockLocations,
  type Material,
  type StockLocation,
} from "@/lib/inventory";
import { fetchPermissionGrants, userRoleAllows, type PermissionGrant } from "@/lib/permissions";

export default function PortalInventoryReceipts() {
  const { activeProfitCenter } = useWorkspace();
  const { session, profile } = useAuth();
  const { toast } = useToast();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [grants, setGrants] = useState<PermissionGrant[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [stockLocationId, setStockLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeProfitCenter) return;
    Promise.all([
      fetchMaterials(activeProfitCenter.id),
      fetchStockLocations(activeProfitCenter.id),
      fetchPermissionGrants(),
    ])
      .then(([m, l, g]) => { setMaterials(m); setLocations(l); setGrants(g); })
      .catch((e) => toast({ title: "Failed to load", description: e instanceof Error ? e.message : "", variant: "destructive" }));
  }, [activeProfitCenter?.id, toast]);

  const allowed = userRoleAllows(grants, (profile as any)?.role, "inventory", "receipt");

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (!materialId || !stockLocationId) {
      toast({ title: "Material and location are required", variant: "destructive" });
      return;
    }
    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) {
      toast({ title: "Quantity must be a positive number", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createReceipt({
        profitCenterId: activeProfitCenter.id,
        materialId,
        stockLocationId,
        quantity: q,
        unitCost: unitCost ? Number(unitCost) : null,
        notes: notes || null,
        createdBy: session.user.id,
      });
      toast({ title: "Receipt posted" });
      setMaterialId(""); setStockLocationId(""); setQuantity(""); setUnitCost(""); setNotes("");
    } catch (e) {
      toast({ title: "Receipt failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>New receipt</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }

  if (!allowed) {
    return (
      <Card className="border-border bg-card shadow-panel">
        <CardHeader><CardTitle>New receipt</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Your role does not have permission to post inventory receipts in this workspace.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader>
        <CardTitle>New receipt — {activeProfitCenter.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Material</Label>
            <MaterialPicker
              contextKey="inventory.receipt"
              profitCenterId={activeProfitCenter.id}
              materials={materials}
              value={materialId}
              onChange={setMaterialId}
            />
          </div>
          <div>
            <Label>Stock location</Label>
            <Select value={stockLocationId} onValueChange={setStockLocationId}>
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
            <Input type="number" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div>
            <Label>Unit cost (optional)</Label>
            <Input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => void handleSave()} disabled={saving}>{saving ? "Posting…" : "Post receipt"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
