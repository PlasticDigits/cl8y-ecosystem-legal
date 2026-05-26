import { createWalletClient, custom, type Address } from "viem";
import { mainnet } from "viem/chains";
import { getTermsLatest, submitWallet } from "../api";
import { buildWalletMessage } from "../message";
import { getAppName, getRedirectUri, requireProperty } from "../query";
import { el, renderMissingProperty, renderSuccess } from "../ui";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

export async function renderEvm(root: HTMLElement) {
  const property = requireProperty();
  if (!property) {
    renderMissingProperty(root);
    return;
  }

  const appName = getAppName();
  const redirectUri = getRedirectUri();
  const statusEl = el("p", { className: "muted" }, ["Connect your wallet to sign."]);
  const btn = el("button", {}, ["Connect & sign"]) as HTMLButtonElement;

  root.replaceChildren(
    el("h1", {}, ["Sign with EVM wallet"]),
    appName ? el("p", { className: "muted" }, [`App: ${appName}`]) : document.createComment(""),
    el("p", { className: "muted" }, [`Property: ${property}`]),
    el("div", { className: "card" }, [statusEl, btn]),
  );

  btn.onclick = async () => {
    btn.disabled = true;
    try {
      if (!window.ethereum) throw new Error("No EVM wallet found (install MetaMask or similar)");
      const terms = await getTermsLatest(property);
      const client = createWalletClient({ chain: mainnet, transport: custom(window.ethereum) });
      const [address] = (await client.requestAddresses()) as Address[];
      const accountId = address.toLowerCase();
      const clientTimestamp = new Date();
      const message = buildWalletMessage({
        versionLabel: terms.version_label,
        effectiveDate: terms.effective_date,
        property: terms.property,
        network: "EVM",
        accountId,
        clientTimestamp,
      });
      statusEl.textContent = "Confirm signature in your wallet…";
      const signature = await client.signMessage({ account: address, message });
      await submitWallet({
        property,
        network: "EVM",
        account_id: accountId,
        message,
        signature,
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
