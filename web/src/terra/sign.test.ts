import { describe, expect, it, vi } from "vitest";
import { TERRA_ACCOUNT_MISMATCH } from "./chain";
import { PICK_WALLET_STATUS, signTerraClassicMessage } from "./sign";
import type { WalletConnectPairingSheet } from "./walletConnectUi";

function stubSheet(): WalletConnectPairingSheet {
  return {
    root: document.createElement("div"),
    open: () => true,
    close: () => {},
    onCancel: () => {},
  };
}

describe("signTerraClassicMessage", () => {
  it("focuses the Keplr fallback when no wallet is selected", async () => {
    const focus = vi.fn();
    await expect(
      signTerraClassicMessage({
        walletId: null,
        claimedAccount: null,
        pairing: stubSheet(),
        focusKeplrFallback: focus,
        prepare: async () => ({ alreadySigned: true }),
      }),
    ).rejects.toThrow(PICK_WALLET_STATUS);
    expect(focus).toHaveBeenCalled();
  });

  it("rejects a Leap signature for a different claimed account", async () => {
    window.leap = {
      enable: async () => {},
      getKey: async () => ({ bech32Address: "terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt" }),
      signArbitrary: async () => ({
        signature: "sig",
        pub_key: { type: "t", value: "p" },
      }),
    };
    await expect(
      signTerraClassicMessage({
        walletId: "leap",
        claimedAccount: "terra1differentaccount000000000000000000",
        pairing: stubSheet(),
        focusKeplrFallback: () => {},
        prepare: async () => ({ message: "nope" }),
      }),
    ).rejects.toThrow(TERRA_ACCOUNT_MISMATCH);
    delete window.leap;
  });
});
