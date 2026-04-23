import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "@/pages/Login";
import ProfitCenterSelector from "@/pages/ProfitCenterSelector";
import { RequireAdmin } from "@/components/RequireAdmin";
import { PortalShell } from "@/components/PortalShell";

const navigateMock = vi.fn();
const logoutMock = vi.fn();

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
  defaultModule: { id: "m2", moduleId: "mod-2", moduleKey: "reports", routeSegment: "reports", navLabel: "Management Reports", description: "Reports module", iconName: "file-bar-chart-2", sortOrder: 20, isDefaultEntry: true },
  isAdmin: true,
  isSuperAdmin: false,
  selectProfitCenter: vi.fn(),
  refreshWorkspace: vi.fn(),
};

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    session: { user: { id: "u1" } },
    signIn: vi.fn(),
    logout: logoutMock,
    loading: false,
    profile: { display_name: "Arjun Rao", department: "Operations", role: "admin" },
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
}));

vi.mock("@/lib/auth", () => ({
  requestPasswordReset: vi.fn(),
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
    const nonAdminState = { ...workspaceState, isAdmin: false };
    vi.doMock("@/hooks/use-workspace", () => ({ useWorkspace: () => nonAdminState }));

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
  });

  it("renders portal navigation from configured modules", () => {
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
    expect(screen.getByText("Management Reports")).toBeInTheDocument();
    expect(screen.queryByText(/^Production$/)).not.toBeInTheDocument();
  });
});
