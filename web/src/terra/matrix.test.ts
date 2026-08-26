import { describe, expect, it } from "vitest";
import { TERRA_WALLET_MATRIX, isTerraWalletId } from "./matrix";

describe("TERRA_WALLET_MATRIX", () => {
  it("tracks the ustr-cmm WalletName set", () => {
    expect(TERRA_WALLET_MATRIX.map((w) => w.id)).toEqual([
      "station",
      "keplr",
      "leap",
      "cosmostation",
      "luncdash",
      "galaxystation",
    ]);
    expect(TERRA_WALLET_MATRIX.map((w) => w.label).join(" ")).not.toMatch(/ADR-036/i);
    expect(isTerraWalletId("leap")).toBe(true);
    expect(isTerraWalletId("trust")).toBe(false);
  });

  it("marks LUNC Dash as sign-bytes ADR-036 and others as Keplr-arbitrary except Station", () => {
    expect(TERRA_WALLET_MATRIX.find((w) => w.id === "luncdash")?.signMode).toBe("sign-bytes-adr036");
    expect(TERRA_WALLET_MATRIX.find((w) => w.id === "galaxystation")?.signMode).toBe("keplr-arbitrary");
    expect(TERRA_WALLET_MATRIX.find((w) => w.id === "luncdash")?.kind).toBe("walletconnect");
    expect(TERRA_WALLET_MATRIX.find((w) => w.id === "station")?.kind).toBe("extension");
  });
});
