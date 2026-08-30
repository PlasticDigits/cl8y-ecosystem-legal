import { afterEach, describe, expect, it } from "vitest";
import { createEvmWalletPicker } from "./pickerUi";
import { WALLETCONNECT_ID } from "./walletConnect";
import type { DiscoveredEvmProvider, Eip1193Provider } from "./provider";

function provider(id: string, name: string): DiscoveredEvmProvider {
  return {
    id,
    name,
    rdns: null,
    provider: { request: async () => [] } as Eip1193Provider,
  };
}

describe("createEvmWalletPicker", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("auto-selects exactly one injected wallet", () => {
    const picker = createEvmWalletPicker();
    picker.refresh([provider("injected:ethereum", "MetaMask")], false);
    expect(picker.selected()).toBe("injected:ethereum");
    expect(picker.root.textContent).toContain("MetaMask");
    expect(picker.root.textContent).not.toMatch(/EIP-6963/i);
  });

  it("does not auto-select when several providers announce", () => {
    const picker = createEvmWalletPicker();
    picker.refresh(
      [provider("eip6963:io.metamask", "MetaMask"), provider("eip6963:com.binance", "Binance Web3")],
      false,
    );
    expect(picker.selected()).toBeNull();
    expect(picker.root.textContent).toContain("MetaMask");
    expect(picker.root.textContent).toContain("Binance Web3");
  });

  it("does not auto-select WalletConnect when nothing is injected", () => {
    const picker = createEvmWalletPicker();
    picker.refresh([], true);
    expect(picker.selected()).toBeNull();
    expect(picker.root.textContent).toContain("WalletConnect");
    const wc = picker.root.querySelector(`#evm-wallet-${WALLETCONNECT_ID}`) as HTMLInputElement;
    expect(wc.disabled).toBe(false);
    expect(wc.checked).toBe(false);
  });

  it("hides when there are no rows", () => {
    const picker = createEvmWalletPicker();
    picker.refresh([], false);
    expect(picker.root.hidden).toBe(true);
  });
});
