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
import { supabase } from "@/integrations/supabase/client";
import { fetchMaterials, fetchStockLocations, type Material, type StockLocation } from "@/lib/inventory";
import { fetchPermissionGrants, userRoleAllows, type PermissionGrant } from "@/lib/permissions";

const client = supabase as unknown as { from: (t: string) => any };

/**
 * Stock transfer between two locations within the same workspace.
 * Writes a `transfer_out` (negative qty) at the source and a `transfer_in`
 * (positive qty) at the destination, both linked by a shared reference_id
 * (uuid generated client-side) so they can be paired in the ledger view.
 *
 * Note: this is not atomic. If the second insert fails, an admin must
 * compensate via the ledger reversal flow.
 */
export default function PortalInventoryTransfers() {
  const { activeProfitCenter } = useWorkspace();
  const { session, profile } = useAuth();
  const { toast } = useToast();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [grants, setGrants] = useState<PermissionGrant[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [fromLoc, setFromLoc] = useState("");
  const [toLoc, setToLoc] = useState("");
  const [quantity, setQuantity] = useState("");
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

  const allowed = userRoleAllows(grants, (profile as any)?.role, "inventory", "adjustment");

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (!materialId || !fromLoc || !toLoc) {
      toast({ title: "Material and both locations required", variant: "destructive" }); return;
    }
    if (fromLoc === toLoc) {
      toast({ title: "Source and destination must differ", variant: "destructive" }); return;
    }
    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) {
      toast({ title: "Quantity must be > 0", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const refId = crypto.randomUUID();
      const base = {
        profit_center_id: activeProfitCenter.id,
        material_id: materialId,
        reference_type: "transfer",
        reference_id: refId,
        notes: notes || null,
        created_by: session.user.id,
      };
      const { error: outErr } = await client.from("inventory_ledger").insert({
        ...base, stock_location_id: fromLoc, movement_type: "transfer_out", quantity: -Math.abs(q),
      });
      if (outErr) throw outErr;
      const { error: inErr } = await client.from("inventory_ledger").insert({
        ...base, stock_location_id: toLoc, movement_type: "transfer_in", quantity: Math.abs(q),
      });
      if (inErr) throw inErr;
      toast({ title: "Transfer posted" });
      setMaterialId(""); setFromLoc(""); setToLoc(""); setQuantity(""); setNotes("");
    } catch (e) {
      toast({ title: "Transfer failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) {
    return (
      <Card><CardHeader><CardTitle>Transfers</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Your role does not have permission to transfer stock in this workspace.</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader><CardTitle>Inter-location transfer</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Material</Label>
            <MaterialPicker
              contextKey="inventory.transfer"
              profitCenterId={activeProfitCenter?.id ?? null}
              materials={materials}
              value={materialId}
              onChange={setMaterialId}
            />
          </div>
          <div>
            <Label>Quantity</Label>
            <Input type="number" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div>
            <Label>From location</Label>
            <Select value={fromLoc} onValueChange={setFromLoc}>
              <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                {locations.filter((l) => l.isActive).map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>To location</Label>
            <Select value={toLoc} onValueChange={setToLoc}>
              <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
              <SelectContent>
                {locations.filter((l) => l.isActive).map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.code} — {l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => void handleSave()} disabled={saving}>{saving ? "Posting…" : "Post transfer"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
