/**
 * MaterialPicker — single searchable dropdown grouped by
 * Type › Group › Subgroup, driven by an admin-mapped picker context.
 *
 * Replaces the ad-hoc <Select> over `materials` used across the app. The
 * caller supplies a `contextKey` (e.g. "fad.reductant") and the picker:
 *   1. loads picker_contexts once per workspace,
 *   2. resolves workspace override → global default,
 *   3. filters materials by Type/Group/Subgroup,
 *   4. groups remaining items into headers, with unmapped items in their
 *      own "(Unmapped)" bucket so legacy data stays editable.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Material } from "@/lib/inventory";
import {
  fetchPickerContexts,
  filterMaterialsByContext,
  groupMaterialsForPicker,
  resolvePickerContext,
  type PickerContext,
} from "@/lib/picker-contexts";

/**
 * MaterialPicker accepts any object that carries the Material hierarchy
 * fields. Both `Material` (inventory.ts) and `MasterItem` (master-data.ts)
 * satisfy this shape, so the picker drops in unchanged on every screen.
 */
export type PickerMaterial = Pick<
  Material,
  "id" | "code" | "name" | "uom" | "isActive" | "type" | "groupName" | "subgroup"
>;

interface MaterialPickerProps {
  contextKey: string;
  profitCenterId: string | null;
  materials: PickerMaterial[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function MaterialPicker({
  contextKey,
  profitCenterId,
  materials,
  value,
  onChange,
  placeholder = "Choose material…",
  disabled,
  className,
}: MaterialPickerProps) {
  const [open, setOpen] = useState(false);
  const [contexts, setContexts] = useState<PickerContext[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchPickerContexts(profitCenterId).then((rows) => {
      if (!cancelled) setContexts(rows);
    }).catch(() => { /* picker degrades to "show all" if fetch fails */ });
    return () => { cancelled = true; };
  }, [profitCenterId]);

  const ctx = useMemo(
    () => resolvePickerContext(contexts, contextKey, profitCenterId),
    [contexts, contextKey, profitCenterId],
  );
  const filtered = useMemo(() => filterMaterialsByContext(materials, ctx), [materials, ctx]);
  const grouped = useMemo(() => groupMaterialsForPicker(filtered), [filtered]);
  const selected = materials.find((m) => m.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate text-left">
            {selected
              ? `${selected.code} — ${selected.name}${selected.uom ? ` (${selected.uom})` : ""}`
              : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search code, name, group…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No materials match this slot.</CommandEmpty>
            {grouped.map((group) => (
              <CommandGroup
                key={group.label}
                heading={group.label}
                className={group.isUnmapped ? "[&_[cmdk-group-heading]]:text-amber-600" : undefined}
              >
                {group.items.map((m) => {
                  const haystack = `${m.code} ${m.name} ${m.type ?? ""} ${m.groupName ?? ""} ${m.subgroup ?? ""}`;
                  return (
                    <CommandItem
                      key={m.id}
                      value={haystack}
                      onSelect={() => { onChange(m.id); setOpen(false); }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === m.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="flex-1 truncate">
                        <span className="font-mono text-xs text-muted-foreground">{m.code}</span>{" "}
                        {m.name}{" "}
                        <span className="text-xs text-muted-foreground">({m.uom})</span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
