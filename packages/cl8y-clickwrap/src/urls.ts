import type { SignUrls } from "./types.js";

export interface SignUrlOptions {
  redirectUri?: string;
  appName?: string;
}

export function buildSignUrl(baseUrl: string, opts: SignUrlOptions = {}): string {
  const url = new URL(baseUrl);
  if (opts.redirectUri) {
    url.searchParams.set("redirect_uri", opts.redirectUri);
  }
  if (opts.appName) {
    url.searchParams.set("app_name", opts.appName);
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
