import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { fetchMaterials, fetchStockLocations, type Material, type StockLocation } from "@/lib/inventory";
import { fetchPermissionGrants, userRoleAllows, type PermissionGrant } from "@/lib/permissions";

const client = supabase as unknown as { from: (t: string) => any };

/**
 * Manual issue (outward consumption not tied to a heat log).
 * Writes a single inventory_ledger row with movement_type=consumption and
 * reference_type=manual_issue. Quantity is stored as negative.
 */
export default function PortalInventoryIssue() {
  const { activeProfitCenter } = useWorkspace();
  const { session, profile } = useAuth();
  const { toast } = useToast();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [grants, setGrants] = useState<PermissionGrant[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [stockLocationId, setStockLocationId] = useState("");
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

  const allowed = userRoleAllows(grants, (profile as any)?.role, "inventory", "consume");

  const handleSave = async () => {
    if (!activeProfitCenter || !session?.user) return;
    if (!materialId || !stockLocationId) {
      toast({ title: "Material and location required", variant: "destructive" }); return;
    }
    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) {
      toast({ title: "Quantity must be > 0", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const { error } = await client.from("inventory_ledger").insert({
        profit_center_id: activeProfitCenter.id,
        material_id: materialId,
        stock_location_id: stockLocationId,
        movement_type: "consumption",
        quantity: -Math.abs(q),
        reference_type: "manual_issue",
        notes: notes || null,
        created_by: session.user.id,
      });
      if (error) throw error;
      toast({ title: "Issue posted" });
      setMaterialId(""); setStockLocationId(""); setQuantity(""); setNotes("");
    } catch (e) {
      toast({ title: "Issue failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) {
    return (
      <Card><CardHeader><CardTitle>Issue (Outward)</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Your role does not have permission to issue stock in this workspace.</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader><CardTitle>Manual issue</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Material</Label>
            <Select value={materialId} onValueChange={setMaterialId}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {materials.filter((m) => m.isActive).map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.code} — {m.name} ({m.uom})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Location</Label>
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
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => void handleSave()} disabled={saving}>{saving ? "Posting…" : "Post issue"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
