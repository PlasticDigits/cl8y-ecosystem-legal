/**
 * Redirect URI allowlisting for the signing portal return path.
 *
 * # Invariants
 * - Only explicit `http:` / `https:` URLs are considered (rejects `javascript:`, `data:`,
 *   protocol-relative `//…`, and other schemes).
 * - Userinfo (credentials) in the URL is rejected.
 * - Non-localhost targets must be `https:` and match an exact **origin** on the allowlist.
 * - `http://localhost` / `127.0.0.1` / `::1` are allowed only when `allowLocalhost` is set.
 * - Integrators should pass known-good URIs; the hosted portal enforces this at navigate time.
 *   Headless callers that open sign URLs server-side are not broken — validation is optional
 *   via {@link sanitizeRedirectUri} / {@link isAllowedRedirectUri}.
 */

export interface RedirectAllowlistOptions {
  /** Exact origins or origin URLs, e.g. `https://cl8y.com` or `https://cl8y.com/`. */
  allowlist: string[];
  /** Permit `http://localhost`, `http://127.0.0.1`, and `http://[::1]` (any port). */
  allowLocalhost?: boolean;
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

function originAllowed(origin: string, allowlist: string[]): boolean {
  return allowlist.some((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) return false;
    try {
      return new URL(trimmed).origin === origin;
    } catch {
      return trimmed === origin || trimmed === `${origin}/`;
    }
  });
}

/**
 * Return a safe absolute redirect URL, or `null` if the input must not be navigated to.
 */
export function sanitizeRedirectUri(
  uri: string | null | undefined,
  opts: RedirectAllowlistOptions,
): string | null {
  if (uri == null) return null;
  const trimmed = uri.trim();
  if (!trimmed) return null;

  // Require an explicit http(s) scheme before parsing — blocks `javascript:`, `data:`, `//evil`.
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  if (url.username || url.password) {
    return null;
  }

  const loopback = isLoopbackHost(url.hostname);
  if (url.protocol === "http:") {
    if (!loopback || !opts.allowLocalhost) {
      return null;
    }
    return url.toString();
  }

  // https:
  if (loopback) {
    return opts.allowLocalhost ? url.toString() : null;
  }
  if (!originAllowed(url.origin, opts.allowlist)) {
    return null;
  }
  return url.toString();
}

export function isAllowedRedirectUri(uri: string, opts: RedirectAllowlistOptions): boolean {
  return sanitizeRedirectUri(uri, opts) !== null;
}
