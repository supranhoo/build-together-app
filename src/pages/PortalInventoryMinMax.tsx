import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/hooks/use-workspace";
import { useToast } from "@/hooks/use-toast";
import {
  computeStockBalances,
  fetchLedger,
  type InventoryLedgerEntry,
} from "@/lib/inventory";
import { fetchMasterItems, upsertMasterItem, type MasterItem } from "@/lib/master-data";
import { classifyStockStatus, type StockStatus } from "@/lib/inventory-min-max";
import { useAuth } from "@/hooks/use-auth";

interface EditState {
  min: string;
  max: string;
  reorder: string;
}

function statusBadge(s: StockStatus) {
  switch (s) {
    case "below_min": return <Badge variant="destructive">Below min</Badge>;
    case "reorder": return <Badge variant="secondary">Reorder</Badge>;
    case "over_max": return <Badge variant="outline">Over max</Badge>;
    case "ok": return <Badge variant="outline">OK</Badge>;
    case "unconfigured":
    default: return <Badge variant="outline" className="opacity-60">No thresholds</Badge>;
  }
}

export default function PortalInventoryMinMax() {
  const { activeProfitCenter, isAdmin, isSuperAdmin } = useWorkspace();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<MasterItem[]>([]);
  const [ledger, setLedger] = useState<InventoryLedgerEntry[]>([]);
  const [edit, setEdit] = useState<Record<string, EditState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const reload = async () => {
    if (!activeProfitCenter) return;
    try {
      const [m, le] = await Promise.all([
        fetchMasterItems(activeProfitCenter.id),
        fetchLedger(activeProfitCenter.id),
      ]);
      setItems(m); setLedger(le);
    } catch (e) {
      toast({ title: "Failed to load", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [activeProfitCenter?.id]);

  const balances = useMemo(() => computeStockBalances(ledger), [ledger]);
  const totalForItem = (id: string) =>
    balances.filter((b) => b.materialId === id).reduce((s, b) => s + b.quantity, 0);

  const canEdit = isAdmin || isSuperAdmin;

  const startEdit = (item: MasterItem) => {
    setEdit((prev) => ({
      ...prev,
      [item.id]: {
        min: item.minLevel?.toString() ?? "",
        max: item.maxLevel?.toString() ?? "",
        reorder: item.reorderLevel?.toString() ?? "",
      },
    }));
  };

  const saveEdit = async (item: MasterItem) => {
    const e = edit[item.id];
    if (!e) return;
    setSavingId(item.id);
    try {
      await upsertMasterItem({
        id: item.id,
        profitCenterId: item.profitCenterId,
        code: item.code,
        name: item.name,
        type: item.type,
        groupName: item.groupName,
        subgroup: item.subgroup,
        uom: item.uom,
        stdCost: item.stdCost,
        specs: item.specs,
        minLevel: e.min ? Number(e.min) : null,
        maxLevel: e.max ? Number(e.max) : null,
        reorderLevel: e.reorder ? Number(e.reorder) : null,
        isActive: item.isActive,
      });
      toast({ title: "Thresholds saved" });
      setEdit((prev) => { const next = { ...prev }; delete next[item.id]; return next; });
      await reload();
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader>
        <CardTitle>Min / Max stock thresholds</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead className="text-right">Min</TableHead>
              <TableHead className="text-right">Reorder</TableHead>
              <TableHead className="text-right">Max</TableHead>
              <TableHead>Status</TableHead>
              {canEdit && <TableHead className="w-32" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const qty = totalForItem(item.id);
              const status = classifyStockStatus(qty, {
                minLevel: item.minLevel,
                maxLevel: item.maxLevel,
                reorderLevel: item.reorderLevel,
              });
              const editing = edit[item.id];
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.code} — {item.name} ({item.uom})</TableCell>
                  <TableCell className="text-right">{qty.toFixed(3)}</TableCell>
                  <TableCell className="text-right">
                    {editing ? <Input className="h-8" type="number" step="0.001" value={editing.min} onChange={(e) => setEdit((p) => ({ ...p, [item.id]: { ...editing, min: e.target.value } }))} /> : (item.minLevel ?? "—")}
                  </TableCell>
                  <TableCell className="text-right">
                    {editing ? <Input className="h-8" type="number" step="0.001" value={editing.reorder} onChange={(e) => setEdit((p) => ({ ...p, [item.id]: { ...editing, reorder: e.target.value } }))} /> : (item.reorderLevel ?? "—")}
                  </TableCell>
                  <TableCell className="text-right">
                    {editing ? <Input className="h-8" type="number" step="0.001" value={editing.max} onChange={(e) => setEdit((p) => ({ ...p, [item.id]: { ...editing, max: e.target.value } }))} /> : (item.maxLevel ?? "—")}
                  </TableCell>
                  <TableCell>{statusBadge(status)}</TableCell>
                  {canEdit && (
                    <TableCell>
                      {editing ? (
                        <div className="flex gap-1">
                          <Button size="sm" disabled={savingId === item.id} onClick={() => void saveEdit(item)}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEdit((p) => { const n = { ...p }; delete n[item.id]; return n; })}>×</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => startEdit(item)}>Edit</Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {items.length === 0 && (
              <TableRow><TableCell colSpan={canEdit ? 7 : 6} className="text-muted-foreground">No items configured.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
