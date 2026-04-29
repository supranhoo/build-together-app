import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Building2,
  GitMerge,
  Key,
  Lock,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";

import AdminUsers from "./AdminUsers";
import AdminRoles from "./AdminRoles";
import AdminWorkspaces from "./AdminWorkspaces";
import AdminSystemLogic from "./AdminSystemLogic";
import AdminWorkflows from "./AdminWorkflows";
import AdminAudit from "./AdminAudit";
import AdminPolicies from "./AdminPolicies";

/**
 * Unified System Control page — single landing pad that mirrors the uploaded
 * Admin.tsx layout (7 tabs) but DOES NOT duplicate logic. Each tab embeds the
 * existing admin component so RLS, audit, and master-data SSOT are preserved
 * (Rules #3, #5, #8).
 *
 * Tab → Existing component mapping:
 *  - users          → AdminUsers
 *  - rbac           → AdminRoles  (Roles & Permissions matrix)
 *  - profit-centers → AdminWorkspaces (PC Dashboard)
 *  - pc-settings    → AdminSystemLogic (per-PC module mappings + system logic)
 *  - workflows      → AdminWorkflows (placeholder; backed feature pending)
 *  - audit          → AdminAudit
 *  - security       → AdminPolicies (read-only posture)
 */
export const SYSTEM_CONTROL_TABS = [
  { key: "users", label: "Users", Icon: Users, Component: AdminUsers },
  { key: "rbac", label: "RBAC/ABAC", Icon: Key, Component: AdminRoles },
  { key: "profit-centers", label: "PC Dashboard", Icon: Building2, Component: AdminWorkspaces },
  { key: "pc-settings", label: "PC Settings", Icon: Settings2, Component: AdminSystemLogic },
  { key: "workflows", label: "Workflows", Icon: GitMerge, Component: AdminWorkflows },
  { key: "audit", label: "Audit Logs", Icon: Activity, Component: AdminAudit },
  { key: "security", label: "Policies", Icon: Lock, Component: AdminPolicies },
] as const;

export type SystemControlTabKey = (typeof SYSTEM_CONTROL_TABS)[number]["key"];

/** Pure helper — exported for tests. Falls back to first tab on invalid input. */
export function resolveSystemControlTab(raw: string | null | undefined): SystemControlTabKey {
  const valid = SYSTEM_CONTROL_TABS.map((t) => t.key);
  return (valid as readonly string[]).includes(raw ?? "")
    ? (raw as SystemControlTabKey)
    : SYSTEM_CONTROL_TABS[0].key;
}

export default function AdminSystemControl() {
  const [params, setParams] = useSearchParams();
  const active = useMemo(() => resolveSystemControlTab(params.get("tab")), [params]);

  const handleChange = (next: string) => {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        updated.set("tab", next);
        return updated;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">System Control</h1>
          <p className="text-sm text-muted-foreground">
            Dynamic Role-Based Security (RBS) &amp; System Configuration
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1">
            <ShieldCheck className="h-3 w-3" /> System Secure
          </Badge>
          <Badge variant="outline">RLS Enforced</Badge>
        </div>
      </div>

      <Tabs value={active} onValueChange={handleChange} className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
          {SYSTEM_CONTROL_TABS.map(({ key, label, Icon }) => (
            <TabsTrigger
              key={key}
              value={key}
              className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Icon className="h-4 w-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {SYSTEM_CONTROL_TABS.map(({ key, Component }) => (
          <TabsContent key={key} value={key} className="mt-4">
            <Component />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
