import {
  sanitizeRedirectUri,
  type RedirectAllowlistOptions,
} from "@plasticdigits/cl8y-clickwrap";

/**
 * Portal redirect policy from Vite env.
 *
 * - `VITE_REDIRECT_URI_ALLOWLIST` — comma-separated exact origins (HTTPS in prod).
 * - `VITE_ALLOW_LOCALHOST_REDIRECT` — permit loopback http(s) for local/e2e.
 */
export function getRedirectAllowlistOptions(): RedirectAllowlistOptions {
  const raw = import.meta.env.VITE_REDIRECT_URI_ALLOWLIST ?? "";
  const allowlist = String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const flag = import.meta.env.VITE_ALLOW_LOCALHOST_REDIRECT;
  const allowLocalhost = flag === "true" || flag === "1";
  return { allowlist, allowLocalhost };
}

/** Sanitize a query `redirect_uri` for navigation; returns null when unsafe. */
export function safeRedirectUri(uri: string | null | undefined): string | null {
  return sanitizeRedirectUri(uri, getRedirectAllowlistOptions());
}
