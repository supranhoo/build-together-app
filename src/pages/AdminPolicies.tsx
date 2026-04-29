import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Lock, ShieldCheck } from "lucide-react";

/**
 * Global Security Policies placeholder.
 *
 * Real policies (password complexity, session TTL, MFA enforcement, etc.)
 * are governed by Supabase Auth project settings and must be edited via
 * Lovable Cloud connector settings — not by writing values to a
 * client-side table. This page documents the active posture.
 */
export default function AdminPolicies() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" /> Global Security Policies
          </CardTitle>
          <CardDescription>
            Authentication and session policies are enforced by Lovable Cloud at the platform level.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Active posture</AlertTitle>
            <AlertDescription>
              Row-Level Security is enabled on every domain table. Role checks use the
              SECURITY DEFINER function <code>has_role()</code>. All sensitive mutations write to
              the immutable <code>audit_logs</code> table.
            </AlertDescription>
          </Alert>

          <ul className="space-y-2 text-sm">
            <li className="flex items-start justify-between rounded-md border border-border p-3">
              <span>Password reset via verified email</span>
              <span className="text-xs text-muted-foreground">Enforced by platform</span>
            </li>
            <li className="flex items-start justify-between rounded-md border border-border p-3">
              <span>Session refresh tokens with rotation</span>
              <span className="text-xs text-muted-foreground">Enforced by platform</span>
            </li>
            <li className="flex items-start justify-between rounded-md border border-border p-3">
              <span>Test-data lockdown (per Profit Center)</span>
              <span className="text-xs text-muted-foreground">Admin Test Data page</span>
            </li>
            <li className="flex items-start justify-between rounded-md border border-border p-3">
              <span>Audit retention</span>
              <span className="text-xs text-muted-foreground">Append-only, no client deletes</span>
            </li>
          </ul>

          <p className="text-xs text-muted-foreground">
            To change platform-level auth policies (password complexity, MFA, session TTL),
            use Lovable Cloud settings.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
