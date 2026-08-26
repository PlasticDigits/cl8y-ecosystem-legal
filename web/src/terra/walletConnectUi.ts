import { copyTextToClipboard } from "../keplrMobile";
import { el } from "../ui";
import {
  buildWalletConnectDeepLinks,
  isAllowedWalletConnectDeepLink,
  isWalletConnectPairingUri,
  type WalletConnectPairingDetails,
} from "./walletConnectPairing";

export interface WalletConnectPairingSheet {
  root: HTMLElement;
  /**
   * Show Open {wallet} + Copy pairing link for a `wc:` URI.
   * Returns false when the URI is rejected (fail closed).
   */
  open(details: WalletConnectPairingDetails, uri: string): boolean;
  close(): void;
  /** Abort the in-flight pairing (Cancel). */
  onCancel(handler: () => void): void;
}

/**
 * In-page pairing sheet for LUNC Dash / Galaxy Station (GitLab #11).
 * Deep-link hrefs are user-gesture `<a>` only. Copy writes the raw `wc:` URI.
 */
export function createWalletConnectPairingSheet(): WalletConnectPairingSheet {
  const title = el("p", { className: "terra-wc-title" }, ["Open your wallet, then return here."]);
  const links = el("div", { className: "terra-wc-links" }, []);
  const copyBtn = el(
    "button",
    { type: "button", className: "button-secondary", id: "copy-wc-pairing" },
    ["Copy pairing link"],
  ) as HTMLButtonElement;
  const cancelBtn = el(
    "button",
    { type: "button", className: "button-secondary", id: "cancel-wc-pairing" },
    ["Cancel"],
  ) as HTMLButtonElement;
  const copyStatus = el("p", { className: "muted", role: "status", id: "wc-copy-status" }, []);

  const root = el("div", { className: "terra-wc-pairing", id: "terra-wc-pairing" }, [
    title,
    links,
    copyBtn,
    cancelBtn,
    copyStatus,
  ]);
  root.hidden = true;

  let currentUri = "";
  let cancelHandler: (() => void) | null = null;

  const renderLinks = (details: WalletConnectPairingDetails, uri: string) => {
    links.replaceChildren();
    for (const link of buildWalletConnectDeepLinks(details, uri)) {
      const a = el("a", { className: "button", rel: "noopener noreferrer" }, [
        link.label,
      ]) as HTMLAnchorElement;
      if (isAllowedWalletConnectDeepLink(link.href)) {
        a.href = link.href;
      } else {
        a.removeAttribute("href");
        a.setAttribute("aria-disabled", "true");
      }
      links.append(a);
    }
  };

  copyBtn.addEventListener("click", async () => {
    if (!isWalletConnectPairingUri(currentUri)) {
      copyStatus.textContent = "Copy failed. Pairing link is not ready.";
      return;
    }
    const ok = await copyTextToClipboard(currentUri);
    copyStatus.textContent = ok
      ? "Pairing link copied. Paste it in the wallet."
      : "Copy failed. Long-press Open wallet instead.";
  });

  cancelBtn.addEventListener("click", () => {
    cancelHandler?.();
  });

  return {
    root,
    open(details, uri) {
      if (!isWalletConnectPairingUri(uri)) {
        root.hidden = true;
        currentUri = "";
        return false;
      }
      currentUri = uri.trim();
      copyStatus.textContent = "";
      renderLinks(details, currentUri);
      root.hidden = false;
      copyBtn.focus();
      return true;
    },
    close() {
      root.hidden = true;
      currentUri = "";
      copyStatus.textContent = "";
      links.replaceChildren();
    },
    onCancel(handler) {
      cancelHandler = handler;
    },
  };
}
