import { getStatus, submitWallet } from "../api";
import {
  hasInjectedKeplr,
  MISSING_KEPLR_STATUS,
  terraIdleStatus,
} from "../keplrMobile";
import { createKeplrMobileFallback } from "../keplrMobileUi";
import { buildWalletMessage } from "../message";
import { getAppName, getClaimedAccount, getRedirectUri, requireProperty } from "../query";
import { renderSignShell } from "../signShell";
import { el, renderMissingProperty, renderSuccess } from "../ui";
import { hasAnyInjectedTerraWallet } from "../terra/injected";
import { TERRA_WALLET_MATRIX } from "../terra/matrix";
import { createTerraWalletPicker } from "../terra/pickerUi";
import { signTerraClassicMessage } from "../terra/sign";
import { createWalletConnectPairingSheet } from "../terra/walletConnectUi";

export async function renderTerra(root: HTMLElement) {
  const property = requireProperty();
  if (!property) {
    renderMissingProperty(root);
    return;
  }

  const appName = getAppName();
  const redirectUri = getRedirectUri();
  const claimedAccount = getClaimedAccount();
  const fallback = createKeplrMobileFallback();
  const picker = createTerraWalletPicker();
  const pairing = createWalletConnectPairingSheet();
  const injected = hasAnyInjectedTerraWallet();
  fallback.sync(injected);

  const extras: HTMLElement[] = [picker.root, pairing.root, fallback.root];
  if (claimedAccount) {
    extras.unshift(
      el("p", { className: "muted terra-claimed-account" }, [`Sign as ${claimedAccount}`]),
    );
  }
  const extra = el("div", { className: "terra-sign-extras" }, extras);

  await renderSignShell(root, {
    title: "Sign with Terra Classic wallet",
    property,
    appName,
    idleStatus: terraIdleStatus(injected),
    extraControls: extra,
    onSign: async ({ terms, setStatus }) => {
      picker.refresh();
      const walletId = picker.selected();
      if (!walletId && !hasInjectedKeplr() && !hasAnyInjectedTerraWallet()) {
        fallback.focusCta();
        setStatus(MISSING_KEPLR_STATUS, "error");
        return;
      }

      let clientTimestamp = new Date();
      let signedMessage = "";
      setStatus(confirmCopy(walletId));

      const result = await signTerraClassicMessage({
        walletId,
        claimedAccount,
        pairing,
        focusKeplrFallback: () => fallback.focusCta(),
        prepare: async (accountId) => {
          const status = await getStatus(property, "TERRA_CLASSIC", accountId);
          if (status.signed_latest) {
            return { alreadySigned: true };
          }
          clientTimestamp = new Date();
          signedMessage = buildWalletMessage({
            versionLabel: terms.version_label,
            effectiveDate: terms.effective_date,
            contentSha256: terms.content_sha256,
            property: terms.property,
            network: "TERRA_CLASSIC",
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
        network: "TERRA_CLASSIC",
        account_id: result.accountId,
        message: signedMessage,
        signature: result.signature,
        pubkey: result.pubkey,
        client_timestamp: clientTimestamp.toISOString(),
      });
      renderSuccess(root, terms.version_label, redirectUri);
    },
  });
}

function confirmCopy(walletId: string | null): string {
  const label = TERRA_WALLET_MATRIX.find((w) => w.id === walletId)?.label ?? "wallet";
  return `Confirm signature in ${label}…`;
}
