import { getStatus, getTermsLatest, submitWallet } from "../api";
import { uint8ToBase58 } from "../base58";
import { buildWalletMessage } from "../message";
import { getAppName, getClaimedAccount, getRedirectUri, requireProperty } from "../query";
import { assertSolanaAccountContinuity } from "../solana/account";
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

/**
 * `/sign/solana` — integrator `account=` bind (GitLab #17).
 *
 * Does **not** use `renderSignShell` (terms disclosure is GitLab #2, postponed).
 * Does **not** mount EVM/Terra extraControls. `window.solana` only.
 * Envelope P0 (UTF-8 `signMessage` vs API off-chain prefix) is unchanged.
 */
export async function renderSolana(root: HTMLElement) {
  const property = requireProperty();
  if (!property) {
    renderMissingProperty(root);
    return;
  }

  const appName = getAppName();
  const redirectUri = getRedirectUri();
  const claimedAccount = getClaimedAccount();
  const statusEl = el("p", { className: "muted" }, ["Connect Phantom or another Solana wallet."]);
  const btn = el("button", {}, ["Connect & sign"]) as HTMLButtonElement;

  const claimedEl = claimedAccount
    ? el("p", { className: "muted solana-claimed-account" }, [`Sign as ${claimedAccount}`])
    : document.createComment("");

  root.replaceChildren(
    el("h1", {}, ["Sign with Solana wallet"]),
    appName ? el("p", { className: "muted" }, [`App: ${appName}`]) : document.createComment(""),
    el("p", { className: "muted" }, [`Property: ${property}`]),
    el("div", { className: "card" }, [claimedEl, statusEl, btn]),
  );

  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const provider = window.solana;
      if (!provider) throw new Error("No Solana wallet found");
      const { publicKey } = await provider.connect();
      const bound = assertSolanaAccountContinuity(claimedAccount, publicKey.toString());

      const [status, terms] = await Promise.all([
        getStatus(property, "SOLANA", bound),
        getTermsLatest(property),
      ]);
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
        network: "SOLANA",
        accountId: bound,
        clientTimestamp,
      });
      statusEl.textContent = "Confirm signature in your wallet…";
      const encoded = new TextEncoder().encode(message);
      const { signature } = await provider.signMessage(encoded, "utf8");
      const sig58 = uint8ToBase58(signature);
      await submitWallet({
        property,
        network: "SOLANA",
        account_id: bound,
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
