import type { TermsLatest } from "./api";
import { getTermsContent, getTermsLatest } from "./api";
import { el } from "./ui";

/**
 * Portal sign-page invariants (EVM + Terra Classic):
 *
 * 1. Full latest terms text is shown before any wallet interaction.
 * 2. Version label and effective date are visible near the terms body.
 * 3. Terms body is rendered only via text nodes (`textContent` / `el`) — never `innerHTML`.
 * 4. Consent gate: the agree checkbox stays disabled until the user scrolls the terms body
 *    to the bottom (or content fits without scrolling). "Connect & sign" stays disabled until
 *    terms load successfully AND the user checks "I have read and agree to the Terms & Conditions".
 * 5. Terms metadata + content are fetched once per page load (no refetch on consent toggle).
 * 6. Status updates use a polite live region; load failures use `role="alert"`.
 * 7. Optional `extraControls` is for network-specific CTAs (Terra Open in Keplr).
 *    EVM omits it. Do not put wallet secrets in extra markup.
 *
 * Solana / Telegram sign pages are out of scope for this shell (see GitLab #2).
 * Cross-links: skills/portal-sign-disclosure/SKILL.md, README "Portal sign UX".
 */

export type StatusKind = "muted" | "error" | "success";

export interface SignShellContext {
  terms: TermsLatest;
  setStatus: (text: string, kind?: StatusKind) => void;
}

export interface SignShellOptions {
  title: string;
  property: string;
  appName: string | null;
  idleStatus: string;
  onSign: (ctx: SignShellContext) => Promise<void>;
  /** Optional network-specific controls (Terra Open in Keplr). EVM omits this. */
  extraControls?: HTMLElement;
}

/** Pixels of leeway so rubber-banding / subpixel layout still counts as "at bottom". */
const SCROLL_BOTTOM_THRESHOLD_PX = 8;

export function hasScrolledTermsToBottom(termsBody: HTMLElement): boolean {
  // No measurable layout yet (e.g. jsdom before styles) — do not unlock.
  if (termsBody.clientHeight === 0 && termsBody.scrollHeight === 0) {
    return false;
  }
  return (
    termsBody.scrollHeight - termsBody.clientHeight <= SCROLL_BOTTOM_THRESHOLD_PX ||
    termsBody.scrollHeight - termsBody.scrollTop - termsBody.clientHeight <= SCROLL_BOTTOM_THRESHOLD_PX
  );
}

export async function renderSignShell(root: HTMLElement, options: SignShellOptions): Promise<void> {
  const { title, property, appName, idleStatus, onSign, extraControls } = options;

  const statusEl = el("p", { className: "muted", role: "status", "aria-live": "polite" }, [
    "Loading terms…",
  ]);
  const metaEl = el("p", { className: "muted terms-meta" }, []);
  const termsBody = el(
    "pre",
    {
      className: "message terms-body",
      tabindex: "0",
      role: "region",
      "aria-label": "Terms and Conditions full text",
    },
    ["Loading terms…"],
  ) as HTMLPreElement;

  const consentId = "terms-consent";
  const consentHintId = "terms-consent-hint";
  const checkbox = el("input", {
    type: "checkbox",
    id: consentId,
    disabled: "true",
    "aria-describedby": consentHintId,
  }) as HTMLInputElement;
  const consentHint = el("p", { className: "muted consent-hint", id: consentHintId }, [
    "Scroll to the bottom of the terms to enable this checkbox.",
  ]);
  const consentLabel = el("label", { className: "consent-label", for: consentId }, [
    checkbox,
    " I have read and agree to the Terms & Conditions",
  ]);

  const btn = el("button", { type: "button", disabled: "true" }, ["Connect & sign"]) as HTMLButtonElement;

  root.replaceChildren(
    el("h1", {}, [title]),
    appName ? el("p", { className: "muted" }, [`App: ${appName}`]) : document.createComment(""),
    el("p", { className: "muted" }, [`Property: ${property}`]),
    el("div", { className: "card terms-card" }, [
      el("h2", { className: "terms-heading" }, ["Terms & Conditions"]),
      metaEl,
      termsBody,
      consentLabel,
      consentHint,
    ]),
    el("div", { className: "card" }, [
      statusEl,
      btn,
      extraControls ?? document.createComment(""),
    ]),
  );

  let terms: TermsLatest | null = null;
  let busy = false;
  let reachedBottom = false;

  const syncEnabled = () => {
    btn.disabled = !(terms && checkbox.checked && !busy && !checkbox.disabled);
  };

  const unlockConsentIfScrolled = () => {
    if (reachedBottom || !terms) {
      return;
    }
    if (!hasScrolledTermsToBottom(termsBody)) {
      return;
    }
    reachedBottom = true;
    checkbox.disabled = false;
    consentHint.textContent = "";
    consentHint.hidden = true;
    checkbox.removeAttribute("aria-describedby");
    syncEnabled();
  };

  checkbox.addEventListener("change", syncEnabled);
  termsBody.addEventListener("scroll", unlockConsentIfScrolled, { passive: true });

  try {
    const [latest, content] = await Promise.all([getTermsLatest(property), getTermsContent(property)]);
    terms = latest;
    metaEl.textContent = `Version ${latest.version_label} · Effective ${latest.effective_date}`;
    termsBody.textContent = content;
    statusEl.textContent = idleStatus;
    // Layout may not settle until after paint; check now and on the next frames.
    unlockConsentIfScrolled();
    requestAnimationFrame(() => {
      unlockConsentIfScrolled();
      requestAnimationFrame(unlockConsentIfScrolled);
    });
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => unlockConsentIfScrolled());
      ro.observe(termsBody);
    }
    syncEnabled();
  } catch (e) {
    metaEl.textContent = "";
    termsBody.textContent = "";
    statusEl.className = "error";
    statusEl.setAttribute("role", "alert");
    statusEl.removeAttribute("aria-live");
    statusEl.textContent = `Unable to load terms: ${String(e)}`;
    checkbox.disabled = true;
    checkbox.checked = false;
    consentHint.textContent = "";
    consentHint.hidden = true;
    btn.disabled = true;
    return;
  }

  btn.onclick = async () => {
    if (!terms || !checkbox.checked) return;
    busy = true;
    syncEnabled();
    try {
      await onSign({
        terms,
        setStatus: (text, kind = "muted") => {
          statusEl.className = kind;
          statusEl.textContent = text;
        },
      });
    } catch (e) {
      statusEl.className = "error";
      statusEl.textContent = String(e);
      busy = false;
      syncEnabled();
    }
  };
}
