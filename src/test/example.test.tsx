import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "@/pages/Login";
import ProfitCenterSelector from "@/pages/ProfitCenterSelector";
import { RequireAdmin } from "@/components/RequireAdmin";
import { PortalShell } from "@/components/PortalShell";
import AdminAudit from "@/pages/AdminAudit";
import { canEditHeatLogClient, describeRule, userRoleAllows, type PermissionGrant } from "@/lib/permissions";

const navigateMock = vi.fn();
const logoutMock = vi.fn();
const { fetchAuditLogPageMock } = vi.hoisted(() => ({
  fetchAuditLogPageMock: vi.fn(),
}));

const buildAuditLog = (index: number) => ({
  id: `log-${index}`,
  actorUserId: `u${index}`,
  profitCenterId: "pc-1",
  entityType: index % 2 === 0 ? "profit_center" : "module",
  entityId: `entity-${index}`,
  action: `audit.action.${index}`,
  changeSummary: { index },
  context: {},
  createdAt: new Date(Date.UTC(2026, 3, 23, 6, index, 0)).toISOString(),
});

const initialAuditLogs = Array.from({ length: 20 }, (_, index) => buildAuditLog(index + 1));
const nextAuditLogs = Array.from({ length: 5 }, (_, index) => buildAuditLog(index + 21));

const authState = {
  session: null as null | { user: { id: string } },
  profile: { display_name: "Arjun Rao", department: "Operations", role: "admin" },
};

const workspaceState = {
  loading: false,
  assignments: [
    {
      id: "a1",
      userId: "u1",
      profitCenterId: "pc-1",
      isDefault: true,
      isActive: true,
      profitCenter: {
        id: "pc-1",
        code: "SMS",
        slug: "sms",
        name: "SMS Plant",
        description: "Steel melt shop workspace",
        locationName: "Raipur",
        processProfile: "SMS process",
        isActive: true,
      },
    },
    {
      id: "a2",
      userId: "u1",
      profitCenterId: "pc-2",
      isDefault: false,
      isActive: true,
      profitCenter: {
        id: "pc-2",
        code: "FAD",
        slug: "fad",
        name: "Ferro Alloys Division",
        description: "Ferro alloys workspace",
        locationName: "Balaghat",
        processProfile: "Ferro process",
        isActive: true,
      },
    },
  ],
  activeProfitCenter: {
    id: "pc-1",
    code: "SMS",
    slug: "sms",
    name: "SMS Plant",
    description: "Steel melt shop workspace",
    locationName: "Raipur",
    processProfile: "SMS process",
    isActive: true,
  },
  activeProfitCenterId: "pc-1",
  modules: [
    { id: "m1", moduleId: "mod-1", moduleKey: "inventory", routeSegment: "inventory", navLabel: "Stores", description: "Inventory module", iconName: "warehouse", sortOrder: 10, isDefaultEntry: false },
    { id: "m2", moduleId: "mod-2", moduleKey: "reports", routeSegment: "reports", navLabel: "Management Reports", description: "Reports module", iconName: "file-bar-chart-2", sortOrder: 20, isDefaultEntry: true },
  ],
  settings: [],
  allProfitCenters: [
    {
      id: "pc-1",
      code: "SMS",
      slug: "sms",
      name: "SMS Plant",
      description: "Steel melt shop workspace",
      locationName: "Raipur",
      processProfile: "SMS process",
      isActive: true,
    },
  ],
  appModules: [
    { id: "mod-1", moduleKey: "inventory", routeSegment: "inventory", defaultLabel: "Inventory", description: "Inventory module", iconName: "warehouse", sortOrder: 10, isActive: true, isConfigurable: true },
  ],
  manageableProfiles: [
    { userId: "u1", displayName: "Arjun Rao", department: "Operations", jobTitle: "Admin" },
  ],
  workspaceAssignments: [
    { userId: "u1", isDefault: true, isActive: true },
  ],
  auditLogs: initialAuditLogs,
  auditLogsHasMore: true,
  auditLogsNextOffset: 20,
  defaultModule: { id: "m2", moduleId: "mod-2", moduleKey: "reports", routeSegment: "reports", navLabel: "Management Reports", description: "Reports module", iconName: "file-bar-chart-2", sortOrder: 20, isDefaultEntry: true },
  isAdmin: true,
  isSuperAdmin: false,
  selectProfitCenter: vi.fn(),
  refreshWorkspace: vi.fn(),
};

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    session: authState.session,
    signIn: vi.fn(),
    logout: logoutMock,
    loading: false,
    profile: authState.profile,
    refreshProfile: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-workspace", () => ({
  useWorkspace: () => workspaceState,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/auth-storage", () => ({
  getRememberPreference: () => false,
  setRememberPreference: vi.fn(),
  authStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({
  requestPasswordReset: vi.fn(),
}));

