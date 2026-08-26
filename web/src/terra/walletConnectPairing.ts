/**
 * WalletConnect same-device pairing helpers.
 *
 * Ported from cl8y-dex-terraclassic `frontend-dapp/src/utils/walletConnectPairing.ts`
 * (GitLab #519 / #554 / #566) for Legal portal sign — not DEX connect.
 *
 * Invariants:
 * - Mobile is not QR-only: Open {wallet} + Copy pairing link
 * - User-gesture deep links only (no async location.href)
 * - Copy the raw `wc:` URI
 * - Scheme allowlist — never open arbitrary pairing URLs
 * - Android Galaxy `https://…#Intent` templates become `intent://`
 * - WC return URLs must not encode query-supplied `redirect_uri`
 */

export const WALLETCONNECT_MOBILE_VIEWPORT_MAX_PX = 767;

export type WalletConnectPairingDetails = {
  name: string;
  android: string;
  ios: string;
  isStation: boolean;
  isLuncDash: boolean;
};

export type WalletConnectDeepLink = {
  id: "wallet" | "generic";
  label: string;
  href: string;
};

export type WalletConnectMobileEnv = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  matchMedia?: (query: string) => Pick<MediaQueryList, "matches">;
};

const MOBILE_UA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Silk/i;

export function isWalletConnectPairingUri(uri: string): boolean {
  const trimmed = uri.trim();
  if (!trimmed.startsWith("wc:")) {
    return false;
  }
  return /@\d/.test(trimmed);
}

export function isWalletConnectMobileClient(env?: WalletConnectMobileEnv): boolean {
  const ua = env?.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (MOBILE_UA.test(ua)) {
    return true;
  }

  const platform = env?.platform ?? (typeof navigator !== "undefined" ? navigator.platform : "");
  const maxTouchPoints =
    env?.maxTouchPoints ?? (typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0);
  if (platform === "MacIntel" && maxTouchPoints > 1) {
    return true;
  }

  const matchMedia =
    env?.matchMedia ??
    (typeof window !== "undefined" ? window.matchMedia.bind(window) : undefined);
  if (!matchMedia) {
    return false;
  }
  if (matchMedia(`(max-width: ${WALLETCONNECT_MOBILE_VIEWPORT_MAX_PX}px)`).matches) {
    return true;
  }
  if (matchMedia("(pointer: coarse)").matches && matchMedia("(max-width: 1024px)").matches) {
    return true;
  }
  return false;
}

export function isAndroidUserAgent(userAgent?: string): boolean {
  const ua = userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  return /Android/i.test(ua);
}

/** Cosmes LUNC Dash scheme — do not invent a second one. */
export function buildLuncDashDeepLink(uri: string): string {
  return `luncdash://wallet_connect?${encodeURIComponent(`payload=${encodeURIComponent(uri)}`)}`;
}

/**
 * Cosmes Galaxy Station `android` is `https://host/path#Intent;package=…;scheme=galaxystation;end;`.
 * Chrome Android treats that as a website. Convert to `intent://`.
 */
export function toAndroidIntentUri(androidTemplate: string): string {
  const trimmed = androidTemplate.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (/^intent:/i.test(trimmed)) {
    return trimmed;
  }
  const hashIndex = trimmed.indexOf("#Intent");
  if (hashIndex < 0) {
    return trimmed;
  }
  const before = trimmed.slice(0, hashIndex);
  const intentPart = trimmed.slice(hashIndex);
  if (!/^https?:\/\//i.test(before)) {
    return trimmed;
  }
  const schemeMatch = intentPart.match(/scheme=([^;]+)/i);
  const scheme = schemeMatch?.[1]?.trim();
  try {
    const url = new URL(before);
    const path = url.pathname.replace(/^\//, "");
    if (scheme && scheme !== "http" && scheme !== "https") {
      return `intent://${path}${intentPart}`;
    }
    return `intent://${url.host}${url.pathname}${url.search}${intentPart}`;
  } catch {
    return trimmed;
  }
}

export function buildAndroidWalletIntent(androidTemplate: string, uri: string): string {
  const normalized = toAndroidIntentUri(androidTemplate);
  const hashIndex = normalized.indexOf("#");
  if (hashIndex < 0) {
    const sep = normalized.includes("?") ? "&" : "?";
    return `${normalized}${sep}${encodeURIComponent(uri)}`;
  }
  return `${normalized.slice(0, hashIndex)}?${encodeURIComponent(uri)}${normalized.slice(hashIndex)}`;
}

export function buildIosWalletIntent(iosTemplate: string, uri: string): string {
  const sep = iosTemplate.includes("?") ? "&" : "?";
  return `${iosTemplate}${sep}${encodeURIComponent(uri)}`;
}

/**
 * Allowlisted schemes/hosts only. Pairing hrefs are opened from the portal.
 * Do not pass through arbitrary URLs from the WalletConnect payload.
 */
export function isAllowedWalletConnectDeepLink(href: string): boolean {
  return /^(wc:|luncdash:|keplrwallet:|galaxystation:|cosmostation:|intent:|https:\/\/station\.hexxagon\.io\/|https:\/\/terrastation\.page\.link\/)/i.test(
    href,
  );
}

export function buildWalletConnectDeepLinks(
  details: WalletConnectPairingDetails,
  uri: string,
  env?: Pick<WalletConnectMobileEnv, "userAgent">,
): WalletConnectDeepLink[] {
  if (!isWalletConnectPairingUri(uri)) {
    return [];
  }
  const links: WalletConnectDeepLink[] = [];
  const walletHref = walletSpecificDeepLink(details, uri, env);
  if (walletHref && isAllowedWalletConnectDeepLink(walletHref)) {
    links.push({
      id: "wallet",
      label: `Open ${details.name}`,
      href: walletHref,
    });
  }
  if (isAllowedWalletConnectDeepLink(uri)) {
    links.push({
      id: "generic",
      label: "Open wallet",
      href: uri,
    });
  }
  return links;
}

function walletSpecificDeepLink(
  details: WalletConnectPairingDetails,
  uri: string,
  env?: Pick<WalletConnectMobileEnv, "userAgent">,
): string | null {
  if (details.isLuncDash) {
    return buildLuncDashDeepLink(uri);
  }
  if (details.isStation) {
    return `https://terrastation.page.link/?link=https://terra.money?${encodeURIComponent(
      `action=wallet_connect&payload=${encodeURIComponent(uri)}`,
    )}&apn=money.terra.station&ibi=money.terra.station&isi=1548434735`;
  }
  if (isAndroidUserAgent(env?.userAgent) && details.android.trim()) {
    return buildAndroidWalletIntent(details.android, uri);
  }
  if (details.ios.trim()) {
    return buildIosWalletIntent(details.ios, uri);
  }
  return null;
}

export const LUNC_DASH_PAIRING: WalletConnectPairingDetails = {
  name: "LUNC Dash",
  android: "",
  ios: "",
  isStation: true,
  isLuncDash: true,
};

export const GALAXY_STATION_PAIRING: WalletConnectPairingDetails = {
  name: "Galaxy Station",
  android:
    "https://station.hexxagon.io/wcV2#Intent;package=io.hexxagon.station;scheme=galaxystation;end;",
  ios: "https://station.hexxagon.io/wcV2",
  isStation: false,
  isLuncDash: false,
};
