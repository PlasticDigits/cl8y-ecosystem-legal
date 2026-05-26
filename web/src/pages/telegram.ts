import { getTermsLatest, submitTelegram } from "../api";
import { getAppName, getGroupProperties, getRedirectUri } from "../query";
import { el, renderMissingProperty, renderSuccess } from "../ui";

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, unknown>) => void;
    Telegram?: {
      WebApp?: {
        initData: string;
        ready: () => void;
        expand: () => void;
        close: () => void;
        MainButton: {
          text: string;
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
      };
    };
  }
}

function isTelegramWebApp(): boolean {
  const initData = window.Telegram?.WebApp?.initData;
  return typeof initData === "string" && initData.length > 0;
}

async function signViaWebApp(
  root: HTMLElement,
  property: string,
  statusEl: HTMLElement,
  redirectUri: string | null,
) {
  const webApp = window.Telegram!.WebApp!;
  webApp.ready();
  webApp.expand();

  const btn = webApp.MainButton;
  btn.text = "Accept terms";
  btn.show();

  const onSign = async () => {
    try {
      btn.hide();
      statusEl.textContent = "Submitting acceptance…";
      const terms = await getTermsLatest(property);
      await submitTelegram({ property, init_data: webApp.initData });
      renderSuccess(root, terms.version_label, redirectUri);
      webApp.close();
    } catch (e) {
      statusEl.className = "error";
      statusEl.textContent = String(e);
      btn.show();
    }
  };

  btn.onClick(onSign);
  statusEl.textContent = "Tap “Accept terms” below to sign for this group.";
}

async function signAllViaWebApp(root: HTMLElement, properties: string[]) {
  const webApp = window.Telegram!.WebApp!;
  webApp.ready();
  webApp.expand();

  const statusEl = el("p", { className: "muted" }, [""]);
  root.replaceChildren(
    el("h1", {}, ["Sign all groups"]),
    el("div", { className: "card" }, [statusEl]),
  );

  const initData = webApp.initData;
  let lastVersion = "";

  for (let i = 0; i < properties.length; i++) {
    const property = properties[i]!;
    statusEl.textContent = `Signing ${i + 1} of ${properties.length}…`;
    const terms = await getTermsLatest(property);
    lastVersion = terms.version_label;
    await submitTelegram({ property, init_data: initData });
  }

  statusEl.textContent = `Signed latest terms for ${properties.length} groups.`;
  renderSuccess(root, lastVersion, null);
  webApp.close();
}

export async function renderTelegram(root: HTMLElement) {
  const properties = getGroupProperties();
  if (properties.length === 0) {
    renderMissingProperty(root);
    return;
  }
  if (properties.length > 1 && isTelegramWebApp()) {
    await signAllViaWebApp(root, properties);
    return;
  }
  const property = properties[0]!;

  const botName = import.meta.env.VITE_TELEGRAM_BOT_NAME as string | undefined;
  const appName = getAppName();
  const redirectUri = getRedirectUri();
  const webAppMode = isTelegramWebApp();

  if (!webAppMode && !botName) {
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

  if (webAppMode) {
    await signViaWebApp(root, property, statusEl, redirectUri);
    return;
  }

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
  script.setAttribute("data-telegram-login", botName!);
  script.setAttribute("data-size", "large");
  script.setAttribute("data-onauth", "onTelegramAuth(user)");
  script.setAttribute("data-request-access", "write");
  widgetHost.append(script);
}
