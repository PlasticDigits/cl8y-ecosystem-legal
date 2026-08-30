/**
 * WalletConnect same-device pairing for EVM portal sign (GitLab #15).
 *
 * Mobile is not QR-only: Open MetaMask / Open Binance Web3 / Copy pairing link (`wc:`).
 * User-gesture `<a href>` only. Scheme allowlist — never open arbitrary pairing URLs.
 * Pairing hrefs must not encode query-supplied `redirect_uri`.
 */

import { isAllowedEvmDeepLink } from "./deeplink";

export type EvmWalletConnectDeepLink = {
  id: "metamask" | "binance" | "generic";
  label: string;
  href: string;
};

export function isEvmWalletConnectPairingUri(uri: string): boolean {
  const trimmed = uri.trim();
  if (!trimmed.startsWith("wc:")) {
    return false;
  }
  return /@\d/.test(trimmed);
}

function isAndroidUserAgent(userAgent?: string): boolean {
  const ua = userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  return /Android/i.test(ua);
}

/** MetaMask WalletConnect universal link (documented `metamask.app.link/wc`). */
export function metaMaskWalletConnectLink(uri: string): string {
  return `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`;
}

/**
 * Binance Web3 WalletConnect. Reown registry native `bnc://app.binance.com/cedefi/wc`,
 * universal `https://app.binance.com/cedefi/wc`.
 */
export function binanceWalletConnectLink(uri: string, userAgent?: string): string {
  const encoded = encodeURIComponent(uri);
  if (isAndroidUserAgent(userAgent)) {
    return `bnc://app.binance.com/cedefi/wc?uri=${encoded}`;
  }
  return `https://app.binance.com/cedefi/wc?uri=${encoded}`;
}

export function buildEvmWalletConnectDeepLinks(
  uri: string,
  env?: { userAgent?: string },
): EvmWalletConnectDeepLink[] {
  if (!isEvmWalletConnectPairingUri(uri)) {
    return [];
  }
  const links: EvmWalletConnectDeepLink[] = [];
  const metamask = metaMaskWalletConnectLink(uri);
  if (isAllowedEvmDeepLink(metamask)) {
    links.push({ id: "metamask", label: "Open MetaMask", href: metamask });
  }
  const binance = binanceWalletConnectLink(uri, env?.userAgent);
  if (isAllowedEvmDeepLink(binance)) {
    links.push({ id: "binance", label: "Open Binance Web3", href: binance });
  }
  if (isAllowedEvmDeepLink(uri)) {
    links.push({ id: "generic", label: "Open wallet", href: uri });
  }
  return links;
}
