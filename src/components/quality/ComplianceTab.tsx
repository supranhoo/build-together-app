/**
 * Compliance & Lab — Quality Phase D.
 *
 * Generic registry for lab certificates, instrument calibrations and
 * regulatory documents. The expiry bucketer (`bucketComplianceExpiry`)
 * is the single source of truth for "Expired", "Due soon (≤30 d)" and
 * "OK" categories shown here and on the QC dashboard.
 *
 * No record types are hardcoded — admins type the type at creation.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarClock, FileCheck, Plus, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  bucketComplianceExpiry,
  COMPLIANCE_DUE_SOON_DAYS,
  createComplianceRecord,
  fetchComplianceRecords,
  type ComplianceBucket,
  type ComplianceRecord,
} from "@/lib/quality";

const BUCKET_VARIANT: Record<ComplianceBucket, { label: string; className: string; Icon: typeof ShieldCheck }> = {
  expired:    { label: "Expired",         className: "bg-destructive/10 text-destructive",                            Icon: ShieldAlert },
  due_soon:   { label: "Due soon",        className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",            Icon: CalendarClock },
  ok:         { label: "OK",              className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",      Icon: ShieldCheck },
  no_expiry:  { label: "No expiry",       className: "bg-muted text-muted-foreground",                                Icon: ShieldQuestion },
};

function BucketBadge({ bucket }: { bucket: ComplianceBucket }) {
  const v = BUCKET_VARIANT[bucket];
  const I = v.Icon;
  return <Badge className={`${v.className} border-0 gap-1`}><I className="h-3 w-3" />{v.label}</Badge>;
}

export function ComplianceTab() {
  const { activeProfitCenter } = useWorkspace();
  const { session } = useAuth();
  const { toast } = useToast();

  const [items, setItems] = useState<ComplianceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [recordType, setRecordType] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [description, setDescription] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");

  const pcId = activeProfitCenter?.id;
  const userId = session?.user?.id;

  useEffect(() => {
    if (!pcId) return;
    setLoading(true);
    fetchComplianceRecords(pcId)
      .then(setItems)
      .catch((e) => toast({ title: "Failed to load compliance records", description: String(e?.message ?? e), variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [pcId, toast]);

  const summary = useMemo(() => {
    const now = new Date();
    let expired = 0, due = 0, ok = 0, none = 0;
    for (const r of items) {
      const b = bucketComplianceExpiry(r.expiresAt, now);
      if (b === "expired") expired++;
      else if (b === "due_soon") due++;
      else if (b === "ok") ok++;
      else none++;
    }
    return { expired, due, ok, none };
  }, [items]);

  function resetCreate() {
    setRecordType(""); setReferenceNo(""); setDescription(""); setIssuedAt(""); setExpiresAt(""); setNotes("");
  }

  async function handleCreate() {
    if (!pcId || !userId) return;
    if (!recordType.trim() || !referenceNo.trim()) {
      toast({ title: "Missing fields", description: "Record type and reference number are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const row = await createComplianceRecord({
        profitCenterId: pcId,
        createdBy: userId,
        recordType,
        referenceNo,
        description: description.trim() || null,
        issuedAt: issuedAt || null,
        expiresAt: expiresAt || null,
        notes: notes.trim() || null,
      });
      setItems((prev) => [row, ...prev]);
      setCreateOpen(false);
      resetCreate();
      toast({ title: "Compliance record added", description: row.referenceNo });
    } catch (e: any) {
      toast({ title: "Could not save", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!pcId) {
    return (
      <Card>
        <CardHeader><CardTitle>Compliance & Lab</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Select a workspace.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Expired</div>
          <div className="text-2xl font-semibold text-destructive">{summary.expired}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Due ≤ {COMPLIANCE_DUE_SOON_DAYS} days</div>
          <div className="text-2xl font-semibold text-amber-600">{summary.due}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">OK</div>
          <div className="text-2xl font-semibold text-emerald-600">{summary.ok}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">No expiry</div>
          <div className="text-2xl font-semibold text-muted-foreground">{summary.none}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-primary" /> Compliance & Lab Records
            </CardTitle>
            <CardDescription>
              Lab certificates, instrument calibrations and regulatory documents. Expiry buckets are computed using the central rule.
            </CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add record
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
                )}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      <FileCheck className="mx-auto mb-2 h-6 w-6 opacity-50" />
                      No compliance records yet.
                    </TableCell>
                  </TableRow>
                )}
                {items.map((r) => {
                  const bucket = bucketComplianceExpiry(r.expiresAt);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.referenceNo}</TableCell>
                      <TableCell>{r.recordType}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.issuedAt ? new Date(r.issuedAt).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell><BucketBadge bucket={bucket} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{r.notes ?? r.description ?? ""}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={(o) => { if (!saving) { setCreateOpen(o); if (!o) resetCreate(); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Add compliance record</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="rt">Record type</Label>
                <Input id="rt" value={recordType} onChange={(e) => setRecordType(e.target.value)} placeholder="e.g. Lab certificate, Calibration" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rn">Reference number</Label>
                <Input id="rn" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="e.g. NABL-2026-0123" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="desc">Description</Label>
              <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="iss">Issued on</Label>
                <Input id="iss" type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="exp">Expires on</Label>
                <Input id="exp" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="n">Notes</Label>
              <Textarea id="n" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
