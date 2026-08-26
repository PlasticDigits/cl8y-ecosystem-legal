import { el } from "../ui";
import { listInjectedWalletIds } from "./injected";
import {
  TERRA_WALLET_MATRIX,
  isTerraWalletId,
  type TerraWalletId,
} from "./matrix";
import { isWalletConnectMobileClient } from "./walletConnectPairing";
import { isWalletConnectOffered } from "./walletConnect";

export interface TerraWalletPicker {
  root: HTMLElement;
  selected(): TerraWalletId | null;
  refresh(): void;
}

export type TerraWalletAvailability = {
  id: TerraWalletId;
  available: boolean;
  reason: string;
};

export function describeWalletAvailability(
  id: TerraWalletId,
  injectedIds: readonly TerraWalletId[] = listInjectedWalletIds(),
  opts: { mobile?: boolean; wcOffered?: (wallet: TerraWalletId) => boolean } = {},
): TerraWalletAvailability {
  const mobile = opts.mobile ?? isWalletConnectMobileClient();
  const wcOffered = opts.wcOffered ?? isWalletConnectOffered;
  const def = TERRA_WALLET_MATRIX.find((w) => w.id === id);
  if (!def) {
    return { id, available: false, reason: "Unknown wallet" };
  }
  if (injectedIds.includes(id)) {
    return { id, available: true, reason: "Ready" };
  }
  if (def.kind === "walletconnect" && wcOffered(id)) {
    return { id, available: true, reason: "Mobile wallet" };
  }
  if (def.kind === "extension") {
    return {
      id,
      available: false,
      reason: mobile ? "Open this page in the wallet app" : "Not in this browser",
    };
  }
  return { id, available: false, reason: "Not available" };
}

/**
 * Radio list of the ustr-cmm Terra Classic wallet set.
 * Disabled rows stay visible so users find themselves; copy never says
 * "install the desktop extension" on a phone.
 */
export function createTerraWalletPicker(
  getInjected: () => TerraWalletId[] = listInjectedWalletIds,
): TerraWalletPicker {
  const list = el("div", { className: "terra-wallet-list", role: "radiogroup", "aria-label": "Wallet" }, []);
  const hint = el("p", { className: "muted terra-wallet-hint" }, []);
  const root = el("div", { className: "terra-wallet-picker", id: "terra-wallet-picker" }, [
    el("p", { className: "terra-wallet-legend" }, ["Wallet"]),
    list,
    hint,
  ]);

  let selectedId: TerraWalletId | null = null;

  const refresh = () => {
    const injected = getInjected();
    const rows = TERRA_WALLET_MATRIX.map((wallet) => describeWalletAvailability(wallet.id, injected));
    const previousStillAvailable =
      previousSelectedAvailable(selectedId, rows) ? selectedId : null;
    // Auto-select injected wallets only. WC (LUNC Dash / Galaxy) must be an
    // explicit tap so desktop missing-Keplr still reaches Open in Keplr.
    const auto = previousStillAvailable ?? injected[0] ?? null;
    selectedId = auto;
    list.replaceChildren();

    for (const wallet of TERRA_WALLET_MATRIX) {
      const avail = rows.find((r) => r.id === wallet.id)!;
      const input = el("input", {
        type: "radio",
        name: "terra-wallet",
        value: wallet.id,
        id: `terra-wallet-${wallet.id}`,
      }) as HTMLInputElement;
      input.disabled = !avail.available;
      input.checked = selectedId === wallet.id;
      input.addEventListener("change", () => {
        if (input.checked && isTerraWalletId(wallet.id)) {
          selectedId = wallet.id;
        }
      });
      const label = el("label", { className: "terra-wallet-option", for: `terra-wallet-${wallet.id}` }, [
        input,
        el("span", { className: "terra-wallet-name" }, [wallet.label]),
        el("span", { className: "muted terra-wallet-reason" }, [avail.reason]),
      ]);
      if (!avail.available) {
        label.classList.add("terra-wallet-option--disabled");
      }
      list.append(label);
    }

    hint.textContent =
      injected.length > 0
        ? ""
        : "On a phone, pick LUNC Dash or Galaxy Station. Open in Keplr is still available below.";
    hint.hidden = hint.textContent.length === 0;
  };

  refresh();

  return {
    root,
    selected: () => selectedId,
    refresh,
  };
}

function previousSelectedAvailable(
  selectedId: TerraWalletId | null,
  rows: TerraWalletAvailability[],
): boolean {
  return Boolean(selectedId && rows.find((r) => r.id === selectedId)?.available);
}
