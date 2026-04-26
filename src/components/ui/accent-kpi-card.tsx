/**
 * AccentKpiCard — shared dashboard KPI tile used across every plant module.
 *
 * Visual language matches the Sales Dashboard reference: a 4-px coloured
 * left border + icon top-right + large bold value. The colour comes from a
 * single semantic map keyed by source `module`, so the same KPI looks the
 * same everywhere it appears (Command Deck, module dashboard, Maintenance
 * tab, etc.).
 *
 * Rules:
 * - Per user decision (2026-04-26): accent is **By source module (semantic)**.
 *   Production=blue, Quality=emerald, Inventory=amber, Procurement=violet,
 *   Maintenance=red, Finance=indigo, Sales=pink, neutral=slate.
 * - This file is presentation-only — no business logic, no data fetching.
 * - Module modules pass the same `module` value across every card on a tab,
 *   except for "neutral" cards that intentionally read as workspace-level
 *   chrome.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type ModuleAccent =
  | "production"
  | "quality"
  | "inventory"
  | "procurement"
  | "maintenance"
  | "finance"
  | "sales"
  | "neutral";

interface AccentTokens {
  /** Tailwind border-l-* class — 4px left rail. */
  border: string;
  /** Tailwind text-* class for the small icon shown in the header. */
  icon: string;
  /** Tailwind bg-* class for the icon-bubble variant (used by some tabs). */
  iconBg: string;
  /** Tailwind text-* class for the icon-bubble variant. */
  iconBubbleText: string;
}

/**
 * Single source of truth for module → colour mapping. Exported so unit tests
 * can lock the contract and other components (e.g. PlantHeadDashboard) can
 * read the same tokens instead of re-declaring them.
 */
export const MODULE_ACCENTS: Record<ModuleAccent, AccentTokens> = {
  production:  { border: "border-l-blue-500",    icon: "text-blue-500",    iconBg: "bg-blue-50 dark:bg-blue-950/40",       iconBubbleText: "text-blue-600 dark:text-blue-300" },
  quality:     { border: "border-l-emerald-500", icon: "text-emerald-500", iconBg: "bg-emerald-50 dark:bg-emerald-950/40", iconBubbleText: "text-emerald-600 dark:text-emerald-300" },
  inventory:   { border: "border-l-amber-500",   icon: "text-amber-500",   iconBg: "bg-amber-50 dark:bg-amber-950/40",     iconBubbleText: "text-amber-600 dark:text-amber-300" },
  procurement: { border: "border-l-violet-500",  icon: "text-violet-500",  iconBg: "bg-violet-50 dark:bg-violet-950/40",   iconBubbleText: "text-violet-600 dark:text-violet-300" },
  maintenance: { border: "border-l-red-500",     icon: "text-red-500",     iconBg: "bg-red-50 dark:bg-red-950/40",         iconBubbleText: "text-red-600 dark:text-red-300" },
  finance:     { border: "border-l-indigo-500",  icon: "text-indigo-500",  iconBg: "bg-indigo-50 dark:bg-indigo-950/40",   iconBubbleText: "text-indigo-600 dark:text-indigo-300" },
  sales:       { border: "border-l-pink-500",    icon: "text-pink-500",    iconBg: "bg-pink-50 dark:bg-pink-950/40",       iconBubbleText: "text-pink-600 dark:text-pink-300" },
  neutral:     { border: "border-l-slate-400",   icon: "text-slate-500",   iconBg: "bg-muted",                              iconBubbleText: "text-foreground" },
};

interface AccentKpiCardProps {
  /** Module the KPI belongs to — drives the colour rail. */
  module: ModuleAccent;
  /** Top-right icon. */
  icon: React.ComponentType<{ className?: string }>;
  /** KPI label, e.g. "Total Inquiries". */
  title: string;
  /** Pre-formatted value as displayed (e.g. "1,250" or "—"). */
  value: string;
  /** Optional unit shown after the value (e.g. "MT", "%"). */
  unit?: string;
  /** Sub-line below the value. */
  sub?: string;
  /** Optional click handler (renders pointer cursor + hover lift). */
  onClick?: () => void;
}

/**
 * Single KPI tile. Use the `module` prop to pick the colour — never pass
 * raw Tailwind classes for the accent.
 */
export function AccentKpiCard({
  module, icon: Icon, title, value, unit, sub, onClick,
}: AccentKpiCardProps) {
  const tokens = MODULE_ACCENTS[module];
  const interactive = onClick != null;
  return (
    <Card
      className={`border-l-4 ${tokens.border} ${interactive ? "cursor-pointer transition-shadow hover:shadow-md" : ""}`}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") onClick?.(); } : undefined}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${tokens.icon}`} />
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-foreground">{value}</span>
          {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        </div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
