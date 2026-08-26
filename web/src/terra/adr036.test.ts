import { describe, expect, it } from "vitest";
import { adr036SignDocUtf8 } from "./adr036";

describe("adr036SignDocUtf8", () => {
  it("matches the Rust / CosmJS golden fixture", () => {
    const address = "terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt";
    const message = "CL8Y Terra ADR-036 test";
    const expected =
      '{"account_number":"0","chain_id":"","fee":{"amount":[],"gas":"0"},"memo":"","msgs":[{"type":"sign/MsgSignData","value":{"data":"Q0w4WSBUZXJyYSBBRFItMDM2IHRlc3Q=","signer":"terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt"}}],"sequence":"0"}';
    expect(adr036SignDocUtf8(address, message)).toBe(expected);
  });

  it("escapes ampersand in the signer like CosmJS serializeSignDoc", () => {
    const json = adr036SignDocUtf8("terra1a&b", "hello");
    expect(json).toContain("\\u0026");
  });
});
