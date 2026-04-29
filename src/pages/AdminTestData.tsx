import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  fetchTestDataBatches,
  fetchTestDataCounts,
  fetchTestDataSettings,
  isPurgeConfirmValid,
  purgeTestData,
  PURGE_CONFIRM_PHRASE,
  seedTestData,
  setTestDataLock,
  type TestDataBatch,
  type TestDataSettings,
} from "@/lib/test-data";
import { AlertTriangle, Database, Lock, Trash2, ShieldAlert } from "lucide-react";

export default function AdminTestData() {
  const { activeProfitCenter, isAdmin } = useWorkspace();
  const { toast } = useToast();
  const pcId = activeProfitCenter?.id;

  const [settings, setSettings] = useState<TestDataSettings | null>(null);
  const [batches, setBatches] = useState<TestDataBatch[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [seedLabel, setSeedLabel] = useState("UAT seed");
  const [confirmText, setConfirmText] = useState("");
  const [lockReason, setLockReason] = useState("");
  const [busy, setBusy] = useState(false);

  const totalTestRows = useMemo(
    () => Object.values(counts).reduce((s, n) => s + (Number(n) || 0), 0),
    [counts],
  );

  async function refresh() {
    if (!pcId) return;
    setLoading(true);
    try {
      const [s, b, c] = await Promise.all([
        fetchTestDataSettings(pcId),
        fetchTestDataBatches(pcId),
        fetchTestDataCounts(pcId).catch(() => ({})),
      ]);
      setSettings(s);
      setBatches(b);
      setCounts(c);
    } catch (e) {
      toast({ title: "Failed to load", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pcId]);

  if (!isAdmin) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Admin only</AlertTitle>
        <AlertDescription>This area is reserved for administrators.</AlertDescription>
      </Alert>
    );
  }
  if (!pcId) {
    return <p className="text-sm text-muted-foreground">Select a workspace first.</p>;
  }

  const enabled = settings?.isEnabled ?? true;

  async function handleSeed() {
    setBusy(true);
    try {
      const r = await seedTestData(pcId!, seedLabel.trim() || "Seed");
      toast({ title: "Seed complete", description: `Inserted ${Object.values(r.counts).reduce((s, n) => s + Number(n), 0)} rows` });
      await refresh();
    } catch (e) {
      toast({ title: "Seed failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function handlePurge(batchId: string | null) {
    if (!isPurgeConfirmValid(confirmText)) {
      toast({ title: "Confirmation required", description: `Type ${PURGE_CONFIRM_PHRASE} to confirm.`, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const r = await purgeTestData(pcId!, confirmText.trim(), batchId);
      toast({ title: "Purge complete", description: `${r.total} test rows removed.` });
      setConfirmText("");
      await refresh();
    } catch (e) {
      toast({ title: "Purge failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function handleLockToggle(next: boolean) {
    if (!next && !lockReason.trim()) {
      toast({ title: "Reason required", description: "Provide a reason before locking.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await setTestDataLock(pcId!, next, lockReason.trim() || "n/a");
      toast({ title: next ? "Feature re-enabled" : "Feature locked", description: next ? "Test data actions are available." : "Go-Live lockdown active." });
      setLockReason("");
      await refresh();
    } catch (e) {
      toast({ title: "Action failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Status banner */}
      {enabled ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Test Data Mode — ENABLED</AlertTitle>
          <AlertDescription>
            Disable this feature before going live. Currently <Badge variant="secondary">{totalTestRows}</Badge> test rows tagged in this workspace.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <Lock className="h-4 w-4" />
          <AlertTitle>LIVE MODE — Test Data feature locked</AlertTitle>
          <AlertDescription>
            Locked {settings?.lockedAt ? new Date(settings.lockedAt).toLocaleString() : ""}.
            {settings?.lockReason ? ` Reason: ${settings.lockReason}` : ""}
          </AlertDescription>
        </Alert>
      )}

      {/* Seed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="h-4 w-4" /> Seed demo data</CardTitle>
          <CardDescription>Inserts a small curated set (suppliers, customers, materials) flagged as test data.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 items-end">
          <div className="flex-1">
            <Label>Batch label</Label>
            <Input value={seedLabel} onChange={(e) => setSeedLabel(e.target.value)} disabled={!enabled || busy} />
          </div>
          <Button onClick={handleSeed} disabled={!enabled || busy}>Seed Now</Button>
        </CardContent>
      </Card>

      {/* Counts preview */}
      <Card>
        <CardHeader>
          <CardTitle>Current test data (dry-run preview)</CardTitle>
          <CardDescription>Rows that would be removed by a full purge.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : Object.keys(counts).length === 0 ? (
            <p className="text-sm text-muted-foreground">No test-tagged rows in this workspace.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.entries(counts).map(([t, n]) => (
                <div key={t} className="flex justify-between rounded border px-3 py-2 text-sm">
                  <span className="font-mono text-xs">{t}</span>
                  <Badge variant="outline">{n}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Batches */}
      <Card>
        <CardHeader>
          <CardTitle>Batches</CardTitle>
          <CardDescription>Each seed/upload creates one batch. You may purge a single batch or all test data below.</CardDescription>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No batches yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1">Label</th><th>Source</th><th>Created</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="py-1.5">{b.label}</td>
                    <td><Badge variant="secondary">{b.source}</Badge></td>
                    <td>{new Date(b.createdAt).toLocaleString()}</td>
                    <td>{b.purgedAt ? <span className="text-muted-foreground">purged</span> : <span className="text-green-600">active</span>}</td>
                    <td className="text-right">
                      {!b.purgedAt && (
                        <Button size="sm" variant="outline" disabled={!enabled || busy || !isPurgeConfirmValid(confirmText)} onClick={() => handlePurge(b.id)}>Purge batch</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Purge ALL */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive"><Trash2 className="h-4 w-4" /> Purge ALL test data</CardTitle>
          <CardDescription>Deletes every row tagged <code>is_test_data = true</code> in this workspace. Production rows are not affected.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 items-end">
          <div className="flex-1">
            <Label>Type <code>{PURGE_CONFIRM_PHRASE}</code> to confirm</Label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={PURGE_CONFIRM_PHRASE} disabled={!enabled || busy} />
          </div>
          <Button variant="destructive" disabled={!enabled || busy || !isPurgeConfirmValid(confirmText) || totalTestRows === 0} onClick={() => handlePurge(null)}>
            Delete {totalTestRows} test rows
          </Button>
        </CardContent>
      </Card>

      {/* Lockdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lock className="h-4 w-4" /> Go-Live Lockdown</CardTitle>
          <CardDescription>
            When you go live, lock this feature. Re-enabling later requires a Super Admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Reason</Label>
            <Textarea value={lockReason} onChange={(e) => setLockReason(e.target.value)} placeholder={enabled ? "e.g. Production go-live 2026-05-01" : "e.g. Need additional UAT round"} />
          </div>
          {enabled ? (
            <Button variant="destructive" disabled={busy} onClick={() => handleLockToggle(false)}>Disable Test Data feature</Button>
          ) : (
            <Button disabled={busy} onClick={() => handleLockToggle(true)}>Re-enable (Super Admin only)</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
