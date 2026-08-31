import { describe, expect, it } from "vitest";
import { base58ToUint8, uint8ToBase58 } from "./base58";

describe("uint8ToBase58", () => {
  it("encodes empty input as single leading one", () => {
    expect(uint8ToBase58(new Uint8Array())).toBe("1");
  });

  it("encodes single zero byte", () => {
    expect(uint8ToBase58(new Uint8Array([0]))).toBe("11");
  });

  it("encodes leading zeros", () => {
    expect(uint8ToBase58(new Uint8Array([0, 0, 1]))).toBe("112");
  });

  it("encodes a known small value", () => {
    expect(uint8ToBase58(new Uint8Array([1]))).toBe("2");
  });
});

describe("base58ToUint8", () => {
  it("decodes a 32-byte pubkey produced by uint8ToBase58", () => {
    const bytes = new Uint8Array(32).fill(0x11);
    const encoded = uint8ToBase58(bytes);
    expect([...base58ToUint8(encoded)!]).toEqual([...bytes]);
  });

  it("decodes the all-zero 32-byte system program id", () => {
    const decoded = base58ToUint8("11111111111111111111111111111111");
    expect(decoded).not.toBeNull();
    expect(decoded!.length).toBe(32);
    expect([...decoded!]).toEqual(Array(32).fill(0));
  });

  it("returns null for empty or illegal alphabet", () => {
    expect(base58ToUint8("")).toBeNull();
    expect(base58ToUint8("0OIl")).toBeNull();
    expect(base58ToUint8("javascript:alert(1)")).toBeNull();
  });
});
