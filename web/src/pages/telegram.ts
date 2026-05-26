import { getTermsLatest, submitTelegram } from "../api";
import { getAppName, getRedirectUri, requireProperty } from "../query";
import { el, renderMissingProperty, renderSuccess } from "../ui";

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

export async function renderTelegram(root: HTMLElement) {
  const property = requireProperty();
  if (!property) {
    renderMissingProperty(root);
    return;
  }

  const botName = import.meta.env.VITE_TELEGRAM_BOT_NAME as string | undefined;
  const appName = getAppName();
  const redirectUri = getRedirectUri();

  if (!botName) {
    root.replaceChildren(
      el("h1", {}, ["Telegram sign-in"]),
      el("p", { className: "error" }, ["VITE_TELEGRAM_BOT_NAME is not configured."]),
    );
    return;
  }

  const statusEl = el("p", { className: "muted" }, [`Channel property: ${property}`]);
  const widgetHost = el("div", {});

  root.replaceChildren(
    el("h1", {}, ["Sign with Telegram"]),
    appName ? el("p", { className: "muted" }, [`App: ${appName}`]) : document.createComment(""),
    el("div", { className: "card" }, [statusEl, widgetHost]),
  );

  window.onTelegramAuth = async (user) => {
    try {
      statusEl.textContent = "Submitting acceptance…";
      const terms = await getTermsLatest(property);
      await submitTelegram({ property, ...user });
      renderSuccess(root, terms.version_label, redirectUri);
    } catch (e) {
      statusEl.className = "error";
      statusEl.textContent = String(e);
    }
  };

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://telegram.org/js/telegram-widget.js?22";
  script.setAttribute("data-telegram-login", botName);
  script.setAttribute("data-size", "large");
  script.setAttribute("data-onauth", "onTelegramAuth(user)");
  script.setAttribute("data-request-access", "write");
  widgetHost.append(script);
}
