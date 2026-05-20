import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
} from "@/lib/opening-stock-csv";
import { buildOpenPoTemplateRows, parseOpenPoCsv } from "@/lib/open-po-csv";
import { buildOpenSoTemplateRows, parseOpenSoCsv } from "@/lib/open-so-csv";
import {
  buildGrnHistoryTemplateRows,
  parseGrnHistoryCsv,
} from "@/lib/grn-history-csv";
import {
  buildHeatHeaderTemplateRows,
  buildHeatConsumptionTemplateRows,
  parseHeatHeaderCsv,
  parseHeatConsumptionCsv,
} from "@/lib/heat-history-csv";
import {
  buildAdjustmentTemplateRows,
  parseAdjustmentCsv,
} from "@/lib/adjustment-csv";
import {
  commitOpenPoBatch,
  commitOpenSoBatch,
  commitOpeningStockBatch,
  createOpenPoBatch,
  createOpenSoBatch,
  createOpeningStockBatch,
  listMigrationBatches,
  listStagingRows,
  rollbackMigrationBatch,
  validateOpenPoBatch,
  validateOpenSoBatch,
  validateOpeningStockBatch,
  createGrnHistoryBatch,
  validateGrnHistoryBatch,
  commitGrnHistoryBatch,
  createHeatHistoryBatch,
  validateHeatHistoryBatch,
  commitHeatHistoryBatch,
  createAdjustmentBatch,
  validateAdjustmentBatch,
  commitAdjustmentBatch,
  type MigrationBatch,
  type MigrationDomain,
  type MigrationStagingRow,
} from "@/lib/migration";
import { AlertTriangle, Download, Upload } from "lucide-react";

const MAX_ROWS = 5000;

interface DomainConfig {
  key: MigrationDomain;
  label: string;
  description: string;
  templateName: string;
  buildTemplate: () => string[][];
  parseCsv: (rows: string[][]) => { rows: any[]; errors: Array<{ rowNumber: number; message: string }> };
  toRpcRow: (parsed: any) => Record<string, unknown>;
  create: (pcId: string, label: string, rows: Array<Record<string, unknown>>) => Promise<{ batchId: string; stagedRows: number }>;
  validate: (batchId: string) => Promise<any>;
  commit: (batchId: string) => Promise<any>;
  primaryHeader: string;
  secondaryHeader: string;
  qtyHeader: string;
}

