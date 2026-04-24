import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspace } from "@/hooks/use-workspace";
import { getManageableProfitCenters } from "@/lib/manageable-profit-centers";
import { useMemo } from "react";

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Disable the field (e.g. while editing an existing record whose PC must not change). */
  disabled?: boolean;
  /** Label override (defaults to "Profit Center"). */
  label?: string;
}

/**
 * Mandatory Profit Center selector for admin Create/Edit dialogs.
 *
 * - Defaults to the active workspace.
 * - Restricted to PCs the current user can manage (super_admin = all active; admin = assigned active).
 * - Caller is responsible for validating non-empty before save.
 */
export function ProfitCenterSelectField({ value, onChange, disabled, label }: Props) {
  const { allProfitCenters, assignments, isAdmin, isSuperAdmin, activeProfitCenter } = useWorkspace();

  const options = useMemo(
    () => getManageableProfitCenters({ isSuperAdmin, isAdmin, assignments, allProfitCenters }),
    [isSuperAdmin, isAdmin, assignments, allProfitCenters],
  );

  const isCrossWorkspace = Boolean(value && activeProfitCenter && value !== activeProfitCenter.id);

  return (
    <div>
      <Label>
        {label ?? "Profit Center"} <span className="text-destructive">*</span>
      </Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Select profit center" />
        </SelectTrigger>
        <SelectContent>
          {options.map((pc) => (
            <SelectItem key={pc.id} value={pc.id}>
              {pc.name} ({pc.code})
            </SelectItem>
          ))}
          {options.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">No manageable profit centers</div>
          )}
        </SelectContent>
      </Select>
      {isCrossWorkspace && (
        <p className="mt-1 text-xs text-muted-foreground">
          Saving into a different workspace than the one currently selected. The new record will appear after switching workspaces.
        </p>
      )}
    </div>
  );
}
