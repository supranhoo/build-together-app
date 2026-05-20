import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/hooks/use-workspace";
import { parseCsv, toCsv, downloadCsv } from "@/lib/csv";
import {
  buildOpeningStockTemplateRows,
  parseOpeningStockCsv,
  type ParsedOpeningStockRow,
  type ParsedOpeningStockError,
} from "@/lib/opening-stock-csv";
import {
  commitOpeningStockBatch,
  createOpeningStockBatch,
  listMigrationBatches,
  listStagingRows,
  rollbackMigrationBatch,
  validateOpeningStockBatch,
  type MigrationBatch,
  type MigrationStagingRow,
} from "@/lib/migration";
import { AlertTriangle, Download, Upload, RotateCcw, CheckCircle2 } from "lucide-react";

const MAX_ROWS = 5000;

export default function AdminMigration() {
  const { activeProfitCenter, isAdmin } = useWorkspace();
  const { toast } = useToast();
  const pcId = activeProfitCenter?.id;

  const [batches, setBatches] = useState<MigrationBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Upload preview state
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<ParsedOpeningStockRow[]>([]);
  const [parsedErrors, setParsedErrors] = useState<ParsedOpeningStockError[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [batchLabel, setBatchLabel] = useState("Opening stock — go-live");

  // Inspect/commit dialog
  const [activeBatch, setActiveBatch] = useState<MigrationBatch | null>(null);
  const [stagingRows, setStagingRows] = useState<MigrationStagingRow[]>([]);
  const [rollbackReason, setRollbackReason] = useState("");

  async function refresh() {
    if (!pcId) return;
    setLoading(true);
    try {
      setBatches(await listMigrationBatches(pcId, "opening_stock"));
    } catch (e) {
      toast({
        title: "Failed to load batches",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pcId]);

  const totals = useMemo(() => {
    const c = batches.filter((b) => b.status === "committed").length;
    const r = batches.filter((b) => b.status === "rolled_back").length;
    const d = batches.filter((b) => b.status === "draft" || b.status === "validated").length;
    return { committed: c, rolledBack: r, drafts: d };
  }, [batches]);

  if (!isAdmin) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Admins only</AlertTitle>
        <AlertDescription>
          Data migration is restricted to admin and super-admin users.
        </AlertDescription>
      </Alert>
    );
  }

  if (!pcId) {
    return (
      <Alert>
        <AlertTitle>Select a workspace</AlertTitle>
        <AlertDescription>Pick an active profit center to run migrations.</AlertDescription>
      </Alert>
    );
  }

  const handleDownloadTemplate = () => {
    downloadCsv("opening-stock-template.csv", toCsv(buildOpeningStockTemplateRows()));
  };

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const raw = parseCsv(text);
      const dataRows = Math.max(0, raw.length - 1);
      if (dataRows > MAX_ROWS) {
        toast({
          title: "Too many rows",
          description: `Limit is ${MAX_ROWS} per file (got ${dataRows}). Split the file and re-upload.`,
          variant: "destructive",
        });
        return;
      }
      const parsed = parseOpeningStockCsv(raw);
      setParsedRows(parsed.rows);
      setParsedErrors(parsed.errors);
      setPreviewOpen(true);
    } catch (e) {
      toast({
        title: "Could not read CSV",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleStage = async () => {
    if (!pcId || parsedRows.length === 0) return;
    setBusy(true);
    try {
      const { batchId, stagedRows } = await createOpeningStockBatch({
        profitCenterId: pcId,
        label: batchLabel || "Opening stock",
        rows: parsedRows.map((r) => ({
          material_code: r.materialCode,
          stock_location_code: r.stockLocationCode,
          quantity: r.quantity,
          unit_cost: r.unitCost,
          legacy_ref: r.legacyRef,
          notes: r.notes,
        })),
      });
      const report = await validateOpeningStockBatch(batchId);
      toast({
        title: `Staged ${stagedRows} row(s)`,
        description: `${report.valid_rows} valid · ${report.invalid_rows} invalid · qty ${report.total_quantity}`,
      });
      setPreviewOpen(false);
      setParsedRows([]);
      setParsedErrors([]);
      await refresh();
    } catch (e) {
      toast({
        title: "Staging failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const openBatch = async (b: MigrationBatch) => {
    setActiveBatch(b);
    setRollbackReason("");
    try {
      setStagingRows(await listStagingRows(b.id));
    } catch (e) {
      toast({
        title: "Failed to load batch rows",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleRevalidate = async () => {
    if (!activeBatch) return;
    setBusy(true);
    try {
      await validateOpeningStockBatch(activeBatch.id);
      toast({ title: "Re-validated" });
      await refresh();
      setStagingRows(await listStagingRows(activeBatch.id));
      const next = (await listMigrationBatches(pcId!, "opening_stock")).find(
        (x) => x.id === activeBatch.id,
      );
      if (next) setActiveBatch(next);
    } catch (e) {
      toast({
        title: "Validate failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCommit = async () => {
    if (!activeBatch) return;
    if (!window.confirm(`Post ${activeBatch.dryRunReport?.valid_rows ?? 0} opening-balance rows to the ledger?`)) return;
    setBusy(true);
    try {
      const res = await commitOpeningStockBatch(activeBatch.id);
      toast({ title: `Posted ${res.rows_inserted} row(s)` });
      setActiveBatch(null);
      await refresh();
    } catch (e) {
      toast({
        title: "Commit failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRollback = async () => {
    if (!activeBatch) return;
    if (rollbackReason.trim().length < 3) {
      toast({ title: "Reason required (min 3 chars)", variant: "destructive" });
      return;
    }
    if (!window.confirm("Delete all ledger rows from this batch?")) return;
    setBusy(true);
    try {
      const res = await rollbackMigrationBatch(activeBatch.id, rollbackReason);
      toast({ title: `Rolled back ${res.rows_deleted} row(s)` });
      setActiveBatch(null);
      await refresh();
    } catch (e) {
      toast({
        title: "Rollback failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (s: MigrationBatch["status"]) => {
    const map: Record<MigrationBatch["status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      draft: { label: "Draft", variant: "outline" },
      validated: { label: "Validated", variant: "secondary" },
      committed: { label: "Committed", variant: "default" },
      rolled_back: { label: "Rolled back", variant: "destructive" },
      failed: { label: "Failed", variant: "destructive" },
    };
    const m = map[s];
    return <Badge variant={m.variant}>{m.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Data migration — Opening stock</h2>
        <p className="text-sm text-muted-foreground">
          Bulk-load opening balances per material × stock location for {activeProfitCenter?.name}.
          Posted as <code>opening_balance</code> movements in the inventory ledger; reversible
          until go-live is locked.
        </p>
      </div>

      <Alert>
        <AlertTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Workflow
        </AlertTitle>
        <AlertDescription className="text-xs">
          1. Download template → 2. Fill from legacy system → 3. Upload &amp; stage →
          4. Validate (server resolves codes &amp; reports errors) → 5. Commit. Rollback is
          available until you mark the workspace go-live.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
          <CardDescription>CSV up to {MAX_ROWS} rows per batch.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <div>
              <Label htmlFor="batch-label">Batch label</Label>
              <Input
                id="batch-label"
                value={batchLabel}
                onChange={(e) => setBatchLabel(e.target.value)}
                placeholder="Opening stock — go-live"
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={handleDownloadTemplate}>
                <Download className="mr-2 h-4 w-4" /> Template
              </Button>
            </div>
            <div className="flex items-end">
              <Button onClick={() => fileRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" /> Upload CSV
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Batches</CardTitle>
            <CardDescription>
              {totals.committed} committed · {totals.drafts} draft/validated ·{" "}
              {totals.rolledBack} rolled back
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No migration batches yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valid / Total</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.label}</TableCell>
                    <TableCell>{statusBadge(b.status)}</TableCell>
                    <TableCell className="text-right">
                      {b.dryRunReport?.valid_rows ?? "—"} / {b.dryRunReport?.total_rows ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {b.dryRunReport?.total_quantity ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(b.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openBatch(b)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preview — {parsedRows.length} row(s)</DialogTitle>
            <DialogDescription>
              Client-side parse only. Master-data resolution happens server-side during
              validate.
            </DialogDescription>
          </DialogHeader>
          {parsedErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>{parsedErrors.length} parse error(s)</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 max-h-32 list-disc overflow-auto pl-5 text-xs">
                  {parsedErrors.slice(0, 20).map((e, i) => (
                    <li key={i}>
                      Row {e.rowNumber}: {e.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {parsedRows.length > 0 && (
            <div className="max-h-72 overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.slice(0, 100).map((r) => (
                    <TableRow key={r.rowNumber}>
                      <TableCell>{r.rowNumber}</TableCell>
                      <TableCell>{r.materialCode}</TableCell>
                      <TableCell>{r.stockLocationCode}</TableCell>
                      <TableCell className="text-right">{r.quantity}</TableCell>
                      <TableCell className="text-right">{r.unitCost ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {parsedRows.length > 100 && (
                <p className="p-2 text-xs text-muted-foreground">
                  Showing first 100 of {parsedRows.length} rows.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStage} disabled={busy || parsedRows.length === 0}>
              Stage {parsedRows.length} row(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inspect / commit dialog */}
      <Dialog open={!!activeBatch} onOpenChange={(o) => !o && setActiveBatch(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {activeBatch?.label} {activeBatch && statusBadge(activeBatch.status)}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {activeBatch?.dryRunReport ? (
                <>
                  {activeBatch.dryRunReport.valid_rows} valid ·{" "}
                  {activeBatch.dryRunReport.invalid_rows} invalid · total qty{" "}
                  {activeBatch.dryRunReport.total_quantity} · total value{" "}
                  {activeBatch.dryRunReport.total_value}
                </>
              ) : (
                "Not yet validated."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stagingRows.map((r) => (
                  <TableRow key={r.id} className={r.validationErrors.length > 0 ? "bg-destructive/5" : ""}>
                    <TableCell>{r.rowNo}</TableCell>
                    <TableCell>{r.materialCode ?? "—"}</TableCell>
                    <TableCell>{r.stockLocationCode ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.quantity ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.validationErrors.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        r.validationErrors.join(", ")
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {activeBatch?.status === "committed" && (
            <div className="space-y-2">
              <Label htmlFor="rollback-reason">Rollback reason</Label>
              <Input
                id="rollback-reason"
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                placeholder="e.g. Wrong cut-over date"
              />
            </div>
          )}

          <DialogFooter className="gap-2">
            {activeBatch?.status !== "committed" && activeBatch?.status !== "rolled_back" && (
              <>
                <Button variant="outline" onClick={handleRevalidate} disabled={busy}>
                  Re-validate
                </Button>
                <Button
                  onClick={handleCommit}
                  disabled={busy || activeBatch?.status !== "validated"}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Commit to ledger
                </Button>
              </>
            )}
            {activeBatch?.status === "committed" && (
              <Button variant="destructive" onClick={handleRollback} disabled={busy}>
                <RotateCcw className="mr-2 h-4 w-4" /> Rollback batch
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
