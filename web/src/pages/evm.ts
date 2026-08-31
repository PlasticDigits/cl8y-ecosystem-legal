import { getStatus, submitWallet } from "../api";
import { MISSING_EVM_WALLET_STATUS, PICK_EVM_WALLET_STATUS, evmIdleStatus } from "../evm/deeplink";
import { createEvmMobileFallback } from "../evm/deeplinkUi";
import { createEvmWalletPicker } from "../evm/pickerUi";
import { discoverEvmProviders, type DiscoveredEvmProvider } from "../evm/provider";
import { signEvmMessage } from "../evm/sign";
import { isEvmWalletConnectOffered } from "../evm/walletConnect";
import { createEvmWalletConnectPairingSheet } from "../evm/walletConnectUi";
import { buildWalletMessage } from "../message";
import { getAppName, getClaimedAccount, getRedirectUri, requireProperty } from "../query";
import { renderSignShell } from "../signShell";
import { el, renderMissingProperty, renderSuccess } from "../ui";

export async function renderEvm(root: HTMLElement) {
  const property = requireProperty();
  if (!property) {
    renderMissingProperty(root);
    return;
  }

  const appName = getAppName();
  const redirectUri = getRedirectUri();
  const claimedAccount = getClaimedAccount();
  const fallback = createEvmMobileFallback();
  const picker = createEvmWalletPicker();
  const pairing = createEvmWalletConnectPairingSheet();
  const wcOffered = isEvmWalletConnectOffered();

  let providers: DiscoveredEvmProvider[] = await discoverEvmProviders({ waitMs: 0 });
  picker.refresh(providers, wcOffered);
  fallback.sync(providers.length > 0);

  const extras: HTMLElement[] = [picker.root, pairing.root, fallback.root];
  if (claimedAccount) {
    // Text node only — query `account` is never an href (GitLab #16).
    extras.unshift(
      el("p", { className: "muted evm-claimed-account" }, [`Sign as ${claimedAccount}`]),
    );
  }
  const extra = el("div", { className: "evm-sign-extras" }, extras);

  void discoverEvmProviders()
    .then((found) => {
      providers = found;
      picker.refresh(found, wcOffered);
      fallback.sync(found.length > 0);
    })
    .catch(() => {
      /* keep the waitMs: 0 snapshot */
    });

  await renderSignShell(root, {
    title: "Sign with EVM wallet",
    property,
    appName,
    idleStatus: evmIdleStatus(providers.length > 0, wcOffered),
    extraControls: extra,
    onSign: async ({ terms, setStatus }) => {
      providers = await discoverEvmProviders();
      picker.refresh(providers, wcOffered);
      fallback.sync(providers.length > 0);

      const selected = picker.selected();
      if (!selected && providers.length === 0) {
        fallback.focusCta();
        setStatus(MISSING_EVM_WALLET_STATUS, "error");
        return;
      }
      if (!selected && providers.length > 1) {
        setStatus(PICK_EVM_WALLET_STATUS, "error");
        return;
      }

      let clientTimestamp = new Date();
      let signedMessage = "";
      setStatus("Confirm signature in your wallet…");

      const result = await signEvmMessage({
        selectedId: selected,
        providers,
        claimedAccount,
        pairing,
        focusFallback: () => fallback.focusCta(),
        prepare: async (accountId) => {
          const status = await getStatus(property, "EVM", accountId);
          if (status.signed_latest) {
            return { alreadySigned: true };
          }
          clientTimestamp = new Date();
          signedMessage = buildWalletMessage({
            versionLabel: terms.version_label,
            effectiveDate: terms.effective_date,
            contentSha256: terms.content_sha256,
            property: terms.property,
            network: "EVM",
            accountId,
            clientTimestamp,
          });
          return { message: signedMessage };
        },
      });

      if ("alreadySigned" in result) {
        renderSuccess(root, terms.version_label, redirectUri);
        return;
      }

      await submitWallet({
        property,
        network: "EVM",
        account_id: result.accountId,
        message: signedMessage,
        signature: result.signature,
        client_timestamp: clientTimestamp.toISOString(),
      });
      renderSuccess(root, terms.version_label, redirectUri);
    },
  });
}
