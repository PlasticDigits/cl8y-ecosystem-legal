import { describe, expect, it } from "vitest";
import {
  BINANCE_DAPP_LINK_PREFIX,
  EVM_IDLE_WITHOUT_WALLET,
  EVM_IDLE_WITHOUT_WALLET_WC,
  METAMASK_DEEPLINK_ORIGIN,
  MISSING_EVM_WALLET_STATUS,
  binanceWeb3DappLink,
  evmIdleStatus,
  isAllowedEvmDeepLink,
  metaMaskDappUniversalLink,
} from "./deeplink";

const signUrl =
  "https://terms.cl8y.com/sign/evm?property=dex.cl8y.com&redirect_uri=https%3A%2F%2Fdex.cl8y.com&account=0x2222222222222222222222222222222222222222";

describe("metaMaskDappUniversalLink", () => {
  it("encodes host + path + search so the portal query stays on the dapp URL", () => {
    const link = metaMaskDappUniversalLink(signUrl, "https://terms.cl8y.com");
    expect(link).toBe(
      `${METAMASK_DEEPLINK_ORIGIN}/dapp/terms.cl8y.com/sign/evm?property=dex.cl8y.com&redirect_uri=https%3A%2F%2Fdex.cl8y.com&account=0x2222222222222222222222222222222222222222`,
    );
    expect(link).toContain("property=dex.cl8y.com");
    expect(link).not.toBe("https://dex.cl8y.com");
  });

  it("fails closed on origin mismatch and non-http schemes", () => {
    expect(metaMaskDappUniversalLink(signUrl, "https://evil.example")).toBeNull();
    expect(metaMaskDappUniversalLink("javascript:alert(1)", "https://terms.cl8y.com")).toBeNull();
    expect(metaMaskDappUniversalLink("https://evil.example/phish", "https://terms.cl8y.com")).toBeNull();
  });

  it("allows http localhost for local/e2e", () => {
    const local = "http://127.0.0.1:5173/sign/evm?property=cl8y.com";
    expect(metaMaskDappUniversalLink(local, "http://127.0.0.1:5173")).toContain(
      "127.0.0.1:5173/sign/evm?property=cl8y.com",
    );
  });
});

describe("binanceWeb3DappLink", () => {
  it("puts the portal page in url=, not redirect_uri", () => {
    const link = binanceWeb3DappLink(signUrl, "https://terms.cl8y.com");
    expect(link?.startsWith(`${BINANCE_DAPP_LINK_PREFIX}?url=`)).toBe(true);
    const encoded = new URL(link!).searchParams.get("url");
    expect(encoded).toBe(
      "https://terms.cl8y.com/sign/evm?property=dex.cl8y.com&redirect_uri=https%3A%2F%2Fdex.cl8y.com&account=0x2222222222222222222222222222222222222222",
    );
    expect(encoded).not.toBe("https://dex.cl8y.com");
  });

  it("fails closed on origin mismatch", () => {
    expect(binanceWeb3DappLink(signUrl, "https://evil.example")).toBeNull();
  });
});

describe("isAllowedEvmDeepLink", () => {
  it("allowlists MetaMask / Binance / wc and rejects javascript and foreign https", () => {
    expect(isAllowedEvmDeepLink("https://link.metamask.io/dapp/terms.cl8y.com/sign/evm")).toBe(true);
    expect(isAllowedEvmDeepLink("https://metamask.app.link/wc?uri=wc%3Ax")).toBe(true);
    expect(isAllowedEvmDeepLink("https://app.binance.com/cedefi/dapp?url=https%3A%2F%2Fx")).toBe(true);
    expect(isAllowedEvmDeepLink("bnc://app.binance.com/cedefi/wc?uri=wc%3Ax")).toBe(true);
    expect(isAllowedEvmDeepLink("wc:topic@2?relay-protocol=irn")).toBe(true);
    expect(isAllowedEvmDeepLink("javascript:alert(1)")).toBe(false);
    expect(isAllowedEvmDeepLink("data:text/html,hi")).toBe(false);
    expect(isAllowedEvmDeepLink("https://evil.example/phish")).toBe(false);
    expect(isAllowedEvmDeepLink("https://dex.cl8y.com/?redirect_uri=https://evil")).toBe(false);
  });
});

describe("evmIdleStatus", () => {
  it("is retail-short and never mentions EIP numbers or desktop extensions on phones", () => {
    expect(evmIdleStatus(true)).toBe("Connect your wallet to sign.");
    expect(evmIdleStatus(false)).toBe(EVM_IDLE_WITHOUT_WALLET);
    expect(evmIdleStatus(false, true)).toBe(EVM_IDLE_WITHOUT_WALLET_WC);
    expect(evmIdleStatus(false)).not.toMatch(/EIP-19|EIP-6963/i);
    expect(evmIdleStatus(false)).not.toMatch(/install/i);
    expect(MISSING_EVM_WALLET_STATUS).not.toMatch(/No EVM wallet found/i);
  });
});