const DOMAINS: DomainConfig[] = [
  {
    key: "opening_stock",
    label: "Opening stock",
    description:
      "Per material × stock location balances as on cut-over. Posts opening_balance movements to the inventory ledger.",
    templateName: "opening-stock-template.csv",
    buildTemplate: buildOpeningStockTemplateRows,
    parseCsv: parseOpeningStockCsv,
    toRpcRow: (r) => ({
      material_code: r.materialCode,
      stock_location_code: r.stockLocationCode,
      quantity: r.quantity,
      unit_cost: r.unitCost,
      legacy_ref: r.legacyRef,
      notes: r.notes,
    }),
    create: (pcId, label, rows) =>
      createOpeningStockBatch({ profitCenterId: pcId, label, rows: rows as any }),
    validate: validateOpeningStockBatch,
    commit: (id) => commitOpeningStockBatch(id),
    primaryHeader: "Material",
    secondaryHeader: "Location",
    qtyHeader: "Qty",
  },
  {
    key: "open_po",
    label: "Open POs",
    description:
      "Purchase orders still open at cut-over (one row per PO line). Header is taken from the first row of each po_number.",
    templateName: "open-po-template.csv",
    buildTemplate: buildOpenPoTemplateRows,
    parseCsv: parseOpenPoCsv,
    toRpcRow: (r) => ({
      po_number: r.poNumber,
      supplier_code: r.supplierCode,
      po_status: r.poStatus,
      currency_code: r.currencyCode,
      expected_delivery_date: r.expectedDeliveryDate,
      payment_terms: r.paymentTerms,
      header_notes: r.headerNotes,
      line_no: r.lineNo,
      material_code: r.materialCode,
      qty_ordered: r.qtyOrdered,
      qty_received: r.qtyReceived,
      uom: r.uom,
      unit_cost: r.unitCost,
      line_notes: r.lineNotes,
      legacy_ref: r.legacyRef,
    }),
    create: (pcId, label, rows) => createOpenPoBatch({ profitCenterId: pcId, label, rows }),
    validate: validateOpenPoBatch,
    commit: commitOpenPoBatch,
    primaryHeader: "PO · Material",
    secondaryHeader: "Supplier",
    qtyHeader: "Qty ordered",
  },
  {
    key: "open_so",
    label: "Open SOs",
    description:
      "Sales orders not fully dispatched at cut-over. open_qty_mt represents the remaining balance only.",
    templateName: "open-so-template.csv",
    buildTemplate: buildOpenSoTemplateRows,
    parseCsv: parseOpenSoCsv,
    toRpcRow: (r) => ({
      so_number: r.soNumber,
      customer_code: r.customerCode,
      order_date: r.orderDate,
      is_export: r.isExport,
      product: r.product,
      grade: r.grade,
      open_qty_mt: r.openQtyMt,
      price_per_mt: r.pricePerMt,
      currency_code: r.currencyCode,
      fx_rate: r.fxRate,
      incoterms: r.incoterms,
      port_of_loading: r.portOfLoading,
      port_of_discharge: r.portOfDischarge,
      so_status: r.soStatus,
      notes: r.notes,
      legacy_ref: r.legacyRef,
    }),
    create: (pcId, label, rows) => createOpenSoBatch({ profitCenterId: pcId, label, rows }),
    validate: validateOpenSoBatch,
    commit: commitOpenSoBatch,
    primaryHeader: "SO · Product",
    secondaryHeader: "Customer",
    qtyHeader: "Open qty (MT)",
  },
  {
    key: "grn_history",
    label: "Historical GRN",
    description:
      "Back-loaded goods receipt notes. Each row writes a paired inventory_ledger receipt + grn_logs record dated at receipt_date.",
    templateName: "grn-history-template.csv",
    buildTemplate: buildGrnHistoryTemplateRows,
    parseCsv: parseGrnHistoryCsv,
    toRpcRow: (r) => ({
      receipt_date: r.receiptDate,
      material_code: r.materialCode,
      stock_location_code: r.stockLocationCode,
      quantity: r.quantity,
      unit_cost: r.unitCost,
      vendor: r.vendor,
      invoice_no: r.invoiceNo,
      mn_pct: r.mnPct,
      fe_pct: r.fePct,
      moisture_pct: r.moisturePct,
      notes: r.notes,
      legacy_ref: r.legacyRef,
    }),
    create: (pcId, label, rows) => createGrnHistoryBatch({ profitCenterId: pcId, label, rows }),
    validate: validateGrnHistoryBatch,
    commit: commitGrnHistoryBatch,
    primaryHeader: "Material",
    secondaryHeader: "Location",
    qtyHeader: "Qty",
  },
  {
    key: "inv_adjustment",
    label: "Adjustments / issues",
    description:
      "Free-form inventory ledger entries (adjustments, issues, transfers). Quantity is signed; the value is stored as-given.",
    templateName: "inventory-adjustment-template.csv",
    buildTemplate: buildAdjustmentTemplateRows,
    parseCsv: parseAdjustmentCsv,
    toRpcRow: (r) => ({
      ledger_date: r.ledgerDate,
      material_code: r.materialCode,
      stock_location_code: r.stockLocationCode,
      movement_type: r.movementType,
      quantity: r.quantity,
      unit_cost: r.unitCost,
      notes: r.notes,
      legacy_ref: r.legacyRef,
    }),
    create: (pcId, label, rows) =>
      createAdjustmentBatch({ profitCenterId: pcId, label, rows }),
    validate: validateAdjustmentBatch,
    commit: commitAdjustmentBatch,
    primaryHeader: "Material",
    secondaryHeader: "Location · Type",
    qtyHeader: "Qty (signed)",
  },
];

