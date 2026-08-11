import { createWalletClient, custom, type Address } from "viem";
import { mainnet } from "viem/chains";
import { getStatus, submitWallet } from "../api";
import { buildWalletMessage } from "../message";
import { getAppName, getRedirectUri, requireProperty } from "../query";
import { renderSignShell } from "../signShell";
import { renderMissingProperty, renderSuccess } from "../ui";

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

  await renderSignShell(root, {
    title: "Sign with EVM wallet",
    property,
    appName,
    idleStatus: "Connect your wallet to sign.",
    onSign: async ({ terms, setStatus }) => {
      if (!window.ethereum) throw new Error("No EVM wallet found (install MetaMask or similar)");
      const client = createWalletClient({ chain: mainnet, transport: custom(window.ethereum) });
      const [address] = (await client.requestAddresses()) as Address[];
      const accountId = address.toLowerCase();

      const status = await getStatus(property, "EVM", accountId);
      if (status.signed_latest) {
        renderSuccess(root, terms.version_label, redirectUri);
        return;
      }

      const clientTimestamp = new Date();
      const message = buildWalletMessage({
        versionLabel: terms.version_label,
        effectiveDate: terms.effective_date,
        contentSha256: terms.content_sha256,
        property: terms.property,
        network: "EVM",
        accountId,
        clientTimestamp,
      });
      setStatus("Confirm signature in your wallet…");
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
    },
  });
}
