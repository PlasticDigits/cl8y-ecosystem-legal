import { getTermsLatest, submitWallet } from "../api";
import { buildWalletMessage } from "../message";
import { getAppName, getRedirectUri, requireProperty } from "../query";
import { el, renderMissingProperty, renderSuccess } from "../ui";

const TERRA_CHAIN_ID = "columbus-5";

interface KeplrOfflineSigner {
  getAccounts: () => Promise<{ address: string; pubkey: Uint8Array }[]>;
  signArbitrary: (
    signerAddress: string,
    data: string,
  ) => Promise<{ signature: string; pub_key: { type: string; value: string } }>;
}

declare global {
  interface Window {
    keplr?: {
      enable: (chainId: string) => Promise<void>;
      getOfflineSigner: (chainId: string) => KeplrOfflineSigner;
    };
  }
}

export async function renderTerra(root: HTMLElement) {
  const property = requireProperty();
  if (!property) {
    renderMissingProperty(root);
    return;
  }

  const appName = getAppName();
  const redirectUri = getRedirectUri();
  const statusEl = el("p", { className: "muted" }, ["Connect Keplr for Terra Classic."]);
  const btn = el("button", {}, ["Connect & sign"]) as HTMLButtonElement;

  root.replaceChildren(
    el("h1", {}, ["Sign with Terra Classic wallet"]),
    appName ? el("p", { className: "muted" }, [`App: ${appName}`]) : document.createComment(""),
    el("p", { className: "muted" }, [`Property: ${property}`]),
    el("div", { className: "card" }, [statusEl, btn]),
  );

  btn.onclick = async () => {
    btn.disabled = true;
    try {
      if (!window.keplr) throw new Error("Keplr extension not found");
      await window.keplr.enable(TERRA_CHAIN_ID);
      const signer = window.keplr.getOfflineSigner(TERRA_CHAIN_ID);
      const [account] = await signer.getAccounts();
      const terms = await getTermsLatest(property);
      const clientTimestamp = new Date();
      const message = buildWalletMessage({
        versionLabel: terms.version_label,
        effectiveDate: terms.effective_date,
        property: terms.property,
        network: "TERRA_CLASSIC",
        accountId: account.address,
        clientTimestamp,
      });
      statusEl.textContent = "Confirm signature in Keplr…";
      const result = await signer.signArbitrary(account.address, message);
      await submitWallet({
        property,
        network: "TERRA_CLASSIC",
        account_id: account.address,
        message,
        signature: result.signature,
        pubkey: result.pub_key.value,
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
