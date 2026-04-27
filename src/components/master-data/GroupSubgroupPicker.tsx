import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildGroupOptions,
  buildSubgroupOptions,
} from "@/lib/material-group-options";
import type { MaterialGroup } from "@/lib/master-data";

/**
 * Cascading Group / Subgroup picker backed by `material_groups`.
 *
 * Uses native `<datalist>` so operators can:
 *   - pick from the admin-managed list (suggestions while typing), OR
 *   - type a brand-new value (free-text fallback for one-off items).
 *
 * Subgroup suggestions update as soon as Group changes. Pure presentational —
 * parent owns the value state and the change handlers (so auto-apply of
 * spec templates can fire on the same change).
 */
export function GroupSubgroupPicker({
  groups,
  group,
  subgroup,
  groupExtras = [],
  subgroupExtras = [],
  onGroupChange,
  onSubgroupChange,
  groupPlaceholder = "ORE, Reductant, Fluxes…",
  subgroupPlaceholder = "Mn-Ore, Coke…",
  groupListId = "group-options",
  subgroupListId = "subgroup-options",
}: {
  groups: MaterialGroup[];
  group: string;
  subgroup: string;
  groupExtras?: Array<string | null | undefined>;
  subgroupExtras?: Array<string | null | undefined>;
  onGroupChange: (value: string) => void;
  onSubgroupChange: (value: string) => void;
  groupPlaceholder?: string;
  subgroupPlaceholder?: string;
  groupListId?: string;
  subgroupListId?: string;
}) {
  const groupOptions = buildGroupOptions(groups, groupExtras);
  const subgroupOptions = buildSubgroupOptions(groups, group, subgroupExtras);

  return (
    <>
      <div>
        <Label>Group</Label>
        <Input
          value={group}
          onChange={(e) => onGroupChange(e.target.value)}
          list={groupListId}
          placeholder={groupPlaceholder}
        />
        <datalist id={groupListId}>
          {groupOptions.map((g) => <option key={g} value={g} />)}
        </datalist>
      </div>
      <div>
        <Label>Subgroup</Label>
        <Input
          value={subgroup}
          onChange={(e) => onSubgroupChange(e.target.value)}
          list={subgroupListId}
          placeholder={group ? subgroupPlaceholder : "Pick a group first"}
        />
        <datalist id={subgroupListId}>
          {subgroupOptions.map((s) => <option key={s} value={s} />)}
        </datalist>
      </div>
    </>
  );
}
