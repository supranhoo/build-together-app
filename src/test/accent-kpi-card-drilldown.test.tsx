import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Activity } from "lucide-react";
import { AccentKpiCard } from "@/components/ui/accent-kpi-card";

function renderWithRouter(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/start"]}>
      <Routes>
        <Route path="/start" element={ui} />
        <Route path="*" element={<div data-testid="dest">{window.location.pathname}{window.location.search}</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AccentKpiCard drilldown", () => {
  it("renders non-interactive card when neither onClick nor drilldown is set", () => {
    renderWithRouter(<AccentKpiCard module="sales" icon={Activity} title="X" value="1" />);
    expect(screen.getByText("X").closest("[role='button']")).toBeNull();
  });

  it("renders as button and navigates when drilldown is provided", () => {
    renderWithRouter(
      <AccentKpiCard
        module="sales" icon={Activity} title="Confirmed Orders" value="3"
        drilldown={{ to: "/portal/sales", filters: { tab: "orders", status: "confirmed" } }}
      />,
    );
    const card = screen.getByRole("button", { name: /Confirmed Orders/i });
    expect(card).toBeTruthy();
    fireEvent.click(card);
    // Navigation occurred — destination route mounted.
    expect(screen.queryByText("Confirmed Orders")).toBeNull();
  });

  it("navigates even when value is zero (per project decision)", () => {
    renderWithRouter(
      <AccentKpiCard
        module="sales" icon={Activity} title="Empty" value="0"
        drilldown={{ to: "/portal/sales", filters: { tab: "orders", status: "dispatched" } }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Empty/i }));
    expect(screen.queryByText("Empty")).toBeNull();
  });

  it("onClick wins over drilldown when both are passed", () => {
    let clicked = false;
    renderWithRouter(
      <AccentKpiCard
        module="sales" icon={Activity} title="Both" value="1"
        onClick={() => { clicked = true; }}
        drilldown={{ to: "/should-not-go", filters: {} }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Both/i }));
    expect(clicked).toBe(true);
    // Still on /start — drilldown was ignored.
    expect(screen.getByText("Both")).toBeTruthy();
  });

  it("activates on Enter key for keyboard users", () => {
    let clicked = false;
    renderWithRouter(
      <AccentKpiCard module="sales" icon={Activity} title="K" value="1" onClick={() => { clicked = true; }} />,
    );
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(clicked).toBe(true);
  });
});