vi.mock("@/lib/workspace", () => ({
  AUDIT_LOG_PAGE_SIZE: 20,
  fetchAuditLogPage: fetchAuditLogPageMock,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

describe("Login page", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    logoutMock.mockReset();
    fetchAuditLogPageMock.mockReset();
    authState.session = null;
    authState.profile = { display_name: "Arjun Rao", department: "Operations", role: "admin" };
    workspaceState.isAdmin = true;
    workspaceState.auditLogs = initialAuditLogs;
    workspaceState.auditLogsHasMore = true;
    workspaceState.auditLogsNextOffset = 20;
  });

  it("shows sign-in only and keeps password reset access", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Login />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByText(/accounts are provisioned by administrators only/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /forgot password\?/i })).toBeInTheDocument();
    expect(screen.queryByText(/request access/i)).not.toBeInTheDocument();
  });

  it("shows assigned workspaces for selection", () => {
    authState.session = { user: { id: "u1" } };

    render(
      <MemoryRouter initialEntries={["/profit-centers"]}>
        <ProfitCenterSelector />
      </MemoryRouter>,
    );

    expect(screen.getByText(/choose your operating workspace/i)).toBeInTheDocument();
    expect(screen.getByText(/SMS Plant/i)).toBeInTheDocument();
    expect(screen.getByText(/Ferro Alloys Division/i)).toBeInTheDocument();
  });

  it("redirects non-admin users away from admin routes", () => {
    authState.session = { user: { id: "u1" } };
    authState.profile = { display_name: "Arjun Rao", department: "Operations", role: "user" };
    workspaceState.isAdmin = false;

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<div>Admin</div>} />
          </Route>
          <Route path="/portal" element={<div>Portal</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    expect(screen.getByText("Portal")).toBeInTheDocument();
  });

  it("renders portal navigation from configured modules", () => {
    authState.session = { user: { id: "u1" } };

    render(
      <MemoryRouter initialEntries={["/portal/reports"]}>
        <Routes>
          <Route path="/portal" element={<PortalShell />}>
            <Route path=":module" element={<div>Module content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Stores")).toBeInTheDocument();
    expect(screen.getAllByText("Management Reports").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Production$/)).not.toBeInTheDocument();
  });

  it("renders audit records in the admin area", () => {
    authState.session = { user: { id: "u1" } };

    render(
      <MemoryRouter>
        <AdminAudit />
      </MemoryRouter>,
    );

    expect(screen.getByText("audit.action.1")).toBeInTheDocument();
    expect(screen.getAllByText("profit_center").length).toBeGreaterThan(0);
    expect(screen.getByText(/page 1 of 1/i)).toBeInTheDocument();
  });

  it("loads older audit records on demand", async () => {
    authState.session = { user: { id: "u1" } };
    fetchAuditLogPageMock.mockResolvedValue({
      logs: nextAuditLogs,
      hasMore: false,
      nextOffset: null,
    });

    render(
      <MemoryRouter>
        <AdminAudit />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    await waitFor(() => {
      expect(fetchAuditLogPageMock).toHaveBeenCalledWith({
        profitCenterId: "pc-1",
        limit: 20,
        offset: 20,
      });
    });
    expect(await screen.findByText(/page 1 of 2/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: /go to next page/i }));

    expect(screen.getByText("audit.action.21")).toBeInTheDocument();
    expect(screen.queryByText("audit.action.1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /no more records/i })).toBeDisabled();
  });

  it("renders the empty audit state when no records are available", () => {
    authState.session = { user: { id: "u1" } };
    workspaceState.auditLogs = [];
    workspaceState.auditLogsHasMore = false;
    workspaceState.auditLogsNextOffset = null;

    render(
      <MemoryRouter>
        <AdminAudit />
      </MemoryRouter>,
    );

    expect(screen.getByText(/no audit records are visible for the current scope yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });
});

describe("Permission rule helpers (Phase 3)", () => {
  const grants: PermissionGrant[] = [
    { id: "g1", role: "operator", resource: "heat_log", action: "create", rule: { type: "always" }, isActive: true },
    { id: "g2", role: "operator", resource: "heat_log", action: "update", rule: { type: "within_minutes", minutes: 60 }, isActive: true },
    { id: "g3", role: "user", resource: "heat_log", action: "update", rule: { type: "never" }, isActive: true },
    { id: "g4", role: "admin", resource: "heat_log", action: "update", rule: { type: "always" }, isActive: true },
    { id: "g5", role: "manager", resource: "heat_log", action: "update", rule: { type: "same_shift" }, isActive: true },
  ];

  it("describes each rule type for the admin UI", () => {
    expect(describeRule({ type: "always" })).toMatch(/always/i);
    expect(describeRule({ type: "never" })).toMatch(/never/i);
    expect(describeRule({ type: "within_minutes", minutes: 30 })).toMatch(/30/);
    expect(describeRule({ type: "same_shift" })).toMatch(/shift/i);
  });

  it("allows operators to create heat logs and denies users", () => {
    expect(userRoleAllows(grants, "operator", "heat_log", "create")).toBe(true);
    expect(userRoleAllows(grants, "user", "heat_log", "create")).toBe(false);
  });

  it("respects the within_minutes window for operators", () => {
    const fresh = { createdAt: new Date(Date.now() - 10 * 60_000).toISOString(), tapTime: new Date().toISOString() };
    const stale = { createdAt: new Date(Date.now() - 120 * 60_000).toISOString(), tapTime: new Date().toISOString() };
    expect(canEditHeatLogClient(grants, "operator", fresh)).toBe(true);
    expect(canEditHeatLogClient(grants, "operator", stale)).toBe(false);
  });

  it("blocks edit for never-grant roles regardless of timing", () => {
    const fresh = { createdAt: new Date().toISOString(), tapTime: new Date().toISOString() };
    expect(canEditHeatLogClient(grants, "user", fresh)).toBe(false);
  });

  it("allows always-grant roles to edit anytime", () => {
    const old = { createdAt: new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString(), tapTime: new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString() };
    expect(canEditHeatLogClient(grants, "admin", old)).toBe(true);
  });

  it("allows manager same-shift edits when tap time is today", () => {
    const today = { createdAt: new Date().toISOString(), tapTime: new Date().toISOString() };
    const yesterday = { createdAt: new Date(Date.now() - 48 * 60 * 60_000).toISOString(), tapTime: new Date(Date.now() - 48 * 60 * 60_000).toISOString() };
    expect(canEditHeatLogClient(grants, "manager", today)).toBe(true);
    expect(canEditHeatLogClient(grants, "manager", yesterday)).toBe(false);
  });
});
