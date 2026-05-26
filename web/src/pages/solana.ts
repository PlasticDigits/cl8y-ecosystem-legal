import { getTermsLatest, submitWallet } from "../api";
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

function uint8ToBase58(bytes: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      const x = digits[j] * 256 + carry;
      digits[j] = x % 58;
      carry = (x / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let str = "";
  for (const d of digits.reverse()) str += ALPHABET[d];
  let zeros = 0;
  for (const b of bytes) {
    if (b === 0) zeros++;
    else break;
  }
  return "1".repeat(zeros) + str;
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
