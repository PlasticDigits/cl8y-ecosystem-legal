import { copyTextToClipboard, portalSignUrlFromHref } from "../keplrMobile";
import { el } from "../ui";
import {
  binanceWeb3DappLink,
  isAllowedEvmDeepLink,
  metaMaskDappUniversalLink,
} from "./deeplink";

const MM_PLAY = "https://play.google.com/store/apps/details?id=io.metamask";
const MM_APP_STORE = "https://apps.apple.com/app/metamask-crypto-wallet/id1438144202";
const BN_PLAY = "https://play.google.com/store/apps/details?id=com.binance.dev";
const BN_APP_STORE = "https://apps.apple.com/app/binance-buy-bitcoin-crypto/id1436799971";

export interface EvmMobileFallback {
  root: HTMLElement;
  /** Hide when an injected EIP-1193 provider is present; show otherwise. */
  sync(injected: boolean): void;
  /** Reveal + focus Open in MetaMask after a failed in-page sign attempt. */
  focusCta(): void;
}

/**
 * EVM-only controls: Open in MetaMask, Open in Binance Web3, Copy link.
 * Terra / Solana / Telegram pages must not mount this. Do not mount Open in Keplr here.
 */
export function createEvmMobileFallback(
  getPageHref: () => string = () => window.location.href,
  expectedOrigin: () => string = () => window.location.origin,
): EvmMobileFallback {
  const openMetaMask = el("a", { className: "button", id: "open-in-metamask" }, [
    "Open in MetaMask",
  ]) as HTMLAnchorElement;
  openMetaMask.rel = "noopener noreferrer";

  const openBinance = el("a", { className: "button", id: "open-in-binance-web3" }, [
    "Open in Binance Web3",
  ]) as HTMLAnchorElement;
  openBinance.rel = "noopener noreferrer";

  const copyBtn = el(
    "button",
    { type: "button", className: "button-secondary", id: "copy-evm-sign-link" },
    ["Copy link"],
  ) as HTMLButtonElement;

  const copyStatus = el("p", { className: "muted", role: "status", id: "evm-copy-status" }, []);

  const help = el("p", { className: "muted evm-mobile-help" }, [
    "If the app does not open, copy this page and paste it in the wallet’s dApp browser.",
  ]);

  const stores = el("p", { className: "muted links evm-store-links" }, [
    "Need a wallet? MetaMask ",
    el("a", { href: MM_PLAY, rel: "noopener noreferrer" }, ["Android"]),
    " · ",
    el("a", { href: MM_APP_STORE, rel: "noopener noreferrer" }, ["iOS"]),
    " · Binance Web3 ",
    el("a", { href: BN_PLAY, rel: "noopener noreferrer" }, ["Android"]),
    " · ",
    el("a", { href: BN_APP_STORE, rel: "noopener noreferrer" }, ["iOS"]),
  ]);

  const root = el("div", { className: "evm-mobile-fallback" }, [
    openMetaMask,
    openBinance,
    copyBtn,
    copyStatus,
    help,
    stores,
  ]);
  root.hidden = true;

  const pageUrl = (): string | null => portalSignUrlFromHref(getPageHref());

  const applyHref = (anchor: HTMLAnchorElement, href: string | null) => {
    if (href && isAllowedEvmDeepLink(href)) {
      anchor.href = href;
      anchor.removeAttribute("aria-disabled");
    } else {
      anchor.removeAttribute("href");
      anchor.setAttribute("aria-disabled", "true");
    }
  };

  const applyHrefs = () => {
    const page = pageUrl();
    const origin = expectedOrigin();
    applyHref(openMetaMask, page ? metaMaskDappUniversalLink(page, origin) : null);
    applyHref(openBinance, page ? binanceWeb3DappLink(page, origin) : null);
  };

  copyBtn.addEventListener("click", async () => {
    const page = pageUrl();
    if (!page) {
      copyStatus.textContent = "Copy failed. Long-press the address bar instead.";
      return;
    }
    const ok = await copyTextToClipboard(page);
    copyStatus.textContent = ok
      ? "Link copied. Paste it in the MetaMask or Binance Web3 app browser."
      : "Copy failed. Long-press the address bar instead.";
  });

  const onOpenClick = (event: Event, anchor: HTMLAnchorElement) => {
    applyHrefs();
    if (!anchor.href || anchor.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
    }
  };
  openMetaMask.addEventListener("click", (event) => onOpenClick(event, openMetaMask));
  openBinance.addEventListener("click", (event) => onOpenClick(event, openBinance));

  applyHrefs();

  return {
    root,
    sync(injected) {
      applyHrefs();
      root.hidden = injected;
      if (injected) {
        root.classList.remove("evm-mobile-fallback--attention");
      }
    },
    focusCta() {
      applyHrefs();
      root.hidden = false;
      root.classList.add("evm-mobile-fallback--attention");
      openMetaMask.focus();
    },
  };
}
