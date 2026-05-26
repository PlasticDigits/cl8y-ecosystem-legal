export function getQueryParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

export function requireProperty(): string | null {
  const p = getQueryParams().get("property");
  return p?.trim() || null;
}

/** Comma-separated chat ids for “sign all” from the bot DM. */
export function getGroupProperties(): string[] {
  const groups = getQueryParams().get("groups");
  if (groups?.trim()) {
    return groups
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const single = requireProperty();
  return single ? [single] : [];
}

export function getRedirectUri(): string | null {
  return getQueryParams().get("redirect_uri");
}

export function getAppName(): string | null {
  return getQueryParams().get("app_name");
}
