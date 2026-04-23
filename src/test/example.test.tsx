import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "@/pages/Login";

const navigateMock = vi.fn();

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    session: null,
    signIn: vi.fn(),
    signUp: vi.fn(),
    logout: vi.fn(),
    loading: false,
    profile: null,
    refreshProfile: vi.fn(),
  }),
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
  });

  it("shows sign-in only and keeps password reset access", () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByText(/accounts are provisioned by administrators only/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /forgot password\?/i })).toBeInTheDocument();
    expect(screen.queryByText(/request access/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/department/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create employee account/i })).not.toBeInTheDocument();
  });
});
