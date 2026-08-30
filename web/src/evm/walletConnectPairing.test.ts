import { describe, expect, it } from "vitest";
import {
  binanceWalletConnectLink,
  buildEvmWalletConnectDeepLinks,
  isEvmWalletConnectPairingUri,
  metaMaskWalletConnectLink,
} from "./walletConnectPairing";

const uri = "wc:topic@2?relay-protocol=irn&symKey=abc";

describe("isEvmWalletConnectPairingUri", () => {
  it("accepts wc:…@n and rejects other schemes", () => {
    expect(isEvmWalletConnectPairingUri(uri)).toBe(true);
    expect(isEvmWalletConnectPairingUri("https://evil.example")).toBe(false);
    expect(isEvmWalletConnectPairingUri("javascript:alert(1)")).toBe(false);
  });
});

describe("buildEvmWalletConnectDeepLinks", () => {
  it("returns Open MetaMask + Open Binance Web3 + Open wallet for a wc: URI", () => {
    const links = buildEvmWalletConnectDeepLinks(uri, { userAgent: "iPhone" });
    expect(links.map((l) => l.id)).toEqual(["metamask", "binance", "generic"]);
    expect(links[0]?.href).toBe(metaMaskWalletConnectLink(uri));
    expect(links[1]?.href).toBe(binanceWalletConnectLink(uri, "iPhone"));
    expect(links[2]?.href).toBe(uri);
    expect(links[0]?.href).toContain(encodeURIComponent(uri));
    expect(links[0]?.href).not.toContain("redirect_uri");
  });

  it("uses bnc:// on Android for Binance", () => {
    const links = buildEvmWalletConnectDeepLinks(uri, { userAgent: "Android" });
    const bnb = links.find((l) => l.id === "binance");
    expect(bnb?.href.startsWith("bnc://app.binance.com/cedefi/wc?uri=")).toBe(true);
  });

  it("returns nothing for a non-pairing URI", () => {
    expect(buildEvmWalletConnectDeepLinks("https://evil.example/wc")).toEqual([]);
  });
});
