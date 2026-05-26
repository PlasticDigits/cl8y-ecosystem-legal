import { renderEvm } from "./pages/evm";
import { renderHome } from "./pages/home";
import { renderSolana } from "./pages/solana";
import { renderTelegram } from "./pages/telegram";
import { renderTerra } from "./pages/terra";

const appEl = document.getElementById("app");
if (!appEl) {
  throw new Error("#app missing");
}
const app: HTMLElement = appEl;

const path = window.location.pathname.replace(/\/$/, "") || "/";

async function route() {
  switch (path) {
    case "/sign/evm":
      await renderEvm(app);
      break;
    case "/sign/solana":
      await renderSolana(app);
      break;
    case "/sign/terra-classic":
      await renderTerra(app);
      break;
    case "/sign/telegram":
      await renderTelegram(app);
      break;
    default:
      await renderHome(app);
  }
}

route();