export default function AdminMigration() {
  const { activeProfitCenter, isAdmin } = useWorkspace();
  const [domainKey, setDomainKey] = useState<MigrationDomain>("opening_stock");
  const domain = DOMAINS.find((d) => d.key === domainKey)!;

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

  if (!activeProfitCenter?.id) {
    return (
      <Alert>
        <AlertTitle>Select a workspace</AlertTitle>
        <AlertDescription>Pick an active profit center to run migrations.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Data migration</h2>
        <p className="text-sm text-muted-foreground">
          Bulk-load legacy data for <strong>{activeProfitCenter.name}</strong>. All commits are
          batch-scoped, audit-logged, and reversible until go-live is locked.
        </p>
      </div>

      <Tabs value={domainKey} onValueChange={(v) => setDomainKey(v as MigrationDomain)}>
        <TabsList>
          {DOMAINS.map((d) => (
            <TabsTrigger key={d.key} value={d.key}>
              {d.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="heat_history">Historical heats</TabsTrigger>
        </TabsList>
        {DOMAINS.map((d) => (
          <TabsContent key={d.key} value={d.key} className="space-y-6 mt-4">
            <DomainPanel domain={d} pcId={activeProfitCenter.id} pcName={activeProfitCenter.name} />
          </TabsContent>
        ))}
        <TabsContent value="heat_history" className="space-y-6 mt-4">
          <HeatHistoryPanel pcId={activeProfitCenter.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DomainPanel({
  domain,
  pcId,
}: {
  domain: DomainConfig;
  pcId: string;
  pcName: string;
}) {
  const { toast } = useToast();
  const [batches, setBatches] = useState<MigrationBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [parsedErrors, setParsedErrors] = useState<Array<{ rowNumber: number; message: string }>>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [batchLabel, setBatchLabel] = useState(`${domain.label} — go-live`);

  const [activeBatch, setActiveBatch] = useState<MigrationBatch | null>(null);
  const [stagingRows, setStagingRows] = useState<MigrationStagingRow[]>([]);
  const [rollbackReason, setRollbackReason] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setBatches(await listMigrationBatches(pcId, domain.key));
    } catch (e) {
      toast({
        title: "Failed to load batches",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [pcId, domain.key, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totals = useMemo(() => {
    const c = batches.filter((b) => b.status === "committed").length;
    const r = batches.filter((b) => b.status === "rolled_back").length;
    const d = batches.filter((b) => b.status === "draft" || b.status === "validated").length;
    return { committed: c, rolledBack: r, drafts: d };
  }, [batches]);

  const handleDownloadTemplate = () => {
    downloadCsv(domain.templateName, toCsv(domain.buildTemplate()));
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
      const parsed = domain.parseCsv(raw);
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
    if (parsedRows.length === 0) return;
    setBusy(true);
    try {
      const rpcRows = parsedRows.map((r) => domain.toRpcRow(r));
      const { batchId, stagedRows } = await domain.create(
        pcId,
        batchLabel || domain.label,
        rpcRows,
      );
      const report = await domain.validate(batchId);
      toast({
        title: `Staged ${stagedRows} row(s)`,
        description: `${report.valid_rows ?? 0} valid · ${report.invalid_rows ?? 0} invalid`,
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
      setStagingRows(await listStagingRows(domain.key, b.id));
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
      await domain.validate(activeBatch.id);
      toast({ title: "Re-validated" });
      await refresh();
      setStagingRows(await listStagingRows(domain.key, activeBatch.id));
      const next = (await listMigrationBatches(pcId, domain.key)).find(
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
    if (
      !window.confirm(
        `Commit ${activeBatch.dryRunReport?.valid_rows ?? 0} ${domain.label.toLowerCase()} row(s) to the live database?`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await domain.commit(activeBatch.id);
      toast({ title: "Committed", description: JSON.stringify(res) });
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
    if (!window.confirm(`Roll back all ${domain.label.toLowerCase()} rows from this batch?`))
      return;
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
    const map: Record<
      MigrationBatch["status"],
      { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
    > = {
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
    <>
      <Alert>
        <AlertTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {domain.label}
        </AlertTitle>
        <AlertDescription className="text-xs">{domain.description}</AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
          <CardDescription>CSV up to {MAX_ROWS} rows per batch.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <div>
              <Label htmlFor={`batch-label-${domain.key}`}>Batch label</Label>
              <Input
                id={`batch-label-${domain.key}`}
                value={batchLabel}
                onChange={(e) => setBatchLabel(e.target.value)}
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
              Client-side parse only. Master-data resolution happens server-side during validate.
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
              {activeBatch?.dryRunReport
                ? Object.entries(activeBatch.dryRunReport)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")
                : "Not yet validated."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{domain.primaryHeader}</TableHead>
                  <TableHead>{domain.secondaryHeader}</TableHead>
                  <TableHead className="text-right">{domain.qtyHeader}</TableHead>
                  <TableHead>Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stagingRows.slice(0, 200).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.rowNo}</TableCell>
                    <TableCell>{r.primary}</TableCell>
                    <TableCell>{r.secondary}</TableCell>
                    <TableCell className="text-right">{r.quantity ?? "—"}</TableCell>
                    <TableCell className="text-xs text-destructive">
                      {r.validationErrors.join(", ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {stagingRows.length > 200 && (
              <p className="p-2 text-xs text-muted-foreground">
                Showing first 200 of {stagingRows.length} rows.
              </p>
            )}
          </div>

          {activeBatch?.status === "committed" && (
            <div className="space-y-2">
              <Label htmlFor="rollback-reason">Rollback reason</Label>
              <Textarea
                id="rollback-reason"
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                placeholder="Why are you rolling this batch back?"
                rows={2}
              />
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setActiveBatch(null)}>
              Close
            </Button>
            {activeBatch?.status === "committed" && (
              <Button variant="destructive" onClick={handleRollback} disabled={busy}>
                Roll back
              </Button>
            )}
            {(activeBatch?.status === "draft" || activeBatch?.status === "failed") && (
              <Button variant="outline" onClick={handleRevalidate} disabled={busy}>
                Re-validate
              </Button>
            )}
            {activeBatch?.status === "validated" && (
              <Button onClick={handleCommit} disabled={busy}>
                Commit
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function HeatHistoryPanel({ pcId }: { pcId: string }) {
  const { toast } = useToast();
  const [batches, setBatches] = useState<MigrationBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const headerFileRef = useRef<HTMLInputElement>(null);
  const consumptionFileRef = useRef<HTMLInputElement>(null);
  const [parsedHeats, setParsedHeats] = useState<any[]>([]);
  const [heatErrors, setHeatErrors] = useState<Array<{ rowNumber: number; message: string }>>([]);
  const [parsedConsumption, setParsedConsumption] = useState<any[]>([]);
  const [consumptionErrors, setConsumptionErrors] = useState<
    Array<{ rowNumber: number; message: string }>
  >([]);
  const [batchLabel, setBatchLabel] = useState("Heat history — back-load");

  const [activeBatch, setActiveBatch] = useState<MigrationBatch | null>(null);
  const [stagingRows, setStagingRows] = useState<MigrationStagingRow[]>([]);
  const [rollbackReason, setRollbackReason] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setBatches(await listMigrationBatches(pcId, "heat_history"));
    } catch (e) {
      toast({
        title: "Failed to load batches",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [pcId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleHeaderFile = async (file: File) => {
    try {
      const raw = parseCsv(await file.text());
      if (raw.length - 1 > 2000) {
        toast({
          title: "Too many heats",
          description: `Limit is 2000 heats per batch (got ${raw.length - 1}).`,
          variant: "destructive",
        });
        return;
      }
      const r = parseHeatHeaderCsv(raw);
      setParsedHeats(r.rows);
      setHeatErrors(r.errors);
      toast({
        title: `Heat CSV parsed`,
        description: `${r.rows.length} valid · ${r.errors.length} error(s)`,
      });
    } catch (e) {
      toast({
        title: "Could not read CSV",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      if (headerFileRef.current) headerFileRef.current.value = "";
    }
  };

  const handleConsumptionFile = async (file: File) => {
    try {
      const raw = parseCsv(await file.text());
      if (raw.length - 1 > 20000) {
        toast({
          title: "Too many consumption rows",
          description: `Limit is 20,000 rows per batch.`,
          variant: "destructive",
        });
        return;
      }
      const r = parseHeatConsumptionCsv(raw);
      setParsedConsumption(r.rows);
      setConsumptionErrors(r.errors);
      toast({
        title: `Consumption CSV parsed`,
        description: `${r.rows.length} valid · ${r.errors.length} error(s)`,
      });
    } catch (e) {
      toast({
        title: "Could not read CSV",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      if (consumptionFileRef.current) consumptionFileRef.current.value = "";
    }
  };

  const handleStage = async () => {
    if (parsedHeats.length === 0) {
      toast({ title: "Upload the heat header CSV first", variant: "destructive" });
      return;
    }
    if (heatErrors.length > 0 || consumptionErrors.length > 0) {
      toast({
        title: "Fix parse errors first",
        description: `${heatErrors.length} heat · ${consumptionErrors.length} consumption`,
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const heats = parsedHeats.map((r) => ({
        heat_number: r.heatNumber,
        tap_time: r.tapTime,
        furnace_code: r.furnaceCode,
        shift_code: r.shiftCode,
        weight_mt: r.weightMt,
        power_mwh: r.powerMwh,
        product: r.product,
        grade: r.grade,
        tapping_no: r.tappingNo,
        batch_no: r.batchNo,
        fg_mn_pct: r.fgMnPct,
        slag_qty_mt: r.slagQtyMt,
        slag_mno_pct: r.slagMnoPct,
        dust_qty_mt: r.dustQtyMt,
        dust_mn_pct: r.dustMnPct,
        tapping_power_mwh: r.tappingPowerMwh,
        furnace_power_mwh: r.furnacePowerMwh,
        aux_power_mwh: r.auxPowerMwh,
        avg_power_factor: r.avgPowerFactor,
        heat_status: r.heatStatus,
        notes: r.notes,
        legacy_ref: r.legacyRef,
      }));
      const consumption = parsedConsumption.map((r) => ({
        heat_number: r.heatNumber,
        material_code: r.materialCode,
        stock_location_code: r.stockLocationCode,
        quantity: r.quantity,
        unit_cost: r.unitCost,
        notes: r.notes,
        legacy_ref: r.legacyRef,
      }));
      const { batchId, stagedHeats, stagedConsumption } = await createHeatHistoryBatch({
        profitCenterId: pcId,
        label: batchLabel,
        heats,
        consumption,
      });
      const report = await validateHeatHistoryBatch(batchId);
      toast({
        title: `Staged ${stagedHeats} heat(s) + ${stagedConsumption} consumption row(s)`,
        description: `${report.valid_rows ?? 0} valid · ${report.invalid_rows ?? 0} invalid`,
      });
      setParsedHeats([]);
      setParsedConsumption([]);
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
      setStagingRows(await listStagingRows("heat_history", b.id));
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
      await validateHeatHistoryBatch(activeBatch.id);
      toast({ title: "Re-validated" });
      await refresh();
      setStagingRows(await listStagingRows("heat_history", activeBatch.id));
      const next = (await listMigrationBatches(pcId, "heat_history")).find(
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
    if (
      !window.confirm(
        `Commit ${activeBatch.dryRunReport?.heats_valid ?? 0} heat(s) and ${activeBatch.dryRunReport?.consumption_valid ?? 0} consumption row(s)?`,
      )
    )
      return;
    setBusy(true);
    try {
      const res = await commitHeatHistoryBatch(activeBatch.id);
      toast({ title: "Committed", description: JSON.stringify(res) });
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
    if (!window.confirm("Roll back all heats, consumption, ledger and metallurgy from this batch?"))
      return;
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
    const map = {
      draft: { label: "Draft", variant: "outline" as const },
      validated: { label: "Validated", variant: "secondary" as const },
      committed: { label: "Committed", variant: "default" as const },
      rolled_back: { label: "Rolled back", variant: "destructive" as const },
      failed: { label: "Failed", variant: "destructive" as const },
    };
    const m = map[s];
    return <Badge variant={m.variant}>{m.label}</Badge>;
  };

  return (
    <>
      <Alert>
        <AlertTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Historical heats
        </AlertTitle>
        <AlertDescription className="text-xs">
          Upload TWO CSVs (heat headers + consumption rows linked by heat_number). Commit creates
          heat_logs + heat_metallurgy + paired inventory_ledger consumption rows +
          material_consumption — all dated at the heat's tap_time.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
          <CardDescription>
            Up to 2,000 heats and 20,000 consumption rows per batch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="batch-label-heat">Batch label</Label>
            <Input
              id="batch-label-heat"
              value={batchLabel}
              onChange={(e) => setBatchLabel(e.target.value)}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded border p-3">
              <p className="text-sm font-medium">1. Heat headers</p>
              <p className="text-xs text-muted-foreground mb-2">
                One row per heat_number.{" "}
                {parsedHeats.length > 0 && (
                  <span className="text-foreground">
                    Parsed {parsedHeats.length} · errors {heatErrors.length}
                  </span>
                )}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadCsv("heat-header-template.csv", toCsv(buildHeatHeaderTemplateRows()))
                  }
                >
                  <Download className="mr-2 h-4 w-4" /> Template
                </Button>
                <Button size="sm" onClick={() => headerFileRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" /> Upload
                </Button>
                <input
                  ref={headerFileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleHeaderFile(f);
                  }}
                />
              </div>
            </div>
            <div className="rounded border p-3">
              <p className="text-sm font-medium">2. Consumption</p>
              <p className="text-xs text-muted-foreground mb-2">
                Many rows per heat_number.{" "}
                {parsedConsumption.length > 0 && (
                  <span className="text-foreground">
                    Parsed {parsedConsumption.length} · errors {consumptionErrors.length}
                  </span>
                )}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadCsv(
                      "heat-consumption-template.csv",
                      toCsv(buildHeatConsumptionTemplateRows()),
                    )
                  }
                >
                  <Download className="mr-2 h-4 w-4" /> Template
                </Button>
                <Button size="sm" onClick={() => consumptionFileRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" /> Upload
                </Button>
                <input
                  ref={consumptionFileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleConsumptionFile(f);
                  }}
                />
              </div>
            </div>
          </div>

          {(heatErrors.length > 0 || consumptionErrors.length > 0) && (
            <Alert variant="destructive">
              <AlertTitle>Parse errors</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 max-h-32 list-disc overflow-auto pl-5 text-xs">
                  {[...heatErrors, ...consumptionErrors].slice(0, 20).map((e, i) => (
                    <li key={i}>
                      Row {e.rowNumber}: {e.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <Button onClick={handleStage} disabled={busy || parsedHeats.length === 0}>
            Stage {parsedHeats.length} heat(s) + {parsedConsumption.length} consumption
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Batches</CardTitle>
            <CardDescription>{batches.length} total</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No heat history batches yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Heats valid / total</TableHead>
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
                      {b.dryRunReport?.heats_valid ?? "—"} /{" "}
                      {b.dryRunReport?.heats_total ?? "—"}
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

      <Dialog open={!!activeBatch} onOpenChange={(o) => !o && setActiveBatch(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {activeBatch?.label} {activeBatch && statusBadge(activeBatch.status)}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {activeBatch?.dryRunReport
                ? Object.entries(activeBatch.dryRunReport)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")
                : "Not yet validated."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Heat</TableHead>
                  <TableHead>Furnace · Shift</TableHead>
                  <TableHead className="text-right">Weight (MT)</TableHead>
                  <TableHead>Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stagingRows.slice(0, 200).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.rowNo}</TableCell>
                    <TableCell>{r.primary}</TableCell>
                    <TableCell>{r.secondary}</TableCell>
                    <TableCell className="text-right">{r.quantity ?? "—"}</TableCell>
                    <TableCell className="text-xs text-destructive">
                      {r.validationErrors.join(", ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {stagingRows.length > 200 && (
              <p className="p-2 text-xs text-muted-foreground">
                Showing first 200 of {stagingRows.length} heat headers (consumption rows hidden).
              </p>
            )}
          </div>

          {activeBatch?.status === "committed" && (
            <div className="space-y-2">
              <Label htmlFor="rollback-reason-heat">Rollback reason</Label>
              <Textarea
                id="rollback-reason-heat"
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                placeholder="Why are you rolling this batch back?"
                rows={2}
              />
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setActiveBatch(null)}>
              Close
            </Button>
            {activeBatch?.status === "committed" && (
              <Button variant="destructive" onClick={handleRollback} disabled={busy}>
                Roll back
              </Button>
            )}
            {(activeBatch?.status === "draft" || activeBatch?.status === "failed") && (
              <Button variant="outline" onClick={handleRevalidate} disabled={busy}>
                Re-validate
              </Button>
            )}
            {activeBatch?.status === "validated" && (
              <Button onClick={handleCommit} disabled={busy}>
                Commit
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
