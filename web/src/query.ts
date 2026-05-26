export function getQueryParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

export function requireProperty(): string | null {
  const p = getQueryParams().get("property");
  return p?.trim() || null;
}

export function getRedirectUri(): string | null {
  return getQueryParams().get("redirect_uri");
}

export function getAppName(): string | null {
  return getQueryParams().get("app_name");
}
