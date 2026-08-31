import { describe, expect, it } from "vitest";
import {
  EVM_ACCOUNT_MISMATCH,
  assertEvmAccountContinuity,
  canonicalizeEvmAddress,
} from "./account";

describe("canonicalizeEvmAddress", () => {
  it("lowercases checksum addresses", () => {
    expect(canonicalizeEvmAddress("0xAABBCCDDEEFf00112233445566778899aabbCCdd")).toBe(
      "0xaabbccddeeff00112233445566778899aabbccdd",
    );
  });

  it("rejects non-addresses", () => {
    expect(canonicalizeEvmAddress("terra1abc")).toBeNull();
    expect(canonicalizeEvmAddress("0x123")).toBeNull();
    expect(canonicalizeEvmAddress("")).toBeNull();
    expect(canonicalizeEvmAddress("javascript:alert(1)")).toBeNull();
    expect(canonicalizeEvmAddress("data:text/html,hi")).toBeNull();
    expect(canonicalizeEvmAddress("https://evil.example")).toBeNull();
  });
});

describe("assertEvmAccountContinuity", () => {
  const a = "0x2222222222222222222222222222222222222222";
  const checksum = "0x2222222222222222222222222222222222222222";

  it("allows checksum vs lowercase claimed account", () => {
    expect(assertEvmAccountContinuity(checksum.toUpperCase().replace("0X", "0x"), a)).toBe(a);
    expect(assertEvmAccountContinuity(a, "0x2222222222222222222222222222222222222222")).toBe(a);
  });

  it("fails closed on a different connected address", () => {
    expect(() =>
      assertEvmAccountContinuity(a, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
    ).toThrow(EVM_ACCOUNT_MISMATCH);
  });

  it("fails closed on hostile or non-EVM claimed values", () => {
    for (const claimed of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "https://evil.example",
      "terra1abc",
      "0x123",
    ]) {
      expect(() => assertEvmAccountContinuity(claimed, a)).toThrow(EVM_ACCOUNT_MISMATCH);
    }
  });

  it("passes through when no claimed account", () => {
    expect(assertEvmAccountContinuity(null, a)).toBe(a);
  });
});
