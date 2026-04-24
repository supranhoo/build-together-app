import { supabase } from "@/integrations/supabase/client";

export interface ProfitCenter {
  id: string;
  code: string;
  slug: string;
  name: string;
  description: string | null;
  locationName: string | null;
  processProfile: string | null;
  isActive: boolean;
}

export interface ProfitCenterAssignment {
  id: string;
  userId: string;
  profitCenterId: string;
  isDefault: boolean;
  isActive: boolean;
  profitCenter: ProfitCenter;
}

export interface ConfiguredModule {
  id: string;
  moduleId: string;
  moduleKey: string;
  routeSegment: string;
  navLabel: string;
  description: string | null;
  iconName: string | null;
  sortOrder: number;
  isDefaultEntry: boolean;
}

export interface ProfitCenterSetting {
  id: string;
  settingKey: string;
  scope: string;
  settingValue: Record<string, unknown>;
}

export interface AppModuleRecord {
  id: string;
  moduleKey: string;
  routeSegment: string;
  defaultLabel: string;
  description: string | null;
  iconName: string | null;
  sortOrder: number;
  isActive: boolean;
  isConfigurable: boolean;
}

export interface ManageableProfile {
  userId: string;
  displayName: string | null;
  department: string | null;
  jobTitle: string | null;
}

export interface AuditLogRecord {
  id: string;
  actorUserId: string;
  profitCenterId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  changeSummary: Record<string, unknown>;
  context: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogPage {
  logs: AuditLogRecord[];
  hasMore: boolean;
  nextOffset: number | null;
}

export const AUDIT_LOG_PAGE_SIZE = 20;

const client = supabase as unknown as {
  from: (table: string) => any;
};

function toProfitCenter(row: any): ProfitCenter {
  return {
    id: row.id,
    code: row.code,
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    locationName: row.location_name ?? null,
    processProfile: row.process_profile ?? null,
    isActive: Boolean(row.is_active),
  };
}

function toConfiguredModule(row: any): ConfiguredModule {
  const source = row.app_module ?? row;

  return {
    id: row.id ?? source.id,
    moduleId: row.module_id ?? source.id,
    moduleKey: source.module_key,
    routeSegment: row.route_segment ?? source.route_segment,
    navLabel: row.nav_label ?? source.default_label,
    description: source.description ?? null,
    iconName: source.icon_name ?? null,
    sortOrder: row.sort_order ?? source.sort_order ?? 0,
    isDefaultEntry: Boolean(row.is_default_entry),
  };
}

function toAppModule(row: any): AppModuleRecord {
  return {
    id: row.id,
    moduleKey: row.module_key,
    routeSegment: row.route_segment,
    defaultLabel: row.default_label,
    description: row.description ?? null,
    iconName: row.icon_name ?? null,
    sortOrder: row.sort_order ?? 0,
    isActive: Boolean(row.is_active),
    isConfigurable: Boolean(row.is_configurable),
  };
}

function toAuditLog(row: any): AuditLogRecord {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    profitCenterId: row.profit_center_id ?? null,
    entityType: row.entity_type,
    entityId: row.entity_id ?? null,
    action: row.action,
    changeSummary: row.change_summary ?? {},
    context: row.context ?? {},
    createdAt: row.created_at,
  };
}

export async function fetchAssignedProfitCenters(userId: string): Promise<ProfitCenterAssignment[]> {
  const { data, error } = await client
    .from("user_profit_centers")
    .select(`
      id,
      user_id,
      profit_center_id,
      is_default,
      is_active,
      profit_center:profit_centers (
        id,
        code,
        slug,
        name,
        description,
        location_name,
        process_profile,
        is_active
      )
    `)
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) throw error;

  return (data ?? [])
    .filter((row: any) => row.profit_center)
    .map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      profitCenterId: row.profit_center_id,
      isDefault: Boolean(row.is_default),
      isActive: Boolean(row.is_active),
      profitCenter: toProfitCenter(row.profit_center),
    }))
    .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.profitCenter.name.localeCompare(right.profitCenter.name));
}

