import { getTermsLatest } from "../api";
import { el } from "../ui";

export async function renderHome(root: HTMLElement) {
  const params = new URLSearchParams(window.location.search);
  const property = params.get("property");

  root.replaceChildren(el("h1", {}, ["CL8Y Legal"]), el("p", { className: "muted" }, ["Terms & Conditions acceptance portal."]));

  if (!property) {
    root.append(
      el("div", { className: "card" }, [
        el("p", {}, ["Integrators must pass a property query parameter:"]),
        el("ul", {}, [
          el("li", {}, ["Website: hostname, e.g. ?property=cl8y.com"]),
          el("li", {}, ["Telegram channel: chat_id, e.g. ?property=-1001234567890"]),
        ]),
      ]),
    );
    return;
  }

  try {
    const terms = await getTermsLatest(property);
    const links = el("div", { className: "links card" }, [
      el("p", {}, [`Property: ${terms.property}`]),
      el("p", {}, [`Latest version: ${terms.version_label} (effective ${terms.effective_date})`]),
      el("p", {}, ["Sign:"]),
      el("a", { href: terms.sign_urls.evm }, ["EVM wallet"]),
      document.createTextNode(" "),
      el("a", { href: terms.sign_urls.solana }, ["Solana"]),
      document.createTextNode(" "),
      el("a", { href: terms.sign_urls.terra_classic }, ["Terra Classic"]),
      document.createTextNode(" "),
      el("a", { href: terms.sign_urls.telegram }, ["Telegram"]),
    ]);
    root.append(links);
  } catch (e) {
    root.append(el("p", { className: "error" }, [String(e)]));
  }
}
