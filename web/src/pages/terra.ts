import { getStatus, submitWallet } from "../api";
import {
  hasInjectedKeplr,
  MISSING_KEPLR_STATUS,
  terraIdleStatus,
} from "../keplrMobile";
import { createKeplrMobileFallback } from "../keplrMobileUi";
import { buildWalletMessage } from "../message";
import { getAppName, getRedirectUri, requireProperty } from "../query";
import { renderSignShell } from "../signShell";
import { renderMissingProperty, renderSuccess } from "../ui";

/** Terra Classic mainnet — do not retarget to Terra 2.0 without an explicit product change. */
const TERRA_CHAIN_ID = "columbus-5";

/**
 * Canonicalize Keplr bech32 to lowercase before building/signing the legal message.
 * API `normalize_account` also re-encodes lowercase; mixed case is invalid per BIP-173.
 */
function canonicalizeTerraAddress(address: string): string {
  const trimmed = address.trim();
  const lower = trimmed.toLowerCase();
  const upper = trimmed.toUpperCase();
  if (trimmed !== lower && trimmed !== upper) {
    throw new Error("invalid Terra Classic address (mixed case)");
  }
  return lower;
}

export async function renderTerra(root: HTMLElement) {
  const property = requireProperty();
  if (!property) {
    renderMissingProperty(root);
    return;
  }

  const appName = getAppName();
  const redirectUri = getRedirectUri();
  const fallback = createKeplrMobileFallback();
  const injected = hasInjectedKeplr();
  fallback.sync(injected);

  await renderSignShell(root, {
    title: "Sign with Terra Classic wallet",
    property,
    appName,
    idleStatus: terraIdleStatus(injected),
    extraControls: fallback.root,
    onSign: async ({ terms, setStatus }) => {
      if (!hasInjectedKeplr() || !window.keplr) {
        fallback.focusCta();
        setStatus(MISSING_KEPLR_STATUS, "error");
        return;
      }
      await window.keplr.enable(TERRA_CHAIN_ID);
      const key = await window.keplr.getKey(TERRA_CHAIN_ID);
      const accountId = canonicalizeTerraAddress(key.bech32Address);

      const status = await getStatus(property, "TERRA_CLASSIC", accountId);
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
        network: "TERRA_CLASSIC",
        accountId,
        clientTimestamp,
      });
      setStatus("Confirm signature in Keplr…");
      // Keplr wraps `message` as ADR-036 MsgSignData; API verifies the same envelope.
      const result = await window.keplr.signArbitrary(TERRA_CHAIN_ID, accountId, message);
      await submitWallet({
        property,
        network: "TERRA_CLASSIC",
        account_id: accountId,
        message,
        signature: result.signature,
        pubkey: result.pub_key.value,
        client_timestamp: clientTimestamp.toISOString(),
      });
      renderSuccess(root, terms.version_label, redirectUri);
    },
  });
}
