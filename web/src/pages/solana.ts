import { getTermsLatest, submitWallet } from "../api";
import { uint8ToBase58 } from "../base58";
import { buildWalletMessage } from "../message";
import { getAppName, getRedirectUri, requireProperty } from "../query";
import { el, renderMissingProperty, renderSuccess } from "../ui";

interface SolanaProvider {
  connect: () => Promise<{ publicKey: { toString: () => string } }>;
  signMessage: (message: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }>;
}

declare global {
  interface Window {
    solana?: SolanaProvider;
  }
}

export async function renderSolana(root: HTMLElement) {
  const property = requireProperty();
  if (!property) {
    renderMissingProperty(root);
    return;
  }

  const appName = getAppName();
  const redirectUri = getRedirectUri();
  const statusEl = el("p", { className: "muted" }, ["Connect Phantom or another Solana wallet."]);
  const btn = el("button", {}, ["Connect & sign"]) as HTMLButtonElement;

  root.replaceChildren(
    el("h1", {}, ["Sign with Solana wallet"]),
    appName ? el("p", { className: "muted" }, [`App: ${appName}`]) : document.createComment(""),
    el("p", { className: "muted" }, [`Property: ${property}`]),
    el("div", { className: "card" }, [statusEl, btn]),
  );

  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const provider = window.solana;
      if (!provider) throw new Error("No Solana wallet found");
      const terms = await getTermsLatest(property);
      const { publicKey } = await provider.connect();
      const accountId = publicKey.toString();
      const clientTimestamp = new Date();
      const message = buildWalletMessage({
        versionLabel: terms.version_label,
        effectiveDate: terms.effective_date,
        property: terms.property,
        network: "SOLANA",
        accountId,
        clientTimestamp,
      });
      statusEl.textContent = "Confirm signature in your wallet…";
      const encoded = new TextEncoder().encode(message);
      const { signature } = await provider.signMessage(encoded, "utf8");
      const sig58 = uint8ToBase58(signature);
      await submitWallet({
        property,
        network: "SOLANA",
        account_id: accountId,
        message,
        signature: sig58,
        client_timestamp: clientTimestamp.toISOString(),
      });
      renderSuccess(root, terms.version_label, redirectUri);
    } catch (e) {
      statusEl.className = "error";
      statusEl.textContent = String(e);
      btn.disabled = false;
    }
  };
}
