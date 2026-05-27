import { describe, expect, it } from "vitest";
import { buildAcceptanceMessage, buildWalletMessage, formatEffectiveDate } from "./message.js";

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
      "I have read, understood, and accepted the CL8Y Ecosystem Terms and Conditions, Version Draft 1.3, effective May 26, 2026.",
    );
    expect(msg).toContain("not an investment");
    expect(msg).toContain("investment-type entity");
    expect(msg).toContain("Property: cl8y.com");
    expect(msg).toContain("Network: EVM");
    expect(msg).toContain("Account: 0xabc");
    expect(msg).toContain("Accepted at (UTC): 2026-05-26T12:00:00Z");
  });

  it("buildWalletMessage matches buildAcceptanceMessage", () => {
    const params = {
      versionLabel: "Draft 1.3",
      effectiveDate: "2026-05-26",
      property: "cl8y.com",
      network: "EVM",
      accountId: "0xabc",
      clientTimestamp: new Date("2026-05-26T12:00:00.000Z"),
    };
    expect(buildWalletMessage(params)).toBe(buildAcceptanceMessage(params));
  });

  it("golden string aligns with Rust server format", () => {
    const msg = buildAcceptanceMessage({
      versionLabel: "Draft 1.3",
      effectiveDate: "2026-05-26",
      property: "cl8y.com",
      network: "EVM",
      accountId: "0xabc",
      clientTimestamp: new Date("2026-05-26T12:00:00.000Z"),
    });
    const expected =
      "I have read, understood, and accepted the CL8Y Ecosystem Terms and Conditions, Version Draft 1.3, effective May 26, 2026. " +
      "I understand that CL8Y ecosystem activity is experimental, non-custodial, provided as-is, and not an investment. " +
      "I confirm that I am not an investment-type entity, politically exposed person, or acting for or on behalf of either.\n\n" +
      "Property: cl8y.com\n" +
      "Network: EVM\n" +
      "Account: 0xabc\n" +
      "Accepted at (UTC): 2026-05-26T12:00:00Z";
    expect(msg).toBe(expected);
  });
});
