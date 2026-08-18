import { el } from "./ui";
import {
  copyTextToClipboard,
  keplrWebBrowserUniversalLink,
  portalSignUrlFromHref,
} from "./keplrMobile";

const PLAY_STORE = "https://play.google.com/store/apps/details?id=com.chainapsis.keplr";
const APP_STORE = "https://apps.apple.com/us/app/keplr-wallet/id1567851089";

export interface KeplrMobileFallback {
  root: HTMLElement;
  /** Hide when `window.keplr` is present; show otherwise. */
  sync(injectedKeplr: boolean): void;
  /** Reveal + focus the Open in Keplr CTA after a failed in-page sign attempt. */
  focusCta(): void;
}

/**
 * Terra-only controls: Open in Keplr (documented universal link) + copy-link.
 * EVM / Solana / Telegram pages must not mount this.
 */
export function createKeplrMobileFallback(
  getPageHref: () => string = () => window.location.href,
  expectedOrigin: () => string = () => window.location.origin,
): KeplrMobileFallback {
  const openLink = el("a", { className: "button", id: "open-in-keplr" }, [
    "Open in Keplr",
  ]) as HTMLAnchorElement;
  openLink.rel = "noopener noreferrer";

  const copyBtn = el(
    "button",
    { type: "button", className: "button-secondary", id: "copy-sign-link" },
    ["Copy link"],
  ) as HTMLButtonElement;

  const copyStatus = el("p", { className: "muted", role: "status", id: "keplr-copy-status" }, []);

  const help = el("p", { className: "muted keplr-mobile-help" }, [
    "If the app does not open, copy this page and paste it in the Keplr app browser.",
  ]);

  const stores = el("p", { className: "muted links keplr-store-links" }, [
    "Need Keplr? ",
    el("a", { href: PLAY_STORE, rel: "noopener noreferrer" }, ["Android"]),
    " · ",
    el("a", { href: APP_STORE, rel: "noopener noreferrer" }, ["iOS"]),
  ]);

  const root = el("div", { className: "keplr-mobile-fallback" }, [
    openLink,
    copyBtn,
    copyStatus,
    help,
    stores,
  ]);
  root.hidden = true;

  const pageUrl = (): string | null => portalSignUrlFromHref(getPageHref());

  const applyHref = () => {
    const page = pageUrl();
    const deeplink = page ? keplrWebBrowserUniversalLink(page, expectedOrigin()) : null;
    if (deeplink) {
      openLink.href = deeplink;
      openLink.removeAttribute("aria-disabled");
    } else {
      openLink.removeAttribute("href");
      openLink.setAttribute("aria-disabled", "true");
    }
  };

  copyBtn.addEventListener("click", async () => {
    const page = pageUrl();
    if (!page) {
      copyStatus.textContent = "Copy failed. Long-press the address bar instead.";
      return;
    }
    const ok = await copyTextToClipboard(page);
    copyStatus.textContent = ok
      ? "Link copied. Paste it in the Keplr app browser."
      : "Copy failed. Long-press the address bar instead.";
  });

  openLink.addEventListener("click", (event) => {
    applyHref();
    if (!openLink.href || openLink.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
    }
  });

  applyHref();

  return {
    root,
    sync(injectedKeplr) {
      applyHref();
      root.hidden = injectedKeplr;
      if (injectedKeplr) {
        root.classList.remove("keplr-mobile-fallback--attention");
      }
    },
    focusCta() {
      applyHref();
      root.hidden = false;
      root.classList.add("keplr-mobile-fallback--attention");
      openLink.focus();
    },
  };
}
