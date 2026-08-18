/**
 * Keplr Mobile in-app browser fallback for Terra Classic sign (GitLab #9).
 *
 * Phone Chrome / Firefox / Safari do not inject `window.keplr`. The portal must
 * not dead-end on "Keplr extension not found". The Chrome-viable path is a
 * documented Keplr `web-browser` universal link that opens **this** sign URL
 * (query string intact) inside the Keplr app, where `window.keplr` is injected
 * and ADR-036 `signArbitrary` from issue #1 still runs.
 *
 * Invariants:
 * 1. Deep-link `url` is always the current portal sign page (`origin + path +
 *    search`). Never `redirect_uri` or any other query-supplied URL (open-redirect).
 * 2. Only `http:` / `https:` targets are encoded. Unknown schemes fail closed.
 * 3. Optional `expectedOrigin` must match the target origin when provided
 *    (page callers pass `window.location.origin`).
 * 4. Copy-link copies the portal sign URL, not the Keplr deeplink host.
 * 5. WalletConnect / in-Chrome `signArbitrary` is out of scope here.
 *
 * Docs: https://docs.keplr.app/api/mobile/deeplink
 */

export const KEPLR_DEEPLINK_ORIGIN = "https://deeplink.keplr.app";

export const TERRA_IDLE_WITH_KEPLR = "Connect Keplr for Terra Classic.";

/** Retail-short; do not mention ADR-036. */
export const TERRA_IDLE_WITHOUT_KEPLR =
  "On a phone, open this page in the Keplr app. Chrome cannot use the desktop extension.";

export const MISSING_KEPLR_STATUS = "Keplr is not in this browser. Use Open in Keplr below.";

interface KeplrKey {
  bech32Address: string;
}

interface KeplrArbitrarySignature {
  signature: string;
  pub_key: { type: string; value: string };
}

declare global {
  interface Window {
    keplr?: {
      enable: (chainId: string) => Promise<void>;
      getKey: (chainId: string) => Promise<KeplrKey>;
      /**
       * ADR-036 `signArbitrary` — not OfflineSigner.signArbitrary(address, data).
       * @see https://docs.keplr.app/api/guide/sign-arbitrary
       */
      signArbitrary: (
        chainId: string,
        signerAddress: string,
        data: string | Uint8Array,
      ) => Promise<KeplrArbitrarySignature>;
    };
  }
}

export function hasInjectedKeplr(): boolean {
  return typeof window.keplr?.signArbitrary === "function";
}

export function terraIdleStatus(injectedKeplr: boolean): string {
  return injectedKeplr ? TERRA_IDLE_WITH_KEPLR : TERRA_IDLE_WITHOUT_KEPLR;
}

/** Portal sign URL without hash — preserves `property` / `redirect_uri` / `app_name`. */
export function portalSignUrlFromHref(href: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  return `${parsed.origin}${parsed.pathname}${parsed.search}`;
}

/**
 * Universal App Link that opens `targetUrl` in the Keplr Mobile in-app browser.
 * Returns null when the target is not a safe http(s) URL (or origin mismatch).
 */
export function keplrWebBrowserUniversalLink(
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
  return `${KEPLR_DEEPLINK_ORIGIN}/web-browser?url=${encodeURIComponent(page)}`;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to execCommand
  }
  try {
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "true");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.append(input);
    input.select();
    const ok = document.execCommand("copy");
    input.remove();
    return ok;
  } catch {
    return false;
  }
}
