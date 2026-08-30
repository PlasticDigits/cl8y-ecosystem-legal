/**
 * MetaMask / Binance Web3 in-app browser fallback for EVM sign (GitLab #15).
 *
 * Phone Chrome / Safari / Firefox do not inject `window.ethereum`. The portal
 * must not dead-end on "install MetaMask". Documented universal links open
 * **this** sign URL (query string intact) inside the wallet app browser, where
 * an EIP-1193 provider is injected and EIP-191 `personal_sign` still runs.
 *
 * Invariants:
 * 1. Deep-link target is always the current portal sign page (`origin + path +
 *    search`). Never query-supplied `redirect_uri` (open-redirect).
 * 2. Only `http:` / `https:` portal targets are encoded. Unknown schemes fail closed.
 * 3. Optional `expectedOrigin` must match the target origin when provided
 *    (page callers pass `window.location.origin`).
 * 4. Copy-link copies the portal sign URL, not a wallet host.
 * 5. Allowlist: documented MetaMask / Binance Web3 / `wc:` / portal http(s) only.
 *    No `javascript:`, no arbitrary `https://` from wallet payloads.
 *
 * MetaMask: https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/
 * Binance Web3: Reown/WalletConnect registry `https://app.binance.com/cedefi/` prefix;
 * `url` is origin-bound. If the app ignores the path, Copy-link still works.
 */

import { portalSignUrlFromHref } from "../keplrMobile";

export const METAMASK_DEEPLINK_ORIGIN = "https://link.metamask.io";
export const BINANCE_DAPP_LINK_PREFIX = "https://app.binance.com/cedefi/dapp";

export const EVM_IDLE_WITH_WALLET = "Connect your wallet to sign.";

/** Retail-short. Do not mention EIP-191 / EIP-6963. Do not tell phones to install a desktop extension. */
export const EVM_IDLE_WITHOUT_WALLET =
  "Open this page in the MetaMask or Binance Web3 app. Chrome and Safari cannot use a desktop extension.";

export const MISSING_EVM_WALLET_STATUS =
  "No wallet in this browser. Use Open in MetaMask or Open in Binance Web3 below, or WalletConnect.";

export const PICK_EVM_WALLET_STATUS = "Pick a wallet above, then try again.";

export const EVM_IDLE_WITHOUT_WALLET_WC =
  "Open this page in the MetaMask or Binance Web3 app, or use WalletConnect. Chrome and Safari cannot use a desktop extension.";

export function evmIdleStatus(injected: boolean, wcOffered = false): string {
  if (injected) {
    return EVM_IDLE_WITH_WALLET;
  }
  return wcOffered ? EVM_IDLE_WITHOUT_WALLET_WC : EVM_IDLE_WITHOUT_WALLET;
}

/**
 * Official MetaMask in-app browser link: `https://link.metamask.io/dapp/{dappUrl}`.
 * `dappUrl` is host + path + search (no scheme) so the portal query string stays intact.
 */
export function metaMaskDappUniversalLink(
  targetUrl: string,
  expectedOrigin?: string,
): string | null {
  const page = portalSignUrlFromHref(targetUrl);
  if (!page) {
    return null;
  }
  const parsed = new URL(page);
  if (expectedOrigin && parsed.origin !== expectedOrigin) {
    return null;
  }
  const dappUrl = `${parsed.host}${parsed.pathname}${parsed.search}`;
  return `${METAMASK_DEEPLINK_ORIGIN}/dapp/${dappUrl}`;
}

/**
 * Binance Web3 dApp-browser link. `url` is the origin-bound portal sign page.
 * Returns null on origin mismatch / non-http(s).
 */
export function binanceWeb3DappLink(targetUrl: string, expectedOrigin?: string): string | null {
  const page = portalSignUrlFromHref(targetUrl);
  if (!page) {
    return null;
  }
  const parsed = new URL(page);
  if (expectedOrigin && parsed.origin !== expectedOrigin) {
    return null;
  }
  return `${BINANCE_DAPP_LINK_PREFIX}?url=${encodeURIComponent(page)}`;
}

/**
 * Allowlisted Open-in-app / WalletConnect pairing hrefs only.
 * Do not pass through arbitrary URLs from a wallet payload.
 */
export function isAllowedEvmDeepLink(href: string): boolean {
  return /^(wc:|metamask:|bnc:|https:\/\/link\.metamask\.io\/|https:\/\/metamask\.app\.link\/|https:\/\/app\.binance\.com\/cedefi\/)/i.test(
    href,
  );
}