export async function fetchConfiguredModules(profitCenterId: string): Promise<ConfiguredModule[]> {
  const configuredResult = await client
    .from("profit_center_modules")
    .select(`
      id,
      module_id,
      nav_label,
      route_segment,
      sort_order,
      is_default_entry,
      is_enabled,
      app_module:app_modules (
        id,
        module_key,
        route_segment,
        default_label,
        description,
        icon_name,
        sort_order,
        is_active
      )
    `)
    .eq("profit_center_id", profitCenterId)
    .eq("is_enabled", true);

  if (configuredResult.error) throw configuredResult.error;

  const configuredRows = (configuredResult.data ?? []).filter((row: any) => row.app_module);

  if (configuredRows.length > 0) {
    return configuredRows
      .map(toConfiguredModule)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.navLabel.localeCompare(right.navLabel));
  }

  const fallbackResult = await client
    .from("app_modules")
    .select("id, module_key, route_segment, default_label, description, icon_name, sort_order, is_active")
    .eq("is_active", true)
    .eq("is_configurable", true);

  if (fallbackResult.error) throw fallbackResult.error;

  return (fallbackResult.data ?? [])
    .map(toConfiguredModule)
    .sort((left: ConfiguredModule, right: ConfiguredModule) => left.sortOrder - right.sortOrder || left.navLabel.localeCompare(right.navLabel));
}

export async function fetchProfitCenterSettings(profitCenterId: string): Promise<ProfitCenterSetting[]> {
  const { data, error } = await client
    .from("profit_center_settings")
    .select("id, setting_key, scope, setting_value")
    .eq("profit_center_id", profitCenterId)
    .eq("is_active", true);

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    settingKey: row.setting_key,
    scope: row.scope,
    settingValue: row.setting_value ?? {},
  }));
}

export async function fetchAllProfitCenters(): Promise<ProfitCenter[]> {
  const { data, error } = await client
    .from("profit_centers")
    .select("id, code, slug, name, description, location_name, process_profile, is_active")
    .order("name");

  if (error) throw error;

  return (data ?? []).map(toProfitCenter);
}

export async function createProfitCenter(input: {
  code: string;
  slug: string;
  name: string;
  description?: string;
  locationName?: string;
  processProfile?: string;
}) {
  // Insert + select in a single round-trip so we always get the freshly-created row's id
  // (avoids a race where a separate reload could match a different existing row by code/slug).
  const { data, error } = await client
    .from("profit_centers")
    .insert({
      code: input.code,
      slug: input.slug,
      name: input.name,
      description: input.description || null,
      location_name: input.locationName || null,
      process_profile: input.processProfile || null,
    })
    .select("id, code, slug, name, description, location_name, process_profile, is_active")
    .single();

  if (error) throw error;
  if (!data) {
    throw new Error("Profit Center was created but could not be reloaded. Please refresh.");
  }

  return toProfitCenter(data);
}

export async function updateProfitCenter(profitCenterId: string, input: {
  code: string;
  slug: string;
  name: string;
  description?: string;
  locationName?: string;
  processProfile?: string;
  isActive: boolean;
}) {
  const { data, error } = await client
    .from("profit_centers")
    .update({
      code: input.code,
      slug: input.slug,
      name: input.name,
      description: input.description || null,
      location_name: input.locationName || null,
      process_profile: input.processProfile || null,
      is_active: input.isActive,
    })
    .eq("id", profitCenterId)
    .select("id, code, slug, name, description, location_name, process_profile, is_active")
    .single();

  if (error) throw error;

  return toProfitCenter(data);
}

export async function fetchAppModules(): Promise<AppModuleRecord[]> {
  const { data, error } = await client
    .from("app_modules")
    .select("id, module_key, route_segment, default_label, description, icon_name, sort_order, is_active, is_configurable")
    .order("sort_order");

  if (error) throw error;

  return (data ?? []).map(toAppModule);
}

