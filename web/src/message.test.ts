import { describe, expect, it } from "vitest";
import { buildAcceptanceMessage, formatEffectiveDate } from "./message";

describe("acceptance message", () => {
  it("formats effective date", () => {
    expect(formatEffectiveDate("2026-05-26")).toBe("May 26, 2026");
  });

  it("matches server canonical text and binding lines", () => {
    const msg = buildAcceptanceMessage({
      versionLabel: "Draft 1.3",
      effectiveDate: "2026-05-26",
      property: "cl8y.com",
      network: "EVM",
      accountId: "0xabc",
      clientTimestamp: new Date("2026-05-26T12:00:00.000Z"),
    });
    expect(msg).toContain(
      "I have read, understood, and accepted the CL8Y Ecosystem Terms and Conditions, Version Draft 1.3, effective May 26, 2026."
    );
    expect(msg).toContain("not an investment");
    expect(msg).toContain("Property: cl8y.com");
    expect(msg).toContain("Network: EVM");
  });
});
