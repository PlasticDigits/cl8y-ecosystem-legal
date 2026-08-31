import { afterEach, describe, expect, it, vi } from "vitest";
import { EVM_ACCOUNT_MISMATCH } from "./account";
import { MISSING_EVM_WALLET_STATUS, PICK_EVM_WALLET_STATUS } from "./deeplink";
import type { DiscoveredEvmProvider, Eip1193Provider } from "./provider";
import { signEvmMessage } from "./sign";
import { WALLETCONNECT_ID } from "./walletConnect";
import type { EvmWalletConnectPairingSheet } from "./walletConnectUi";

function stubSheet(): EvmWalletConnectPairingSheet {
  return {
    root: document.createElement("div"),
    open: () => true,
    close: () => {},
    onCancel: () => {},
  };
}

function discovered(id: string, provider: Eip1193Provider): DiscoveredEvmProvider {
  return { id, name: id, rdns: null, provider };
}

describe("signEvmMessage", () => {
  afterEach(() => {
    delete window.__CL8Y_EVM_WC_TEST__;
  });

  it("focuses the mobile fallback when no wallet is selected or injected", async () => {
    const focus = vi.fn();
    await expect(
      signEvmMessage({
        selectedId: null,
        providers: [],
        claimedAccount: null,
        pairing: stubSheet(),
        focusFallback: focus,
        prepare: async () => ({ alreadySigned: true }),
      }),
    ).rejects.toThrow(MISSING_EVM_WALLET_STATUS);
    expect(focus).toHaveBeenCalled();
  });

  it("asks the user to pick when several providers exist and none is selected", async () => {
    const a: Eip1193Provider = { request: async () => ["0xaaa"] };
    const b: Eip1193Provider = { request: async () => ["0xbbb"] };
    const focus = vi.fn();
    await expect(
      signEvmMessage({
        selectedId: null,
        providers: [discovered("a", a), discovered("b", b)],
        claimedAccount: null,
        pairing: stubSheet(),
        focusFallback: focus,
        prepare: async () => ({ message: "nope" }),
      }),
    ).rejects.toThrow(PICK_EVM_WALLET_STATUS);
    expect(focus).not.toHaveBeenCalled();
  });

  it("rejects a signature for a different claimed account", async () => {
    const connected = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const provider: Eip1193Provider = {
      request: async ({ method }) => {
        if (method === "eth_requestAccounts") {
          return [connected];
        }
        throw new Error(`unexpected ${method}`);
      },
    };
    await expect(
      signEvmMessage({
        selectedId: "injected:ethereum",
        providers: [discovered("injected:ethereum", provider)],
        claimedAccount: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        pairing: stubSheet(),
        focusFallback: () => {},
        prepare: async () => ({ message: "nope" }),
      }),
    ).rejects.toThrow(EVM_ACCOUNT_MISMATCH);
  });

  it("signs when claimed checksum matches the connected lowercase address", async () => {
    const connected = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const methods: string[] = [];
    const provider: Eip1193Provider = {
      request: async ({ method }) => {
        methods.push(method);
        if (method === "eth_requestAccounts") {
          return [connected];
        }
        if (method === "personal_sign") {
          return `0x${"ab".repeat(65)}`;
        }
        throw new Error(method);
      },
    };
    const result = await signEvmMessage({
      selectedId: "injected:ethereum",
      providers: [discovered("injected:ethereum", provider)],
      claimedAccount: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      pairing: stubSheet(),
      focusFallback: () => {},
      prepare: async (accountId) => ({ message: `legal:${accountId}` }),
    });
    expect("signature" in result && result.accountId).toBe(connected);
    expect(methods).toContain("personal_sign");
  });

  it("rejects WalletConnect when the session account is not the claimed account", async () => {
    let signed = 0;
    window.__CL8Y_EVM_WC_TEST__ = async (prepare) => {
      const prepared = await prepare("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
      signed += 1;
      return { accountId: prepared.accountId, signature: "0xdead" };
    };
    await expect(
      signEvmMessage({
        selectedId: WALLETCONNECT_ID,
        providers: [],
        claimedAccount: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        pairing: stubSheet(),
        focusFallback: () => {},
        prepare: async () => ({ message: "nope" }),
      }),
    ).rejects.toThrow(EVM_ACCOUNT_MISMATCH);
    expect(signed).toBe(0);
  });

  it("signs with the selected provider, not a sibling", async () => {
    const calls: string[] = [];
    const selected: Eip1193Provider = {
      request: async ({ method }) => {
        calls.push(`sel:${method}`);
        if (method === "eth_requestAccounts") {
          return ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"];
        }
        if (method === "personal_sign") {
          return `0x${"ab".repeat(65)}`;
        }
        throw new Error(method);
      },
    };
    const other: Eip1193Provider = {
      request: async ({ method }) => {
        calls.push(`other:${method}`);
        throw new Error("wrong provider");
      },
    };
    const result = await signEvmMessage({
      selectedId: "eip6963:io.metamask",
      providers: [discovered("eip6963:io.metamask", selected), discovered("eip6963:com.binance", other)],
      claimedAccount: null,
      pairing: stubSheet(),
      focusFallback: () => {},
      prepare: async (accountId) => ({ message: `legal:${accountId}` }),
    });
    expect("signature" in result && result.signature.startsWith("0x")).toBe(true);
    expect(calls.some((c) => c.startsWith("other:"))).toBe(false);
  });

  it("does not treat WalletConnect as an injected provider when WC is not offered", async () => {
    const focus = vi.fn();
    await expect(
      signEvmMessage({
        selectedId: WALLETCONNECT_ID,
        providers: [],
        claimedAccount: null,
        pairing: stubSheet(),
        focusFallback: focus,
        prepare: async () => ({ alreadySigned: true }),
      }),
    ).rejects.toThrow(MISSING_EVM_WALLET_STATUS);
    expect(focus).toHaveBeenCalled();
  });
});
