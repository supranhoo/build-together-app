import { describe, it, expect } from "vitest";
import { describeRpcError } from "@/lib/pc-transfers";

describe("pc-transfers describeRpcError", () => {
  it("maps known server codes to friendly messages", () => {
    expect(describeRpcError("forbidden_source")).toMatch(/source profit center/i);
    expect(describeRpcError("forbidden_destination")).toMatch(/destination profit center/i);
    expect(describeRpcError("same_pc")).toMatch(/must differ/i);
    expect(describeRpcError("invalid_quantity")).toMatch(/greater than zero/i);
    expect(describeRpcError("not_pending")).toMatch(/no longer pending/i);
    expect(describeRpcError("destination_mapping_mismatch")).toMatch(/destination profit center/i);
    expect(describeRpcError("reason_required")).toMatch(/3 characters/i);
  });

  it("falls back to the raw code for unknown errors", () => {
    expect(describeRpcError("weird_code")).toBe("weird_code");
    expect(describeRpcError(undefined)).toBe("Unknown error");
  });
});
