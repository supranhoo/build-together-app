import { useWorkspace } from "@/hooks/use-workspace";
import { getProfileConfig, resolveProcessProfile } from "@/lib/workspace-profiles";
import PortalProduction from "@/pages/PortalProduction";
import PortalKilnProduction from "@/pages/PortalKilnProduction";
import PortalSteelHeats from "@/pages/PortalSteelHeats";
import PortalProductionCLU from "@/pages/PortalProductionCLU";

// Profile-driven landing for /portal/production.
// FAD (ferro_alloy) keeps the existing PortalProduction experience.
// All other profiles get a Phase A placeholder that names the correct
// landing screen. Real screens land in Phase B (per WORKSPACE_PROFILES.md §11).
function PhaseAPlaceholder({ profileLabel, productionLabel, tagline }: { profileLabel: string; productionLabel: string; tagline: string; }) {
  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">{profileLabel}</p>
        <h1 className="text-2xl font-semibold">{productionLabel}</h1>
        <p className="text-sm text-muted-foreground">{tagline}</p>
      </header>
      <div className="rounded-lg border border-dashed border-border bg-panel p-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Phase A foundation active.</p>
        <p className="mt-2">
          This workspace no longer shows FAD heat entry. The production screens
          for this profile are scheduled for Phase B and will replace this
          placeholder.
        </p>
        <p className="mt-2">
          See <span className="font-mono">WORKSPACE_PROFILES.md §11</span> for the rollout plan.
        </p>
      </div>
    </div>
  );
}

export default function PortalProductionDispatcher() {
  const { activeProfitCenter } = useWorkspace();
  const profile = resolveProcessProfile(activeProfitCenter?.processProfile);

  if (profile === "ferro_alloy") {
    return <PortalProduction />;
  }
  if (profile === "dri") {
    return <PortalKilnProduction />;
  }
  if (profile === "steel_melting") {
    return <PortalSteelHeats />;
  }
  if (profile === "refining") {
    return <PortalProductionCLU />;
  }

  const cfg = getProfileConfig(profile);
  return (
    <PhaseAPlaceholder
      profileLabel={cfg.longLabel}
      productionLabel={cfg.productionLabel}
      tagline={cfg.productionTagline}
    />
  );
}
