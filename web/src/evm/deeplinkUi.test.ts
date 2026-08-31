import { afterEach, describe, expect, it, vi } from "vitest";
import { createEvmMobileFallback } from "./deeplinkUi";
import { BINANCE_DAPP_LINK_PREFIX, METAMASK_DEEPLINK_ORIGIN } from "./deeplink";

describe("createEvmMobileFallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const page =
    "https://terms.cl8y.com/sign/evm?property=dex.cl8y.com&redirect_uri=https%3A%2F%2Fdex.cl8y.com";

  it("hides when a wallet is injected and shows documented deep links otherwise", () => {
    const fallback = createEvmMobileFallback(
      () => page,
      () => "https://terms.cl8y.com",
    );

    fallback.sync(true);
    expect(fallback.root.hidden).toBe(true);

    fallback.sync(false);
    expect(fallback.root.hidden).toBe(false);

    const mm = fallback.root.querySelector("#open-in-metamask") as HTMLAnchorElement;
    const bnb = fallback.root.querySelector("#open-in-binance-web3") as HTMLAnchorElement;
    expect(mm.textContent).toBe("Open in MetaMask");
    expect(bnb.textContent).toBe("Open in Binance Web3");
    expect(mm.getAttribute("href")?.startsWith(`${METAMASK_DEEPLINK_ORIGIN}/dapp/`)).toBe(true);
    expect(mm.href).toContain("property=dex.cl8y.com");
    expect(mm.href).not.toBe("https://dex.cl8y.com");
    expect(bnb.getAttribute("href")?.startsWith(`${BINANCE_DAPP_LINK_PREFIX}?url=`)).toBe(true);
    const target = new URL(bnb.href).searchParams.get("url");
    expect(target).toBe(page.split("#")[0]);
    expect(target).not.toBe("https://dex.cl8y.com");
    expect(fallback.root.textContent).not.toMatch(/EIP-191|EIP-6963/i);
    expect(fallback.root.querySelector("#open-in-keplr")).toBeNull();
  });

  it("copy-link writes the portal URL, not a wallet host", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const fallback = createEvmMobileFallback(
      () => page,
      () => "https://terms.cl8y.com",
    );
    fallback.sync(false);

    const copy = fallback.root.querySelector("#copy-evm-sign-link") as HTMLButtonElement;
    copy.click();
    await vi.waitFor(() => {
      expect(fallback.root.querySelector("#evm-copy-status")?.textContent).toMatch(/Link copied/i);
    });
    expect(writeText).toHaveBeenCalledWith(page);
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining("link.metamask.io"));
  });

  it("focusCta reveals the panel even if it was hidden", () => {
    const fallback = createEvmMobileFallback(
      () => page,
      () => "https://terms.cl8y.com",
    );
    fallback.sync(true);
    fallback.focusCta();
    expect(fallback.root.hidden).toBe(false);
    expect(fallback.root.classList.contains("evm-mobile-fallback--attention")).toBe(true);
  });

  it("does not set href when origin mismatches", () => {
    const fallback = createEvmMobileFallback(
      () => "https://evil.example/sign/evm?property=cl8y.com",
      () => "https://terms.cl8y.com",
    );
    fallback.sync(false);
    const mm = fallback.root.querySelector("#open-in-metamask") as HTMLAnchorElement;
    expect(mm.getAttribute("href")).toBeNull();
    expect(mm.getAttribute("aria-disabled")).toBe("true");
  });

  it("preserves account= on MetaMask, Binance, and Copy link; never uses it as an href target", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const claimed =
      "https://terms.cl8y.com/sign/evm?property=dex.cl8y.com&redirect_uri=https%3A%2F%2Fdex.cl8y.com&account=0x2222222222222222222222222222222222222222";

    const fallback = createEvmMobileFallback(
      () => claimed,
      () => "https://terms.cl8y.com",
    );
    fallback.sync(false);

    const mm = fallback.root.querySelector("#open-in-metamask") as HTMLAnchorElement;
    const bnb = fallback.root.querySelector("#open-in-binance-web3") as HTMLAnchorElement;
    expect(mm.href.startsWith(`${METAMASK_DEEPLINK_ORIGIN}/dapp/`)).toBe(true);
    expect(mm.href).toContain("account=0x2222222222222222222222222222222222222222");
    expect(mm.href).not.toBe("0x2222222222222222222222222222222222222222");
    expect(mm.href.startsWith("javascript:")).toBe(false);
    const target = new URL(bnb.href).searchParams.get("url");
    expect(target).toBe(claimed);
    expect(target).not.toBe("https://dex.cl8y.com");

    const copy = fallback.root.querySelector("#copy-evm-sign-link") as HTMLButtonElement;
    copy.click();
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(claimed);
    });
    expect(writeText).not.toHaveBeenCalledWith("https://dex.cl8y.com");
  });

  it("does not turn a hostile account= query into a javascript: or data: href", () => {
    const page =
      "https://terms.cl8y.com/sign/evm?property=cl8y.com&account=javascript:alert(1)&redirect_uri=https%3A%2F%2Fcl8y.com";
    const fallback = createEvmMobileFallback(
      () => page,
      () => "https://terms.cl8y.com",
    );
    fallback.sync(false);
    const mm = fallback.root.querySelector("#open-in-metamask") as HTMLAnchorElement;
    const bnb = fallback.root.querySelector("#open-in-binance-web3") as HTMLAnchorElement;
    expect(mm.getAttribute("href")?.startsWith("javascript:")).toBeFalsy();
    expect(mm.getAttribute("href")?.startsWith("data:")).toBeFalsy();
    expect(mm.href.startsWith(`${METAMASK_DEEPLINK_ORIGIN}/dapp/`)).toBe(true);
    expect(mm.href).toContain("account=javascript");
    expect(bnb.href.startsWith(`${BINANCE_DAPP_LINK_PREFIX}?url=`)).toBe(true);
    expect(bnb.href.startsWith("javascript:")).toBe(false);
  });
});
