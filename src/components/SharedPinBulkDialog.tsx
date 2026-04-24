import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { KpiDefinition } from "@/lib/reporting";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  definitions: KpiDefinition[];
  /** Currently shared/selected KPI definition IDs, in display order. */
  initialSelectedIds: string[];
  /** Whether to show the reorder section at the top (Reports flow). */
  enableReorder?: boolean;
  saving?: boolean;
  applyLabel?: string;
  /** Called with the desired KPI IDs in the desired display order. */
  onApply: (orderedIds: string[]) => void | Promise<void>;
}

export function SharedPinBulkDialog({
  open,
  onOpenChange,
  title,
  description,
  definitions,
  initialSelectedIds,
  enableReorder = false,
  saving = false,
  applyLabel = "Apply",
  onApply,
}: Props) {
  const [orderedSelected, setOrderedSelected] = useState<string[]>(initialSelectedIds);

  // Reset internal state whenever the dialog opens with a fresh selection.
  useEffect(() => {
    if (open) setOrderedSelected(initialSelectedIds);
  }, [open, initialSelectedIds]);

  const defById = useMemo(() => new Map(definitions.map((d) => [d.id, d])), [definitions]);
  const selectedSet = useMemo(() => new Set(orderedSelected), [orderedSelected]);
  const unselected = useMemo(
    () => definitions.filter((d) => !selectedSet.has(d.id)),
    [definitions, selectedSet],
  );

  const toggle = (id: string, checked: boolean) => {
    setOrderedSelected((prev) => {
      if (checked) {
        if (prev.includes(id)) return prev;
        return [...prev, id];
      }
      return prev.filter((x) => x !== id);
    });
  };

  const move = (id: string, direction: -1 | 1) => {
    setOrderedSelected((prev) => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {title}
          </DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <div className="space-y-4">
          {enableReorder && orderedSelected.length > 0 && (
            <section>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Selected order ({orderedSelected.length})
              </p>
              <ScrollArea className="max-h-48 rounded-md border border-border">
                <ul className="divide-y divide-border">
                  {orderedSelected.map((id, idx) => {
                    const def = defById.get(id);
                    if (!def) return null;
                    return (
                      <li key={id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{def.displayName}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{def.key}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            aria-label="Move up"
                            disabled={idx === 0 || saving}
                            onClick={() => move(id, -1)}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            aria-label="Move down"
                            disabled={idx === orderedSelected.length - 1 || saving}
                            onClick={() => move(id, 1)}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            </section>
          )}

          <section>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              All KPIs ({definitions.length})
            </p>
            <ScrollArea className="max-h-72 rounded-md border border-border">
              <ul className="divide-y divide-border">
                {[...orderedSelected.map((id) => defById.get(id)).filter(Boolean) as KpiDefinition[], ...unselected].map(
                  (def) => {
                    const checked = selectedSet.has(def.id);
                    return (
                      <li key={def.id} className="flex items-center gap-3 px-3 py-2">
                        <Checkbox
                          id={`bulk-pin-${def.id}`}
                          checked={checked}
                          onCheckedChange={(v) => toggle(def.id, v === true)}
                          disabled={saving}
                        />
                        <label
                          htmlFor={`bulk-pin-${def.id}`}
                          className="flex-1 cursor-pointer select-none"
                        >
                          <p className="text-sm font-medium text-foreground">{def.displayName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {def.key}
                            {def.unit ? ` · ${def.unit}` : ""}
                          </p>
                        </label>
                      </li>
                    );
                  },
                )}
              </ul>
            </ScrollArea>
          </section>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void onApply(orderedSelected)} disabled={saving}>
            {saving ? "Applying…" : applyLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
