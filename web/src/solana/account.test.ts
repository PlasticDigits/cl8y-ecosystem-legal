import { describe, expect, it } from "vitest";
import { uint8ToBase58 } from "../base58";
import {
  SOLANA_ACCOUNT_MISMATCH,
  assertSolanaAccountContinuity,
  canonicalizeSolanaAddress,
} from "./account";

/** 32-byte pubkey (no leading zero) — encode matches API `bs58`. */
export const TEST_SOLANA_A = uint8ToBase58(new Uint8Array(32).fill(0x11));
export const TEST_SOLANA_B = uint8ToBase58(new Uint8Array(32).fill(0x22));

describe("canonicalizeSolanaAddress", () => {
  it("accepts a 32-byte base58 pubkey", () => {
    const decoded = canonicalizeSolanaAddress(TEST_SOLANA_A);
    expect(decoded).not.toBeNull();
    expect(decoded!.length).toBe(32);
    expect([...decoded!]).toEqual(Array(32).fill(0x11));
  });

  it("trims surrounding whitespace", () => {
    const decoded = canonicalizeSolanaAddress(`  ${TEST_SOLANA_A}  `);
    expect(decoded).not.toBeNull();
    expect([...decoded!]).toEqual(Array(32).fill(0x11));
  });

  it("accepts the all-zero system program id", () => {
    const decoded = canonicalizeSolanaAddress("11111111111111111111111111111111");
    expect(decoded).not.toBeNull();
    expect([...decoded!]).toEqual(Array(32).fill(0));
  });

  it("rejects non-pubkeys without lowercasing", () => {
    expect(canonicalizeSolanaAddress("0x2222222222222222222222222222222222222222")).toBeNull();
    expect(canonicalizeSolanaAddress("terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt")).toBeNull();
    expect(canonicalizeSolanaAddress("")).toBeNull();
    expect(canonicalizeSolanaAddress("javascript:alert(1)")).toBeNull();
    expect(canonicalizeSolanaAddress("data:text/html,hi")).toBeNull();
    expect(canonicalizeSolanaAddress("https://evil.example")).toBeNull();
    expect(canonicalizeSolanaAddress(uint8ToBase58(new Uint8Array(16).fill(1)))).toBeNull();
  });
});

describe("assertSolanaAccountContinuity", () => {
  it("passes through when no claimed account", () => {
    expect(assertSolanaAccountContinuity(null, TEST_SOLANA_A)).toBe(TEST_SOLANA_A);
  });

  it("matches claimed and connected when decoded bytes are equal", () => {
    expect(assertSolanaAccountContinuity(TEST_SOLANA_A, TEST_SOLANA_A)).toBe(TEST_SOLANA_A);
    expect(assertSolanaAccountContinuity(` ${TEST_SOLANA_A} `, TEST_SOLANA_A)).toBe(TEST_SOLANA_A);
  });

  it("fails closed on a different connected pubkey", () => {
    expect(() => assertSolanaAccountContinuity(TEST_SOLANA_A, TEST_SOLANA_B)).toThrow(
      SOLANA_ACCOUNT_MISMATCH,
    );
  });

  it("fails closed on hostile or non-Solana claimed values", () => {
    for (const claimed of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "https://evil.example",
      "terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt",
      "0x2222222222222222222222222222222222222222",
      "11111111111111111111111111111111",
    ]) {
      expect(() => assertSolanaAccountContinuity(claimed, TEST_SOLANA_A)).toThrow(
        SOLANA_ACCOUNT_MISMATCH,
      );
    }
  });

  it("does not treat mixed-case strings as equal by lowercasing", () => {
    const flipped = TEST_SOLANA_A.replace(/[A-Z]/g, (c) => c.toLowerCase()).replace(
      /[a-z]/g,
      (c, i) => (TEST_SOLANA_A[i] === c ? c.toUpperCase() : c),
    );
    if (flipped !== TEST_SOLANA_A) {
      expect(() => assertSolanaAccountContinuity(flipped, TEST_SOLANA_A)).toThrow(
        SOLANA_ACCOUNT_MISMATCH,
      );
    }
  });

  it("rejects an invalid connected address even with no claim", () => {
    expect(() => assertSolanaAccountContinuity(null, "not-a-pubkey")).toThrow(
      /did not return a valid address/i,
    );
  });
});
