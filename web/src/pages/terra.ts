import { getTermsLatest, submitWallet } from "../api";
import { buildWalletMessage } from "../message";
import { getAppName, getRedirectUri, requireProperty } from "../query";
import { el, renderMissingProperty, renderSuccess } from "../ui";

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

interface KeplrKey {
  bech32Address: string;
}

interface KeplrArbitrarySignature {
  signature: string;
  pub_key: { type: string; value: string };
}

declare global {
  interface Window {
    keplr?: {
      enable: (chainId: string) => Promise<void>;
      getKey: (chainId: string) => Promise<KeplrKey>;
      /**
       * ADR-036 `signArbitrary` — not OfflineSigner.signArbitrary(address, data).
       * @see https://docs.keplr.app/api/guide/sign-arbitrary
       */
      signArbitrary: (
        chainId: string,
        signerAddress: string,
        data: string | Uint8Array,
      ) => Promise<KeplrArbitrarySignature>;
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
      const key = await window.keplr.getKey(TERRA_CHAIN_ID);
      const accountId = canonicalizeTerraAddress(key.bech32Address);
      const terms = await getTermsLatest(property);
      const clientTimestamp = new Date();
      const message = buildWalletMessage({
        versionLabel: terms.version_label,
        effectiveDate: terms.effective_date,
        property: terms.property,
        network: "TERRA_CLASSIC",
        accountId,
        clientTimestamp,
      });
      statusEl.textContent = "Confirm signature in Keplr…";
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
    } catch (e) {
      statusEl.className = "error";
      statusEl.textContent = String(e);
      btn.disabled = false;
    }
  };
}
