/**
 * FilterBanner — shows the currently-applied URL filter on a list view and
 * lets the user clear it. Used on Sales Orders / Inquiries; reusable for
 * other module list tabs as the drilldown pattern rolls out.
 *
 * Pure presentation. The parent owns the URL update because the search-
 * param keys to clear are list-specific.
 */
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Props {
  /** Pre-formatted filter chips. Empty array hides the banner. */
  chips: { label: string; value: string }[];
  /** Called when the user clicks Clear. */
  onClear: () => void;
}

export function FilterBanner({ chips, onClear }: Props) {
  if (chips.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filtered by</span>
      {chips.map((c) => (
        <Badge key={`${c.label}-${c.value}`} variant="secondary" className="font-mono text-xs">
          {c.label}: {c.value}
        </Badge>
      ))}
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClear}>
        <X className="h-3 w-3 mr-1" /> Clear
      </Button>
    </div>
  );
}
