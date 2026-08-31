import type { SignUrls } from "./types.js";

export interface SignUrlOptions {
  /**
   * Return URL after successful acceptance.
   * Hosts must pass an origin allowlisted by the portal (`VITE_REDIRECT_URI_ALLOWLIST`);
   * use {@link sanitizeRedirectUri} / {@link isAllowedRedirectUri} to preflight.
   */
  redirectUri?: string;
  appName?: string;
  /**
   * Connected account for portal continuity (Terra Classic `terra1…`, EVM `0x…`,
   * Solana base58 pubkey). The portal rejects a signature for a different
   * address (GitLab #11 / #15 / #17). Never a redirect target.
   */
  account?: string;
}

export function buildSignUrl(baseUrl: string, opts: SignUrlOptions = {}): string {
  const url = new URL(baseUrl);
  if (opts.redirectUri) {
    url.searchParams.set("redirect_uri", opts.redirectUri);
  }
  if (opts.appName) {
    url.searchParams.set("app_name", opts.appName);
  }
  if (opts.account?.trim()) {
    url.searchParams.set("account", opts.account.trim());
  }
  return url.toString();
}

export function appendSignParams(signUrls: SignUrls, opts: SignUrlOptions = {}): SignUrls {
  return {
    telegram: buildSignUrl(signUrls.telegram, opts),
    evm: buildSignUrl(signUrls.evm, opts),
    terra_classic: buildSignUrl(signUrls.terra_classic, opts),
    solana: buildSignUrl(signUrls.solana, opts),
  };
}
