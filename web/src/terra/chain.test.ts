import { describe, expect, it } from "vitest";
import {
  TERRA_ACCOUNT_MISMATCH,
  TERRA_CHAIN_ID,
  assertAccountContinuity,
  canonicalizeTerraAddress,
} from "./chain";

const ADDR = "terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt";

describe("canonicalizeTerraAddress", () => {
  it("lowercases uppercase and rejects mixed case", () => {
    expect(canonicalizeTerraAddress(ADDR.toUpperCase())).toBe(ADDR);
    expect(() => canonicalizeTerraAddress("Terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt")).toThrow(
      /mixed case/,
    );
  });
});

describe("assertAccountContinuity", () => {
  it("returns the signed address when no claim is present", () => {
    expect(assertAccountContinuity(null, ADDR)).toBe(ADDR);
  });

  it("accepts the same claim and rejects a different wallet", () => {
    expect(assertAccountContinuity(ADDR.toUpperCase(), ADDR)).toBe(ADDR);
    expect(() => assertAccountContinuity("terra1differentaccount000000000000000000", ADDR)).toThrow(
      TERRA_ACCOUNT_MISMATCH,
    );
  });
});

describe("chain id", () => {
  it("stays Terra Classic", () => {
    expect(TERRA_CHAIN_ID).toBe("columbus-5");
    expect(TERRA_CHAIN_ID).not.toBe("phoenix-1");
  });
});
