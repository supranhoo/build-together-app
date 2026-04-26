import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  emptyTemplateField,
  type FieldValidationError,
  type SpecTemplateField,
} from "@/lib/spec-templates";

/**
 * Editor for the `fields` array of a Spec Template. Pure presentational —
 * parent owns state. Mirrors the per-item SpecsEditor visual language so
 * admins recognize the same controls (key/value/unit/required/numeric/min/max)
 * even though here we are defining the *contract*, not values.
 */
export function SpecTemplateEditor({
  fields,
  errors,
  onChange,
}: {
  fields: SpecTemplateField[];
  errors: FieldValidationError[];
  onChange: (fields: SpecTemplateField[]) => void;
}) {
  const errorByIndex = new Map<number, string[]>();
  for (const err of errors) {
    const list = errorByIndex.get(err.index) ?? [];
    list.push(err.message);
    errorByIndex.set(err.index, list);
  }

  const update = (i: number, patch: Partial<SpecTemplateField>) =>
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  const remove = (i: number) => onChange(fields.filter((_, idx) => idx !== i));

  const add = () => onChange([...fields, emptyTemplateField()]);

  const move = (i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= fields.length) return;
    const next = fields.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Specification fields</Label>
        <Button type="button" size="sm" variant="outline" onClick={add}>
          Add field
        </Button>
      </div>
      {fields.length === 0 && (
        <p className="rounded-md border border-dashed border-border bg-panel px-3 py-4 text-center text-xs text-muted-foreground">
          No fields yet — click "Add field" to define mandatory specs (e.g. Mn %, SiO₂ %, Size mm).
        </p>
      )}
      {fields.map((f, i) => {
        const fieldErrors = errorByIndex.get(i) ?? [];
        const hasError = fieldErrors.length > 0;
        return (
          <div
            key={i}
            className={cn(
              "rounded-md border bg-panel p-3 space-y-2",
              hasError ? "border-destructive/50" : "border-border",
            )}
          >
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
              <Input
                placeholder="Key (e.g. Mn)"
                value={f.key}
                onChange={(e) => update(i, { key: e.target.value })}
              />
              <Input
                placeholder="Label (e.g. Manganese)"
                value={f.label}
                onChange={(e) => update(i, { label: e.target.value })}
              />
              <Input
                placeholder="Unit (%, mm…)"
                value={f.unit}
                onChange={(e) => update(i, { unit: e.target.value })}
              />
              <div className="flex items-center gap-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === fields.length - 1}>↓</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => remove(i)}>Remove</Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5">
                <Switch checked={f.required} onCheckedChange={(v) => update(i, { required: v })} />
                Required
              </label>
              <label className="flex items-center gap-1.5">
                <Switch checked={f.numeric} onCheckedChange={(v) => update(i, { numeric: v })} />
                Numeric
              </label>
              {f.numeric && (
                <>
                  <Input
                    className="h-7 w-24"
                    placeholder="Min"
                    value={f.min}
                    onChange={(e) => update(i, { min: e.target.value })}
                  />
                  <Input
                    className="h-7 w-24"
                    placeholder="Max"
                    value={f.max}
                    onChange={(e) => update(i, { max: e.target.value })}
                  />
                </>
              )}
            </div>
            {hasError && (
              <ul className="list-disc pl-5 text-xs text-destructive">
                {fieldErrors.map((msg, idx) => (
                  <li key={idx}>{msg}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