export async function upsertProfitCenterModuleConfig(input: {
  profitCenterId: string;
  moduleId: string;
  navLabel?: string;
  routeSegment?: string;
  sortOrder: number;
  isEnabled: boolean;
  isDefaultEntry: boolean;
}) {
  const { error } = await client
    .from("profit_center_modules")
    .upsert(
      {
        profit_center_id: input.profitCenterId,
        module_id: input.moduleId,
        nav_label: input.navLabel || null,
        route_segment: input.routeSegment || null,
        sort_order: input.sortOrder,
        is_enabled: input.isEnabled,
        is_default_entry: input.isDefaultEntry,
      },
      { onConflict: "profit_center_id,module_id" },
    );

  if (error) throw error;
}

export async function upsertProfitCenterSetting(input: {
  profitCenterId: string;
  settingKey: string;
  scope: string;
  settingValue: Record<string, unknown>;
}) {
  const { error } = await client
    .from("profit_center_settings")
    .upsert(
      {
        profit_center_id: input.profitCenterId,
        setting_key: input.settingKey,
        scope: input.scope,
        setting_value: input.settingValue,
        is_active: true,
      },
      { onConflict: "profit_center_id,scope,setting_key" },
    );

  if (error) throw error;
}

export async function fetchManageableProfiles(): Promise<ManageableProfile[]> {
  const { data, error } = await client
    .from("profiles")
    .select("user_id, display_name, department, job_title")
    .order("display_name");

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    userId: row.user_id,
    displayName: row.display_name ?? null,
    department: row.department ?? null,
    jobTitle: row.job_title ?? null,
  }));
}

export async function fetchProfitCenterAssignmentsForWorkspace(profitCenterId: string): Promise<Array<{ userId: string; isDefault: boolean; isActive: boolean }>> {
  const { data, error } = await client
    .from("user_profit_centers")
    .select("user_id, is_default, is_active")
    .eq("profit_center_id", profitCenterId)
    .order("created_at");

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    userId: row.user_id,
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active),
  }));
}

export async function assignUserToProfitCenter(input: {
  userId: string;
  profitCenterId: string;
  isDefault: boolean;
}) {
  const { error } = await client
    .from("user_profit_centers")
    .upsert(
      {
        user_id: input.userId,
        profit_center_id: input.profitCenterId,
        is_default: input.isDefault,
        is_active: true,
      },
      { onConflict: "user_id,profit_center_id" },
    );

  if (error) throw error;
}

export async function fetchAuditLogPage(input: {
  profitCenterId?: string | null;
  limit?: number;
  offset?: number;
} = {}): Promise<AuditLogPage> {
  const limit = input.limit ?? AUDIT_LOG_PAGE_SIZE;
  const offset = input.offset ?? 0;
  let query = client
    .from("audit_logs")
    .select("id, actor_user_id, profit_center_id, entity_type, entity_id, action, change_summary, context, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit);

  if (input.profitCenterId) {
    query = query.eq("profit_center_id", input.profitCenterId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).map(toAuditLog);

  return {
    logs: rows.slice(0, limit),
    hasMore: rows.length > limit,
    nextOffset: rows.length > limit ? offset + limit : null,
  };
}

export async function fetchAuditLogs(profitCenterId?: string | null): Promise<AuditLogRecord[]> {
  const { logs } = await fetchAuditLogPage({ profitCenterId, limit: AUDIT_LOG_PAGE_SIZE, offset: 0 });
  return logs;
}

export async function createAuditLog(input: {
  actorUserId: string;
  profitCenterId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  changeSummary?: Record<string, unknown>;
  context?: Record<string, unknown>;
}) {
  const { error } = await client.from("audit_logs").insert({
    actor_user_id: input.actorUserId,
    profit_center_id: input.profitCenterId ?? null,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    action: input.action,
    change_summary: input.changeSummary ?? {},
    context: input.context ?? {},
  });

  if (error) throw error;
}

export function getDefaultModule(modules: ConfiguredModule[]) {
  return modules.find((module) => module.isDefaultEntry) ?? modules[0] ?? null;
}
