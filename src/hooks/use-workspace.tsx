import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  clearActiveProfitCenterPreference,
  getActiveProfitCenterPreference,
  setActiveProfitCenterPreference,
} from "@/lib/workspace-storage";
import {
  fetchAuditLogPage,
  fetchAllProfitCenters,
  fetchAppModules,
  fetchAssignedProfitCenters,
  fetchConfiguredModules,
  fetchManageableProfiles,
  fetchProfitCenterAssignmentsForWorkspace,
  fetchProfitCenterSettings,
  getDefaultModule,
  type AppModuleRecord,
  type AuditLogRecord,
  type ConfiguredModule,
  type ManageableProfile,
  type ProfitCenter,
  type ProfitCenterAssignment,
  type ProfitCenterSetting,
} from "@/lib/workspace";

interface WorkspaceContextValue {
  loading: boolean;
  assignments: ProfitCenterAssignment[];
  activeProfitCenter: ProfitCenter | null;
  activeProfitCenterId: string | null;
  modules: ConfiguredModule[];
  settings: ProfitCenterSetting[];
  allProfitCenters: ProfitCenter[];
  appModules: AppModuleRecord[];
  manageableProfiles: ManageableProfile[];
  workspaceAssignments: Array<{ userId: string; isDefault: boolean; isActive: boolean }>;
  auditLogs: AuditLogRecord[];
  auditLogsHasMore: boolean;
  auditLogsNextOffset: number | null;
  defaultModule: ConfiguredModule | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  selectProfitCenter: (profitCenterId: string | null) => void;
  refreshWorkspace: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

function chooseInitialProfitCenter(assignments: ProfitCenterAssignment[]) {
  const storedId = getActiveProfitCenterPreference();

  if (storedId && assignments.some((assignment) => assignment.profitCenterId === storedId)) {
    return storedId;
  }

  const defaultAssignment = assignments.find((assignment) => assignment.isDefault);
  if (defaultAssignment) return defaultAssignment.profitCenterId;

  if (assignments.length === 1) return assignments[0].profitCenterId;

  return null;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { session, profile, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<ProfitCenterAssignment[]>([]);
  const [activeProfitCenterId, setActiveProfitCenterId] = useState<string | null>(null);
  const [modules, setModules] = useState<ConfiguredModule[]>([]);
  const [settings, setSettings] = useState<ProfitCenterSetting[]>([]);
  const [allProfitCenters, setAllProfitCenters] = useState<ProfitCenter[]>([]);
  const [appModules, setAppModules] = useState<AppModuleRecord[]>([]);
  const [manageableProfiles, setManageableProfiles] = useState<ManageableProfile[]>([]);
  const [workspaceAssignments, setWorkspaceAssignments] = useState<Array<{ userId: string; isDefault: boolean; isActive: boolean }>>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [auditLogsHasMore, setAuditLogsHasMore] = useState(false);
  const [auditLogsNextOffset, setAuditLogsNextOffset] = useState<number | null>(null);

  const refreshAdminState = async (profitCenterId: string | null, role: string | null | undefined) => {
    if (!session?.user || !role || (role !== "admin" && role !== "super_admin")) {
      setAllProfitCenters([]);
      setAppModules([]);
      setManageableProfiles([]);
      setWorkspaceAssignments([]);
      setAuditLogs([]);
      setAuditLogsHasMore(false);
      setAuditLogsNextOffset(null);
      return;
    }

    const [nextProfitCenters, nextAppModules, nextProfiles, nextAuditLogPage, nextWorkspaceAssignments] = await Promise.all([
      fetchAllProfitCenters(),
      fetchAppModules(),
      fetchManageableProfiles(),
      fetchAuditLogPage({ profitCenterId }),
      profitCenterId ? fetchProfitCenterAssignmentsForWorkspace(profitCenterId) : Promise.resolve([]),
    ]);

    setAllProfitCenters(nextProfitCenters);
    setAppModules(nextAppModules);
    setManageableProfiles(nextProfiles);
    setAuditLogs(nextAuditLogPage.logs);
    setAuditLogsHasMore(nextAuditLogPage.hasMore);
    setAuditLogsNextOffset(nextAuditLogPage.nextOffset);
    setWorkspaceAssignments(nextWorkspaceAssignments);
  };

  useEffect(() => {
    if (authLoading) return;

    if (!session?.user) {
      setAssignments([]);
      setActiveProfitCenterId(null);
      setModules([]);
      setSettings([]);
      setAllProfitCenters([]);
      setAppModules([]);
      setManageableProfiles([]);
      setWorkspaceAssignments([]);
      setAuditLogs([]);
      setAuditLogsHasMore(false);
      setAuditLogsNextOffset(null);
      clearActiveProfitCenterPreference();
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadAssignments = async () => {
      setLoading(true);
      try {
        const nextAssignments = await fetchAssignedProfitCenters(session.user.id);
        if (!isMounted) return;

        setAssignments(nextAssignments);

        const nextActiveId = chooseInitialProfitCenter(nextAssignments);
        setActiveProfitCenterId(nextActiveId);

        if (nextActiveId) {
          setActiveProfitCenterPreference(nextActiveId);
        } else {
          clearActiveProfitCenterPreference();
        }
      } catch {
        if (!isMounted) return;
        setAssignments([]);
        setActiveProfitCenterId(null);
        setModules([]);
        setSettings([]);
        setAllProfitCenters([]);
        setAppModules([]);
        setManageableProfiles([]);
        setWorkspaceAssignments([]);
        setAuditLogs([]);
        setAuditLogsHasMore(false);
        setAuditLogsNextOffset(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadAssignments();

    return () => {
      isMounted = false;
    };
  }, [authLoading, session?.user?.id]);

  useEffect(() => {
    if (authLoading || !session?.user) return;

    if (!activeProfitCenterId) {
      setModules([]);
      setSettings([]);
      return;
    }

    let isMounted = true;

    const loadWorkspaceState = async () => {
      setLoading(true);
      try {
        const [nextModules, nextSettings] = await Promise.all([
          fetchConfiguredModules(activeProfitCenterId),
          fetchProfitCenterSettings(activeProfitCenterId),
        ]);

        if (!isMounted) return;
        setModules(nextModules);
        setSettings(nextSettings);
      } catch {
        if (!isMounted) return;
        setModules([]);
        setSettings([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadWorkspaceState();

    return () => {
      isMounted = false;
    };
  }, [activeProfitCenterId, authLoading, session?.user]);

  useEffect(() => {
    if (authLoading || !session?.user || (!profile?.role || (profile.role !== "admin" && profile.role !== "super_admin"))) {
      setAllProfitCenters([]);
      setAppModules([]);
      setManageableProfiles([]);
      setWorkspaceAssignments([]);
      setAuditLogs([]);
      setAuditLogsHasMore(false);
      setAuditLogsNextOffset(null);
      return;
    }

    let isMounted = true;

    const loadAdminState = async () => {
      try {
        await refreshAdminState(activeProfitCenterId, profile?.role);
        if (!isMounted) return;
      } catch {
        if (!isMounted) return;
        setAllProfitCenters([]);
        setAppModules([]);
        setManageableProfiles([]);
        setWorkspaceAssignments([]);
        setAuditLogs([]);
        setAuditLogsHasMore(false);
        setAuditLogsNextOffset(null);
      }
    };

    void loadAdminState();

    return () => {
      isMounted = false;
    };
  }, [activeProfitCenterId, authLoading, profile?.role, session?.user]);

  const value = useMemo<WorkspaceContextValue>(() => {
    const activeAssignment = assignments.find((assignment) => assignment.profitCenterId === activeProfitCenterId) ?? null;
    const activeProfitCenter = activeAssignment?.profitCenter ?? null;

    return {
      loading: authLoading || loading,
      assignments,
      activeProfitCenter,
      activeProfitCenterId,
      modules,
      settings,
      allProfitCenters,
      appModules,
      manageableProfiles,
      workspaceAssignments,
      auditLogs,
      auditLogsHasMore,
      auditLogsNextOffset,
      defaultModule: getDefaultModule(modules),
      isAdmin: profile?.role === "admin" || profile?.role === "super_admin",
      isSuperAdmin: profile?.role === "super_admin",
      selectProfitCenter: (profitCenterId) => {
        if (!profitCenterId) {
          setActiveProfitCenterId(null);
          clearActiveProfitCenterPreference();
          return;
        }

        if (!assignments.some((assignment) => assignment.profitCenterId === profitCenterId)) {
          return;
        }

        setActiveProfitCenterId(profitCenterId);
        setActiveProfitCenterPreference(profitCenterId);
      },
      refreshWorkspace: async () => {
        if (!session?.user) return;

        const nextAssignments = await fetchAssignedProfitCenters(session.user.id);
        setAssignments(nextAssignments);

        const isActiveStillValid = activeProfitCenterId && nextAssignments.some((assignment) => assignment.profitCenterId === activeProfitCenterId);
        const nextActiveId = isActiveStillValid ? activeProfitCenterId : chooseInitialProfitCenter(nextAssignments);

        setActiveProfitCenterId(nextActiveId);

        if (nextActiveId) {
          setActiveProfitCenterPreference(nextActiveId);
          const [nextModules, nextSettings] = await Promise.all([
            fetchConfiguredModules(nextActiveId),
            fetchProfitCenterSettings(nextActiveId),
          ]);
          setModules(nextModules);
          setSettings(nextSettings);
        } else {
          clearActiveProfitCenterPreference();
          setModules([]);
          setSettings([]);
        }

        await refreshAdminState(nextActiveId, profile?.role);
      },
    };
  }, [activeProfitCenterId, allProfitCenters, appModules, assignments, auditLogs, auditLogsHasMore, auditLogsNextOffset, authLoading, loading, manageableProfiles, modules, profile?.role, session?.user, settings, workspaceAssignments]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);

  if (!context) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }

  return context;
}
