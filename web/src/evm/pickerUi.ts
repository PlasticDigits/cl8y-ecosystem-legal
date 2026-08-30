import { el } from "../ui";
import { WALLETCONNECT_ID, isEvmWalletConnectOffered } from "./walletConnect";
import type { DiscoveredEvmProvider } from "./provider";

export interface EvmWalletPicker {
  root: HTMLElement;
  selected(): string | null;
  refresh(providers: readonly DiscoveredEvmProvider[], wcOffered?: boolean): void;
}

type PickerRow = {
  id: string;
  name: string;
  available: boolean;
  reason: string;
};

/**
 * Radio list of discovered EIP-1193 wallets plus WalletConnect when configured.
 * Multiple injected wallets require an explicit pick (no silent default).
 * WalletConnect is never auto-selected so missing-provider still reaches Open in MetaMask.
 */
export function createEvmWalletPicker(): EvmWalletPicker {
  const list = el("div", { className: "evm-wallet-list", role: "radiogroup", "aria-label": "Wallet" }, []);
  const hint = el("p", { className: "muted evm-wallet-hint" }, []);
  const root = el("div", { className: "evm-wallet-picker", id: "evm-wallet-picker" }, [
    el("p", { className: "evm-wallet-legend" }, ["Wallet"]),
    list,
    hint,
  ]);

  let selectedId: string | null = null;
  let lastProviders: readonly DiscoveredEvmProvider[] = [];

  const refresh = (
    providers: readonly DiscoveredEvmProvider[],
    wcOffered: boolean = isEvmWalletConnectOffered(),
  ) => {
    lastProviders = providers;
    const rows: PickerRow[] = providers.map((p) => ({
      id: p.id,
      name: p.name,
      available: true,
      reason: "Ready",
    }));
    if (wcOffered) {
      rows.push({
        id: WALLETCONNECT_ID,
        name: "WalletConnect",
        available: true,
        reason: "Mobile wallet",
      });
    }

    const previousStillAvailable = rows.some((r) => r.id === selectedId && r.available)
      ? selectedId
      : null;
    // Auto-select only when exactly one injected provider exists.
    const auto =
      previousStillAvailable ?? (providers.length === 1 ? providers[0]!.id : null);
    selectedId = auto;

    list.replaceChildren();
    for (const row of rows) {
      const inputId = `evm-wallet-${cssSafeId(row.id)}`;
      const input = el("input", {
        type: "radio",
        name: "evm-wallet",
        value: row.id,
        id: inputId,
      }) as HTMLInputElement;
      input.disabled = !row.available;
      input.checked = selectedId === row.id;
      input.addEventListener("change", () => {
        if (input.checked) {
          selectedId = row.id;
        }
      });
      const label = el("label", { className: "evm-wallet-option", for: inputId }, [
        input,
        el("span", { className: "evm-wallet-name" }, [row.name]),
        el("span", { className: "muted evm-wallet-reason" }, [row.reason]),
      ]);
      if (!row.available) {
        label.classList.add("evm-wallet-option--disabled");
      }
      list.append(label);
    }

    root.hidden = rows.length === 0;
    hint.textContent =
      providers.length > 0
        ? ""
        : wcOffered
          ? "On a phone, pick WalletConnect or open MetaMask / Binance Web3 below."
          : "On a phone, open MetaMask or Binance Web3 below.";
    hint.hidden = hint.textContent.length === 0;
  };

  refresh(lastProviders);

  return {
    root,
    selected: () => selectedId,
    refresh,
  };
}

function cssSafeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "-");
}
