import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  fetchLedger,
  fetchMaterials,
  fetchStockLocations,
  type InventoryLedgerEntry,
  type Material,
  type MovementType,
  type StockLocation,
} from "@/lib/inventory";
import {
  bulkReverseInventoryLedger,
  reverseInventoryLedger,
  userCanAct,
} from "@/lib/reporting";

const MOVEMENTS: Array<{ value: MovementType | "all"; label: string }> = [
  { value: "all", label: "All movements" },
  { value: "receipt", label: "Receipts" },
  { value: "consumption", label: "Consumption" },
  { value: "adjustment", label: "Adjustments" },
  { value: "transfer_in", label: "Transfers in" },
  { value: "transfer_out", label: "Transfers out" },
];

type PendingAction =
  | { kind: "single"; id: string }
  | { kind: "bulk"; ids: string[] }
  | null;

export default function PortalInventoryLedger() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [ledger, setLedger] = useState<InventoryLedgerEntry[]>([]);
  const [filterMaterial, setFilterMaterial] = useState<string>("all");
  const [filterMovement, setFilterMovement] = useState<MovementType | "all">("all");
  const [filterDate, setFilterDate] = useState<string>("");
  const [canReverse, setCanReverse] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!activeProfitCenter) return;
    try {
      const [m, l, le] = await Promise.all([
        fetchMaterials(activeProfitCenter.id),
        fetchStockLocations(activeProfitCenter.id),
        fetchLedger(activeProfitCenter.id, {
          materialId: filterMaterial !== "all" ? filterMaterial : undefined,
          movementType: filterMovement !== "all" ? filterMovement : undefined,
          date: filterDate || undefined,
        }),
      ]);
      setMaterials(m);
      setLocations(l);
      setLedger(le);
      setSelectedIds(new Set());
    } catch (e) {
      toast({ title: "Failed to load ledger", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfitCenter?.id, filterMaterial, filterMovement, filterDate]);

  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;
    (async () => {
      const ok = await userCanAct(session.user.id, "inventory", "void");
      if (!cancelled) setCanReverse(ok);
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const matLabel = (id: string) => {
    const m = materials.find((x) => x.id === id);
    return m ? `${m.code} (${m.uom})` : "—";
  };
  const locLabel = (id: string) => locations.find((x) => x.id === id)?.code ?? "—";

  // Reversals are only valid for non-reversal rows.
  const isReversible = (e: InventoryLedgerEntry) => e.referenceType !== "reversal";

  const reversibleIds = useMemo(() => ledger.filter(isReversible).map((e) => e.id), [ledger]);
  const allSelected = reversibleIds.length > 0 && reversibleIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(reversibleIds) : new Set());
  };
  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const confirmAction = async () => {
    if (!pending) return;
    if (reason.trim().length < 3) {
      toast({ title: "Reason required", description: "Enter at least 3 characters.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      if (pending.kind === "single") {
        await reverseInventoryLedger(pending.id, reason.trim());
        toast({ title: "Entry reversed" });
      } else {
        const result = await bulkReverseInventoryLedger(pending.ids, reason.trim());
        if (!result.ok) {
          throw new Error(result.error ?? "bulk_failed");
        }
        toast({ title: `Reversed ${result.succeeded ?? pending.ids.length} entries` });
      }
      setPending(null);
      setReason("");
      await reload();
    } catch (err) {
      toast({ title: "Reversal failed", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (!activeProfitCenter) {
    return <Card><CardHeader><CardTitle>Inventory ledger</CardTitle></CardHeader><CardContent className="text-muted-foreground">Select a workspace first.</CardContent></Card>;
  }

  const showActions = canReverse;
  const colSpan = 7 + (showActions ? 2 : 0);

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Inventory ledger — {activeProfitCenter.name}</CardTitle>
        <Button asChild variant="outline"><Link to="/portal/inventory">Back</Link></Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Select value={filterMaterial} onValueChange={setFilterMaterial}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All materials</SelectItem>
              {materials.map((m) => <SelectItem key={m.id} value={m.id}>{m.code}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterMovement} onValueChange={(v) => setFilterMovement(v as MovementType | "all")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MOVEMENTS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
        </div>

        {showActions && selectedIds.size > 0 && (
          <div className="flex items-center justify-between rounded-md border border-border bg-panel px-4 py-2">
            <p className="text-sm">{selectedIds.size} selected</p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
              <Button size="sm" variant="destructive" onClick={() => setPending({ kind: "bulk", ids: Array.from(selectedIds) })}>
                Reverse {selectedIds.size} selected
              </Button>
            </div>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              {showActions && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(v) => toggleAll(v === true)}
                    aria-label="Select all reversible rows"
                  />
                </TableHead>
              )}
              <TableHead>When</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Material</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Notes</TableHead>
              {showActions && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledger.map((e) => {
              const reversible = isReversible(e);
              return (
                <TableRow key={e.id}>
                  {showActions && (
                    <TableCell className="w-10">
                      {reversible ? (
                        <Checkbox
                          checked={selectedIds.has(e.id)}
                          onCheckedChange={(v) => toggleOne(e.id, v === true)}
                          aria-label={`Select row ${e.id}`}
                        />
                      ) : null}
                    </TableCell>
                  )}
                  <TableCell>{new Date(e.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{e.movementType}</TableCell>
                  <TableCell>{matLabel(e.materialId)}</TableCell>
                  <TableCell>{locLabel(e.stockLocationId)}</TableCell>
                  <TableCell className={`text-right ${e.quantity < 0 ? "text-destructive" : ""}`}>{e.quantity.toFixed(3)}</TableCell>
                  <TableCell className="text-muted-foreground">{e.referenceType ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{e.notes ?? ""}</TableCell>
                  {showActions && (
                    <TableCell className="w-10">
                      {reversible ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" aria-label="Row actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={(ev) => { ev.preventDefault(); setPending({ kind: "single", id: e.id }); }}>
                              Reverse entry
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {ledger.length === 0 && <TableRow><TableCell colSpan={colSpan} className="text-muted-foreground">No ledger entries in scope.</TableCell></TableRow>}
          </TableBody>
        </Table>

        <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) { setPending(null); setReason(""); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pending?.kind === "bulk" ? `Reverse ${pending.ids.length} entries?` : "Reverse this entry?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Reversals are additive — the ledger remains immutable. The same reason is recorded against every selected entry, grouped by a shared batch identifier in the audit log. This action is permanent.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea
              placeholder="Reason (required, min 3 characters)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy || reason.trim().length < 3}
                onClick={(ev) => { ev.preventDefault(); void confirmAction(); }}
              >
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
