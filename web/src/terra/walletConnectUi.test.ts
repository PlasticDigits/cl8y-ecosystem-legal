import { afterEach, describe, expect, it, vi } from "vitest";
import { LUNC_DASH_PAIRING } from "./walletConnectPairing";
import { createWalletConnectPairingSheet } from "./walletConnectUi";

describe("createWalletConnectPairingSheet", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects non-wc URIs and copies the raw pairing URI", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const sheet = createWalletConnectPairingSheet();
    expect(sheet.open(LUNC_DASH_PAIRING, "https://evil.example")).toBe(false);
    expect(sheet.root.hidden).toBe(true);

    const uri = "wc:topic@1?bridge=https://walletconnect.luncdash.com";
    expect(sheet.open(LUNC_DASH_PAIRING, uri)).toBe(true);
    expect(sheet.root.hidden).toBe(false);
    expect(sheet.root.textContent).toContain("Open LUNC Dash");
    expect(sheet.root.textContent).not.toMatch(/ADR-036/i);

    const copy = sheet.root.querySelector("#copy-wc-pairing") as HTMLButtonElement;
    copy.click();
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(uri);
    });
  });

  it("Cancel aborts pairing", () => {
    const sheet = createWalletConnectPairingSheet();
    const cancel = vi.fn();
    sheet.onCancel(cancel);
    sheet.open(LUNC_DASH_PAIRING, "wc:topic@1?bridge=https://x");
    (sheet.root.querySelector("#cancel-wc-pairing") as HTMLButtonElement).click();
    expect(cancel).toHaveBeenCalled();
  });
});
