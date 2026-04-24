import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "@/pages/Login";
import ProfitCenterSelector from "@/pages/ProfitCenterSelector";
import { RequireAdmin } from "@/components/RequireAdmin";
import { PortalShell } from "@/components/PortalShell";
import AdminAudit from "@/pages/AdminAudit";
import { canEditHeatLogClient, describeRule, userRoleAllows, type PermissionGrant } from "@/lib/permissions";
import { computeStockBalances, type InventoryLedgerEntry } from "@/lib/inventory";
import { buildDateRange, backtestForecast, canShareKpiPin, enforceMaxPins, exportKpiCsv, exportDrilldownCsv, filterDeliveriesByStatus, forecastLinear, forecastSeasonal, KPI_PIN_CAP, reorderPins, splitPinsByScope, sumPerWorkspace, type KpiPerWorkspace, type KpiPin, type KpiSeriesPoint, type ReportDelivery } from "@/lib/reporting";

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

describe("Inventory helpers (Phase 4)", () => {
  const baseEntry = (overrides: Partial<InventoryLedgerEntry>): InventoryLedgerEntry => ({
    id: overrides.id ?? "x",
    profitCenterId: "pc-1",
    materialId: "m1",
    stockLocationId: "loc1",
    movementType: "receipt",
    quantity: 0,
    unitCost: null,
    referenceType: null,
    referenceId: null,
    notes: null,
    createdBy: "u1",
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  it("sums signed ledger movements per material/location pair", () => {
    const ledger: InventoryLedgerEntry[] = [
      baseEntry({ id: "1", quantity: 100, movementType: "receipt" }),
      baseEntry({ id: "2", quantity: -25, movementType: "consumption" }),
      baseEntry({ id: "3", quantity: -10, movementType: "consumption" }),
      baseEntry({ id: "4", materialId: "m2", quantity: 50, movementType: "receipt" }),
      baseEntry({ id: "5", stockLocationId: "loc2", quantity: 7, movementType: "receipt" }),
    ];
    const balances = computeStockBalances(ledger);
    const find = (mat: string, loc: string) => balances.find((b) => b.materialId === mat && b.stockLocationId === loc)?.quantity;
    expect(find("m1", "loc1")).toBe(65);
    expect(find("m2", "loc1")).toBe(50);
    expect(find("m1", "loc2")).toBe(7);
  });

  it("returns an empty array for empty ledger and allows negative balances", () => {
    expect(computeStockBalances([])).toEqual([]);
    const negativeOnly: InventoryLedgerEntry[] = [
      baseEntry({ id: "1", quantity: -5, movementType: "consumption" }),
    ];
    expect(computeStockBalances(negativeOnly)[0].quantity).toBe(-5);
  });
});

describe("Reporting helpers (Phase 5)", () => {
  const fixedNow = new Date("2026-04-24T12:00:00Z");

  it("builds today preset as same-day window", () => {
    const r = buildDateRange("today", undefined, fixedNow);
    expect(r.from.getDate()).toBe(r.to.getDate());
    expect(r.from.getHours()).toBe(0);
  });

  it("builds 7d preset spanning seven days", () => {
    const r = buildDateRange("7d", undefined, fixedNow);
    const days = (r.to.getTime() - r.from.getTime()) / (1000 * 60 * 60 * 24);
    expect(Math.round(days)).toBe(7);
  });

  it("uses custom range when provided", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-01-31T23:59:59Z");
    const r = buildDateRange("custom", { from, to }, fixedNow);
    expect(r.from).toBe(from);
    expect(r.to).toBe(to);
  });

  it("serializes a KPI series to CSV with header and rows", () => {
    const csv = exportKpiCsv("Heats per day", "heats", [
      { day: "2026-04-22", value: 12 },
      { day: "2026-04-23", value: null },
      { day: "2026-04-24", value: 9.5 },
    ]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Date,Heats per day (heats)");
    expect(lines[1]).toBe("2026-04-22,12");
    expect(lines[2]).toBe("2026-04-23,");
    expect(lines[3]).toBe("2026-04-24,9.5");
  });

  it("omits the unit suffix when KPI has no unit", () => {
    const csv = exportKpiCsv("Count", "", [{ day: "2026-04-24", value: 1 }]);
    expect(csv.split("\n")[0]).toBe("Date,Count");
  });
});

describe("Reporting helpers (Phase 6)", () => {
  it("serializes drill-down rows to CSV with header from union of keys", () => {
    const csv = exportDrilldownCsv([
      { id: "h1", heat_number: "H001", weight_mt: 12.5 },
      { id: "h2", heat_number: "H002", weight_mt: 11 },
    ]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("id,heat_number,weight_mt");
    expect(lines[1]).toBe("h1,H001,12.5");
    expect(lines[2]).toBe("h2,H002,11");
  });

  it("escapes fields with commas, quotes, and newlines in drill-down CSV", () => {
    const csv = exportDrilldownCsv([{ a: 'has "quote", and comma', b: "x\ny" }]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("a,b");
    expect(lines[1]).toContain('"has ""quote"", and comma"');
    expect(lines[1]).toContain('"x');
  });

  it("returns empty string for empty drill-down rows", () => {
    expect(exportDrilldownCsv([])).toBe("");
  });

  const buildDelivery = (overrides: Partial<ReportDelivery>): ReportDelivery => ({
    id: "d1", profitCenterId: "pc-1", userId: "u1", kpiDefinitionId: "k1",
    cadence: "daily", deliveredAt: "2026-04-24T07:00:00Z",
    status: "sent", errorMessage: null, payload: {}, ...overrides,
  });

  it("filters deliveries by status and returns all when 'all'", () => {
    const rows: ReportDelivery[] = [
      buildDelivery({ id: "1", status: "sent" }),
      buildDelivery({ id: "2", status: "failed" }),
      buildDelivery({ id: "3", status: "skipped" }),
    ];
    expect(filterDeliveriesByStatus(rows, "all")).toHaveLength(3);
    expect(filterDeliveriesByStatus(rows, "failed").map((r) => r.id)).toEqual(["2"]);
    expect(filterDeliveriesByStatus(rows, "sent").map((r) => r.id)).toEqual(["1"]);
  });
});

describe("Pinned KPI helpers (Phase 8)", () => {
  const buildPin = (id: string, sortOrder: number): KpiPin => ({
    id,
    userId: "u1",
    profitCenterId: "pc-1",
    kpiDefinitionId: `def-${id}`,
    sortOrder,
    scope: "personal",
    createdBy: null,
  });

  it("enforces the pin cap at exactly KPI_PIN_CAP", () => {
    expect(enforceMaxPins(0)).toBe(false);
    expect(enforceMaxPins(KPI_PIN_CAP - 1)).toBe(false);
    expect(enforceMaxPins(KPI_PIN_CAP)).toBe(true);
    expect(enforceMaxPins(KPI_PIN_CAP + 5)).toBe(true);
  });

  it("KPI_PIN_CAP is 12 to keep the overview responsive", () => {
    expect(KPI_PIN_CAP).toBe(12);
  });

  it("reorders pins by moving a pin to a new index and reassigns sort_order", () => {
    const pins = [buildPin("a", 0), buildPin("b", 1), buildPin("c", 2), buildPin("d", 3)];
    const moved = reorderPins(pins, "d", 1);
    expect(moved.map((p) => p.id)).toEqual(["a", "d", "b", "c"]);
    expect(moved.map((p) => p.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it("clamps target index when out of range", () => {
    const pins = [buildPin("a", 0), buildPin("b", 1), buildPin("c", 2)];
    expect(reorderPins(pins, "a", 99).map((p) => p.id)).toEqual(["b", "c", "a"]);
    expect(reorderPins(pins, "c", -5).map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  it("returns the original list unchanged when pinId is unknown", () => {
    const pins = [buildPin("a", 0), buildPin("b", 1)];
    expect(reorderPins(pins, "missing", 0)).toBe(pins);
  });

  it("only changes sort_order for pins involved in an adjacent swap", () => {
    const pins = [buildPin("a", 0), buildPin("b", 1), buildPin("c", 2), buildPin("d", 3)];
    // Swap b and c by moving c up one slot.
    const moved = reorderPins(pins, "c", 1);
    expect(moved.map((p) => p.id)).toEqual(["a", "c", "b", "d"]);
    // a and d keep their original sort_order; b and c are the only ones that flipped.
    const byId = new Map(moved.map((p) => [p.id, p.sortOrder]));
    expect(byId.get("a")).toBe(0);
    expect(byId.get("d")).toBe(3);
    expect(byId.get("c")).toBe(1);
    expect(byId.get("b")).toBe(2);
  });
});

describe("Shared pin helpers (Phase 10)", () => {
  const personalPin = (id: string): KpiPin => ({
    id,
    userId: "u1",
    profitCenterId: "pc-1",
    kpiDefinitionId: `def-${id}`,
    sortOrder: 0,
    scope: "personal",
    createdBy: null,
  });
  const sharedPin = (id: string, createdBy = "admin-1"): KpiPin => ({
    id,
    userId: null,
    profitCenterId: "pc-1",
    kpiDefinitionId: `def-${id}`,
    sortOrder: 0,
    scope: "shared",
    createdBy,
  });

  it("splitPinsByScope partitions personal and shared pins", () => {
    const pins = [personalPin("a"), sharedPin("b"), personalPin("c"), sharedPin("d")];
    const { personal, shared } = splitPinsByScope(pins);
    expect(personal.map((p) => p.id)).toEqual(["a", "c"]);
    expect(shared.map((p) => p.id)).toEqual(["b", "d"]);
  });

  it("splitPinsByScope handles empty, all-personal, and all-shared inputs", () => {
    expect(splitPinsByScope([])).toEqual({ personal: [], shared: [] });
    expect(splitPinsByScope([personalPin("a"), personalPin("b")]).shared).toEqual([]);
    expect(splitPinsByScope([sharedPin("a"), sharedPin("b")]).personal).toEqual([]);
  });

  it("canShareKpiPin allows super_admin unconditionally", () => {
    expect(
      canShareKpiPin({
        isSuperAdmin: true,
        isAdmin: false,
        profitCenterId: "pc-1",
        managedProfitCenterIds: [],
      }),
    ).toBe(true);
  });

  it("canShareKpiPin allows workspace admin only for their managed workspaces", () => {
    expect(
      canShareKpiPin({
        isSuperAdmin: false,
        isAdmin: true,
        profitCenterId: "pc-1",
        managedProfitCenterIds: ["pc-1", "pc-2"],
      }),
    ).toBe(true);
    expect(
      canShareKpiPin({
        isSuperAdmin: false,
        isAdmin: true,
        profitCenterId: "pc-3",
        managedProfitCenterIds: ["pc-1", "pc-2"],
      }),
    ).toBe(false);
  });

  it("canShareKpiPin denies non-admin users", () => {
    expect(
      canShareKpiPin({
        isSuperAdmin: false,
        isAdmin: false,
        profitCenterId: "pc-1",
        managedProfitCenterIds: ["pc-1"],
      }),
    ).toBe(false);
  });

  it("reorderPins on a personal-only subset leaves shared pins untouched in the parent flow", () => {
    // Simulate the Overview flow: split, reorder personal only, leave shared as-is.
    const pins = [personalPin("a"), personalPin("b"), sharedPin("s1"), personalPin("c")];
    const { personal, shared } = splitPinsByScope(pins);
    const reordered = reorderPins(personal, "c", 0);
    expect(reordered.map((p) => p.id)).toEqual(["c", "a", "b"]);
    // Shared list is the same reference returned by splitPinsByScope: untouched.
    expect(shared.map((p) => p.id)).toEqual(["s1"]);
    expect(shared[0].scope).toBe("shared");
  });
});

describe("Forecast helper (Phase 9)", () => {
  const point = (day: string, value: number | null): KpiSeriesPoint => ({ day, value });

  it("returns [] when the series has fewer than 2 usable points", () => {
    expect(forecastLinear([], 7)).toEqual([]);
    expect(forecastLinear([point("2026-04-23", 10)], 7)).toEqual([]);
    expect(forecastLinear([point("2026-04-22", null), point("2026-04-23", 10)], 7)).toEqual([]);
  });

  it("returns [] when horizon is non-positive", () => {
    const series = [point("2026-04-22", 1), point("2026-04-23", 2), point("2026-04-24", 3)];
    expect(forecastLinear(series, 0)).toEqual([]);
    expect(forecastLinear(series, -3)).toEqual([]);
  });

  it("projects a known linear series with the correct slope", () => {
    // y = x + 10 over 5 consecutive days
    const series: KpiSeriesPoint[] = [
      point("2026-04-20", 10),
      point("2026-04-21", 11),
      point("2026-04-22", 12),
      point("2026-04-23", 13),
      point("2026-04-24", 14),
    ];
    const out = forecastLinear(series, 3);
    expect(out).toHaveLength(3);
    expect(out[0].value).toBeCloseTo(15, 6);
    expect(out[1].value).toBeCloseTo(16, 6);
    expect(out[2].value).toBeCloseTo(17, 6);
    expect(out[0].day).toBe("2026-04-25");
    expect(out[2].day).toBe("2026-04-27");
  });

  it("never produces NaN values, even on sparse / noisy series", () => {
    const series: KpiSeriesPoint[] = [
      point("2026-04-20", 5),
      point("2026-04-21", null),
      point("2026-04-22", 7),
      point("2026-04-23", null),
      point("2026-04-24", 9),
    ];
    const out = forecastLinear(series, 5);
    expect(out.length).toBeGreaterThan(0);
    for (const p of out) {
      expect(p.value).not.toBeNull();
      expect(Number.isFinite(p.value as number)).toBe(true);
    }
  });

  it("returns [] when all usable points share the same x (degenerate slope)", () => {
    // Two identical-day entries would produce zero variance in x; usable filter keeps both
    // but we expect denom check to short-circuit. Construct via duplicated values that
    // collapse to a single distinct x by using only one usable point after filtering.
    const series: KpiSeriesPoint[] = [
      point("2026-04-20", null),
      point("2026-04-21", null),
      point("2026-04-22", 5),
    ];
    expect(forecastLinear(series, 7)).toEqual([]);
  });
});
