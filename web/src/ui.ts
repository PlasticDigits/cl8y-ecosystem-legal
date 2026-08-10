import { safeRedirectUri } from "./redirect";

export function el(tag: string, attrs: Record<string, string> = {}, children: (Node | string)[] = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "className") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    node.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

export function renderMissingProperty(root: HTMLElement) {
  root.replaceChildren(
    el("h1", {}, ["CL8Y Legal"]),
    el("p", { className: "error" }, [
      "Missing required query parameter: property (website hostname or Telegram channel chat_id).",
    ]),
    el("p", { className: "muted" }, [
      "Example: /sign/evm?property=cl8y.com or /sign/telegram?property=-1001234567890",
    ]),
  );
}

/**
 * Render acceptance success. Only navigates when `redirectUri` passes the portal allowlist;
 * unsafe URIs still show success without auto-redirect or Continue link.
 */
export function renderSuccess(root: HTMLElement, version: string, redirectUri: string | null) {
  root.replaceChildren(
    el("h1", {}, ["Accepted"]),
    el("p", { className: "success" }, [`You have accepted Terms & Conditions ${version} for this property.`]),
  );
  const safe = safeRedirectUri(redirectUri);
  if (safe) {
    const link = el("a", { className: "button", href: safe }, ["Continue"]);
    root.append(el("p", {}, [link]));
    setTimeout(() => {
      window.location.href = safe;
    }, 2000);
  }
}
