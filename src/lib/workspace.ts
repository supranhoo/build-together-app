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

export function getDefaultModule(modules: ConfiguredModule[]) {
  return modules.find((module) => module.isDefaultEntry) ?? modules[0] ?? null;
}
