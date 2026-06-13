import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Phase 1.5 — shown above a list/summary when the query hit its row cap,
 * meaning some rows are not visible. Caller passes the limit and an action
 * hint (e.g. "narrow the date range").
 */
export function TruncationBanner({
  limit,
  hint,
}: {
  limit: number;
  hint?: string;
}) {
  return (
    <Alert variant="destructive" className="mb-3">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Results truncated</AlertTitle>
      <AlertDescription>
        Showing the first {limit.toLocaleString()} rows. More rows exist beyond this window.
        {hint ? ` ${hint}` : " Narrow the date range to see all rows."}
      </AlertDescription>
    </Alert>
  );
}
