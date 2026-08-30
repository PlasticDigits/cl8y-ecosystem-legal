import { afterEach, describe, expect, it, vi } from "vitest";
import { createEvmWalletConnectPairingSheet } from "./walletConnectUi";

describe("createEvmWalletConnectPairingSheet", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects non-wc URIs and copies the raw pairing URI", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const sheet = createEvmWalletConnectPairingSheet();
    expect(sheet.open("https://evil.example")).toBe(false);
    expect(sheet.root.hidden).toBe(true);

    const uri = "wc:topic@2?relay-protocol=irn";
    expect(sheet.open(uri)).toBe(true);
    expect(sheet.root.hidden).toBe(false);
    expect(sheet.root.textContent).toContain("Open MetaMask");
    expect(sheet.root.textContent).toContain("Open Binance Web3");
    expect(sheet.root.textContent).not.toMatch(/EIP-191|EIP-6963/i);

    const copy = sheet.root.querySelector("#copy-evm-wc-pairing") as HTMLButtonElement;
    copy.click();
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(uri);
    });
  });

  it("does not set href for a pairing payload that is not allowlisted", () => {
    const sheet = createEvmWalletConnectPairingSheet();
    expect(sheet.open("wc:x")).toBe(false);
  });

  it("Cancel aborts pairing", () => {
    const sheet = createEvmWalletConnectPairingSheet();
    const cancel = vi.fn();
    sheet.onCancel(cancel);
    sheet.open("wc:topic@2?relay-protocol=irn");
    (sheet.root.querySelector("#cancel-evm-wc-pairing") as HTMLButtonElement).click();
    expect(cancel).toHaveBeenCalled();
  });
});
