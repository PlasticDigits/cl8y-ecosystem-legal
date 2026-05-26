import { describe, expect, it } from "vitest";
import { uint8ToBase58 } from "./base58";

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
