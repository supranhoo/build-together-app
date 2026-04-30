/**
 * Bulk PC↔module mapping helpers.
 *
 * Per POLICY.md, a single mapping toggle applies directly. A bulk change
 * (>= BULK_APPROVAL_THRESHOLD toggles in one operation) is routed through the
 * maker-checker queue.
 */
import { setModuleMapping, type ModuleMapping } from "@/lib/system-settings";
import { requestApproval } from "@/lib/approvals";

export const BULK_APPROVAL_THRESHOLD = 5;

export interface BulkUpdate {
  moduleId: string;
  isEnabled: boolean;
}

/** Pure: returns the subset of `desired` that differs from the current `mappings` snapshot. */
export function diffMappings(
  mappings: ModuleMapping[],
  desired: BulkUpdate[],
): BulkUpdate[] {
  const current = new Map(mappings.map((m) => [m.moduleId, m.isEnabled]));
  return desired.filter((d) => {
    const cur = current.has(d.moduleId) ? current.get(d.moduleId)! : true; // default-enabled
    return cur !== d.isEnabled;
  });
}

/** Pure: should this change set go through approvals? */
export function requiresApproval(changes: BulkUpdate[]): boolean {
  return changes.length >= BULK_APPROVAL_THRESHOLD;
}

/**
 * Apply a bulk mapping change. Returns true if applied directly, false if
 * queued for approval.
 */
export async function applyBulkMappings(input: {
  profitCenterId: string;
  changes: BulkUpdate[];
  actorUserId: string;
}): Promise<boolean> {
  if (input.changes.length === 0) return true;
  if (requiresApproval(input.changes)) {
    await requestApproval({
      actionType: "module.bulk_set",
      payload: { profitCenterId: input.profitCenterId, updates: input.changes },
      requestedBy: input.actorUserId,
      profitCenterId: input.profitCenterId,
    });
    return false;
  }
  for (const c of input.changes) {
    await setModuleMapping(input.profitCenterId, c.moduleId, c.isEnabled, input.actorUserId);
  }
  return true;
}
