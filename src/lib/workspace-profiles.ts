// Process Profile registry — Phase A foundation.
// SSOT for what each workspace "is" and which production landing it renders.
// Aligned with WORKSPACE_PROFILES.md §1, §2.

export type ProcessProfile =
  | "power"
  | "ferro_alloy"
  | "dri"
  | "refining"
  | "steel_melting";

export const PROCESS_PROFILES: ProcessProfile[] = [
  "power",
  "ferro_alloy",
  "dri",
  "refining",
  "steel_melting",
];

export interface ProcessProfileConfig {
  key: ProcessProfile;
  shortLabel: string;
  longLabel: string;
  productionLabel: string;
  productionTagline: string;
  // route segment under /portal that holds the profile's production landing.
  // Phase A: all map to /portal/production which dispatches by profile.
  productionRoute: string;
  // Module keys (from app_modules.module_key) that are FAD-only and must be
  // hidden when profile !== 'ferro_alloy'. Empty for the FAD profile itself.
  hideModuleKeys: string[];
}

export const PROCESS_PROFILE_CONFIG: Record<ProcessProfile, ProcessProfileConfig> = {
  power: {
    key: "power",
    shortLabel: "CPP",
    longLabel: "Captive Power Plant",
    productionLabel: "Power Generation",
    productionTagline: "Generation log, fuel & auxiliaries, outage tracker, PC allocation.",
    productionRoute: "/portal/production",
    hideModuleKeys: ["sales"],
  },
  ferro_alloy: {
    key: "ferro_alloy",
    shortLabel: "FAD",
    longLabel: "Ferro Alloy Division",
    productionLabel: "Ferro Alloy Heats",
    productionTagline: "Heat entry, charge mix, tap, chemistry, Mn/Si recovery.",
    productionRoute: "/portal/production",
    hideModuleKeys: [],
  },
  dri: {
    key: "dri",
    shortLabel: "DRI",
    longLabel: "Direct Reduced Iron",
    productionLabel: "Kiln Production",
    productionTagline: "Kiln shift log, metallization & FeM, campaign register, transfers to SMS.",
    productionRoute: "/portal/production",
    hideModuleKeys: [],
  },
  refining: {
    key: "refining",
    shortLabel: "CLU",
    longLabel: "Conversion / Ladle / Refining Unit",
    productionLabel: "Treatment & Refining",
    productionTagline: "Treatment queue, additions, chemistry correction, approvals.",
    productionRoute: "/portal/production",
    hideModuleKeys: [],
  },
  steel_melting: {
    key: "steel_melting",
    shortLabel: "SMS",
    longLabel: "Steel Melting Shop",
    productionLabel: "Steel Heats",
    productionTagline: "Heat, ladle metallurgy, casting, billets & ingots, dispatch.",
    productionRoute: "/portal/production",
    hideModuleKeys: [],
  },
};

export function isProcessProfile(value: unknown): value is ProcessProfile {
  return typeof value === "string" && (PROCESS_PROFILES as string[]).includes(value);
}

/**
 * Resolve a normalized ProcessProfile from a raw value (DB column or legacy text).
 * Falls back to `ferro_alloy` for unknown input to preserve current behavior.
 */
export function resolveProcessProfile(raw: string | null | undefined): ProcessProfile {
  if (isProcessProfile(raw)) return raw;
  return "ferro_alloy";
}

export function getProfileConfig(raw: string | null | undefined): ProcessProfileConfig {
  return PROCESS_PROFILE_CONFIG[resolveProcessProfile(raw)];
}
