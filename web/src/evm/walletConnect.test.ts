import { afterEach, describe, expect, it, vi } from "vitest";
import { EVM_ACCOUNT_MISMATCH } from "./account";
import {
  connectAndSignEvmWalletConnect,
  isEvmWalletConnectConfigured,
  isEvmWalletConnectOffered,
} from "./walletConnect";
import type { EvmWalletConnectPairingSheet } from "./walletConnectUi";

function stubSheet(): EvmWalletConnectPairingSheet {
  return {
    root: document.createElement("div"),
    open: () => true,
    close: () => {},
    onCancel: () => {},
  };
}

describe("isEvmWalletConnectOffered", () => {
  afterEach(() => {
    delete window.__CL8Y_EVM_WC_TEST__;
  });

  it("gates on a Legal-owned project id unless the e2e hook is present", () => {
    expect(isEvmWalletConnectConfigured()).toBe(Boolean(import.meta.env.VITE_WC_PROJECT_ID));
    expect(isEvmWalletConnectOffered()).toBe(Boolean(import.meta.env.VITE_WC_PROJECT_ID));
    window.__CL8Y_EVM_WC_TEST__ = async () => {
      throw new Error("unused");
    };
    expect(isEvmWalletConnectOffered()).toBe(true);
  });
});

describe("connectAndSignEvmWalletConnect claimed-account bind", () => {
  afterEach(() => {
    delete window.__CL8Y_EVM_WC_TEST__;
  });

  const claimed = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const other = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  it("throws EVM_ACCOUNT_MISMATCH and does not call personal_sign on session mismatch", async () => {
    let signed = 0;
    const prepare = vi.fn(async () => ({ accountId: other, message: "nope" }));
    window.__CL8Y_EVM_WC_TEST__ = async (hookPrepare) => {
      const prepared = await hookPrepare(other);
      signed += 1;
      return { accountId: prepared.accountId, signature: "0xdead" };
    };

    await expect(connectAndSignEvmWalletConnect(prepare, stubSheet(), claimed)).rejects.toThrow(
      EVM_ACCOUNT_MISMATCH,
    );
    expect(prepare).not.toHaveBeenCalled();
    expect(signed).toBe(0);
  });

  it("throws EVM_ACCOUNT_MISMATCH for hostile claimed values before prepare", async () => {
    const prepare = vi.fn(async () => ({ accountId: other, message: "nope" }));
    window.__CL8Y_EVM_WC_TEST__ = async (hookPrepare) => hookPrepare(other);

    for (const hostile of ["javascript:alert(1)", "terra1abc", "0x123"]) {
      prepare.mockClear();
      await expect(
        connectAndSignEvmWalletConnect(prepare, stubSheet(), hostile),
      ).rejects.toThrow(EVM_ACCOUNT_MISMATCH);
      expect(prepare).not.toHaveBeenCalled();
    }
  });

  it("prepares the bound address when the session matches the claim", async () => {
    window.__CL8Y_EVM_WC_TEST__ = async (hookPrepare) => {
      const prepared = await hookPrepare(claimed);
      if ("alreadySigned" in prepared) {
        return prepared;
      }
      return { accountId: prepared.accountId, signature: "0xsig" };
    };

    const result = await connectAndSignEvmWalletConnect(
      async (accountId) => ({ accountId, message: `legal:${accountId}` }),
      stubSheet(),
      claimed.toUpperCase().replace("0X", "0x"),
    );
    expect(result).toEqual({ accountId: claimed, signature: "0xsig" });
  });
});
