import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  emptySpecRow,
  type SpecRow,
  type SpecValidationError,
} from "@/lib/master-item-specs";

/**
 * Repeatable rows editor for per-item specs. Pure presentational — all state
 * is owned by the parent (AdminMasterItems form). Validation errors are
 * passed in so the parent decides when to compute them (typically on every
 * keystroke). See `src/lib/master-item-specs.ts` for the validation contract.
 */
export function SpecsEditor({
  rows,
  errors,
  onChange,
}: {
  rows: SpecRow[];
  errors: SpecValidationError[];
  onChange: (rows: SpecRow[]) => void;
}) {
  const errorByRow = new Map<string, string[]>();
  for (const err of errors) {
    const list = errorByRow.get(err.rowId) ?? [];
    list.push(err.message);
    errorByRow.set(err.rowId, list);
  }

  const update = (id: string, patch: Partial<SpecRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));

  const add = () => onChange([...rows, emptySpecRow()]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Specs</Label>
        <Button type="button" size="sm" variant="outline" onClick={add}>
          Add spec
        </Button>
      </div>
      {rows.length === 0 && (
        <p className="rounded-md border border-dashed border-border bg-panel px-3 py-4 text-center text-xs text-muted-foreground">
          No specs yet — click "Add spec" to define material attributes (e.g. Mn %, Size mm, Moisture %).
        </p>
      )}
      {rows.map((row) => {
        const rowErrors = errorByRow.get(row.id) ?? [];
        const hasError = rowErrors.length > 0;
        return (
          <div
            key={row.id}
            className={cn(
              "rounded-md border bg-panel p-3 space-y-2",
              hasError ? "border-destructive/50" : "border-border",
            )}
          >
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
              <Input
                placeholder="Key (e.g. Mn)"
                value={row.key}
                onChange={(e) => update(row.id, { key: e.target.value })}
              />
              <Input
                placeholder="Value"
                value={row.value}
                onChange={(e) => update(row.id, { value: e.target.value })}
              />
              <Input
                placeholder="Unit (%, mm…)"
                value={row.unit}
                onChange={(e) => update(row.id, { unit: e.target.value })}
              />
              <Button type="button" size="sm" variant="ghost" onClick={() => remove(row.id)}>
                Remove
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5">
                <Switch
                  checked={row.required}
                  onCheckedChange={(v) => update(row.id, { required: v })}
                />
                Required
              </label>
              <label className="flex items-center gap-1.5">
                <Switch
                  checked={row.numeric}
                  onCheckedChange={(v) => update(row.id, { numeric: v })}
                />
                Numeric
              </label>
              {row.numeric && (
                <>
                  <Input
                    className="h-7 w-24"
                    placeholder="Min"
                    value={row.min}
                    onChange={(e) => update(row.id, { min: e.target.value })}
                  />
                  <Input
                    className="h-7 w-24"
                    placeholder="Max"
                    value={row.max}
                    onChange={(e) => update(row.id, { max: e.target.value })}
                  />
                </>
              )}
            </div>
            {hasError && (
              <ul className="list-disc pl-5 text-xs text-destructive">
                {rowErrors.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
