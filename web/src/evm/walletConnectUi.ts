import { copyTextToClipboard } from "../keplrMobile";
import { el } from "../ui";
import { isAllowedEvmDeepLink } from "./deeplink";
import {
  buildEvmWalletConnectDeepLinks,
  isEvmWalletConnectPairingUri,
} from "./walletConnectPairing";

export interface EvmWalletConnectPairingSheet {
  root: HTMLElement;
  /**
   * Show Open MetaMask / Open Binance Web3 / Copy pairing link for a `wc:` URI.
   * Returns false when the URI is rejected (fail closed).
   */
  open(uri: string): boolean;
  close(): void;
  onCancel(handler: () => void): void;
}

/**
 * In-page pairing sheet for EVM WalletConnect (GitLab #15).
 * Deep-link hrefs are user-gesture `<a>` only. Copy writes the raw `wc:` URI.
 */
export function createEvmWalletConnectPairingSheet(): EvmWalletConnectPairingSheet {
  const title = el("p", { className: "evm-wc-title" }, ["Open your wallet, then return here."]);
  const links = el("div", { className: "evm-wc-links" }, []);
  const copyBtn = el(
    "button",
    { type: "button", className: "button-secondary", id: "copy-evm-wc-pairing" },
    ["Copy pairing link"],
  ) as HTMLButtonElement;
  const cancelBtn = el(
    "button",
    { type: "button", className: "button-secondary", id: "cancel-evm-wc-pairing" },
    ["Cancel"],
  ) as HTMLButtonElement;
  const copyStatus = el("p", { className: "muted", role: "status", id: "evm-wc-copy-status" }, []);

  const root = el("div", { className: "evm-wc-pairing", id: "evm-wc-pairing" }, [
    title,
    links,
    copyBtn,
    cancelBtn,
    copyStatus,
  ]);
  root.hidden = true;

  let currentUri = "";
  let cancelHandler: (() => void) | null = null;

  const renderLinks = (uri: string) => {
    links.replaceChildren();
    for (const link of buildEvmWalletConnectDeepLinks(uri)) {
      const a = el("a", { className: "button", rel: "noopener noreferrer" }, [
        link.label,
      ]) as HTMLAnchorElement;
      if (isAllowedEvmDeepLink(link.href)) {
        a.href = link.href;
      } else {
        a.removeAttribute("href");
        a.setAttribute("aria-disabled", "true");
      }
      links.append(a);
    }
  };

  copyBtn.addEventListener("click", async () => {
    if (!isEvmWalletConnectPairingUri(currentUri)) {
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
    open(uri) {
      if (!isEvmWalletConnectPairingUri(uri)) {
        root.hidden = true;
        currentUri = "";
        return false;
      }
      currentUri = uri.trim();
      copyStatus.textContent = "";
      renderLinks(currentUri);
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
