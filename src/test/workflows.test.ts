import { describe, expect, it } from "vitest";
import { validateWorkflow } from "@/lib/workflows";

describe("validateWorkflow", () => {
  const base = {
    profitCenterId: null,
    triggerType: "purchase_requisition" as const,
    name: "PR Approval",
    isEnabled: true,
    steps: [
      { label: "Maker", actor: "any_user" as const },
      { label: "Checker", actor: "department_head" as const },
    ],
  };

  it("accepts a valid workflow", () => {
    expect(validateWorkflow(base)).toBeNull();
  });

  it("rejects missing name", () => {
    expect(validateWorkflow({ ...base, name: "   " })).toMatch(/Name/);
  });

  it("rejects empty steps", () => {
    expect(validateWorkflow({ ...base, steps: [] })).toMatch(/step/i);
  });

  it("rejects step with empty label", () => {
    expect(
      validateWorkflow({ ...base, steps: [{ label: "", actor: "any_user" }] }),
    ).toMatch(/label/);
  });

  it("rejects negative threshold", () => {
    expect(
      validateWorkflow({
        ...base,
        steps: [{ label: "Maker", actor: "any_user", amountThreshold: -1 }],
      }),
    ).toMatch(/threshold/);
  });
});
