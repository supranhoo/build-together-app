import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { GitMerge } from "lucide-react";

/**
 * Maker-Checker Workflow placeholder.
 *
 * Why a placeholder: real workflow rules must come from a backed
 * `approval_workflows` table with RLS + audit, not from hardcoded examples
 * (Rule #10). This screen only previews the intended UX so admins can see
 * where the feature will live once the schema lands.
 */
export default function AdminWorkflows() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitMerge className="h-4 w-4" /> Dynamic Workflow Engine
        </CardTitle>
        <CardDescription>
          Configure Maker-Checker rules and approval hierarchies. Backed by an
          approval-workflow table (coming soon — this preview is read-only).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-border p-5">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold">Purchase Requisition Approval</h3>
              <p className="text-sm text-muted-foreground">
                Triggered when a new PR is created in the Procurement module.
              </p>
            </div>
            <Switch disabled defaultChecked />
          </div>
          <div className="flex flex-col items-stretch gap-4 text-sm md:flex-row md:items-center">
            <div className="flex-1 rounded border border-border bg-muted/40 p-3 text-center">
              <span className="mb-1 block font-semibold">Maker</span>
              <Badge variant="outline">Any User</Badge>
            </div>
            <div className="text-center text-muted-foreground">→</div>
            <div className="flex-1 rounded border border-border bg-muted/40 p-3 text-center">
              <span className="mb-1 block font-semibold">Checker 1 (Technical)</span>
              <Badge variant="outline">Department Head</Badge>
            </div>
            <div className="text-center text-muted-foreground">→</div>
            <div className="relative flex-1 rounded border border-border bg-muted/40 p-3 text-center">
              <span className="mb-1 block font-semibold">Checker 2 (Financial)</span>
              <Badge variant="outline">Plant Head</Badge>
              <div className="absolute -right-2 -top-2 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium">
                If &gt; 10L
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" disabled>
              Edit Workflow
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Schema for `approval_workflows` and per-step actor resolution will be added in a follow-up migration.
        </p>
      </CardContent>
    </Card>
  );
}
