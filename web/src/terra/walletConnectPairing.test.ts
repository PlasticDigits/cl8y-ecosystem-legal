import { describe, expect, it } from "vitest";
import {
  GALAXY_STATION_PAIRING,
  LUNC_DASH_PAIRING,
  buildLuncDashDeepLink,
  buildWalletConnectDeepLinks,
  isAllowedWalletConnectDeepLink,
  isWalletConnectMobileClient,
  isWalletConnectPairingUri,
  toAndroidIntentUri,
} from "./walletConnectPairing";

describe("walletConnectPairing", () => {
  it("accepts wc v1/v2 pairing URIs and rejects other schemes", () => {
    expect(isWalletConnectPairingUri("wc:abc@1?bridge=https://x")).toBe(true);
    expect(isWalletConnectPairingUri("wc:abc@2?relay-protocol=irn")).toBe(true);
    expect(isWalletConnectPairingUri("https://evil.example")).toBe(false);
    expect(isWalletConnectPairingUri("javascript:alert(1)")).toBe(false);
  });

  it("builds the cosmes LUNC Dash scheme", () => {
    const uri = "wc:topic@1?bridge=https://walletconnect.luncdash.com";
    expect(buildLuncDashDeepLink(uri)).toBe(
      `luncdash://wallet_connect?${encodeURIComponent(`payload=${encodeURIComponent(uri)}`)}`,
    );
  });

  it("allowlists pairing hrefs and rejects open redirects", () => {
    expect(isAllowedWalletConnectDeepLink("wc:x@2?relay-protocol=irn")).toBe(true);
    expect(isAllowedWalletConnectDeepLink("luncdash://wallet_connect?x")).toBe(true);
    expect(isAllowedWalletConnectDeepLink("https://station.hexxagon.io/wcV2")).toBe(true);
    expect(isAllowedWalletConnectDeepLink("https://evil.example/phish")).toBe(false);
    expect(isAllowedWalletConnectDeepLink("https://dex.cl8y.com/?redirect_uri=https://evil")).toBe(
      false,
    );
  });

  it("converts Galaxy Android #Intent templates to intent://", () => {
    const template =
      "https://station.hexxagon.io/wcV2#Intent;package=io.hexxagon.station;scheme=galaxystation;end;";
    expect(toAndroidIntentUri(template)).toBe(
      "intent://wcV2#Intent;package=io.hexxagon.station;scheme=galaxystation;end;",
    );
  });

  it("offers Open LUNC Dash + Open wallet on mobile pairing", () => {
    const uri = "wc:topic@1?bridge=https://walletconnect.luncdash.com";
    const links = buildWalletConnectDeepLinks(LUNC_DASH_PAIRING, uri);
    expect(links.map((l) => l.label)).toEqual(["Open LUNC Dash", "Open wallet"]);
    expect(links[0]?.href.startsWith("luncdash://")).toBe(true);
    expect(links[1]?.href).toBe(uri);
  });

  it("offers Open Galaxy Station via Android intent", () => {
    const uri = "wc:topic@2?relay-protocol=irn";
    const links = buildWalletConnectDeepLinks(GALAXY_STATION_PAIRING, uri, {
      userAgent: "Mozilla/5.0 (Linux; Android 16) Chrome/120",
    });
    expect(links[0]?.label).toBe("Open Galaxy Station");
    expect(links[0]?.href.startsWith("intent://")).toBe(true);
    expect(links[0]?.href).not.toContain("redirect_uri=");
  });

  it("detects Android Chrome as a mobile WC client", () => {
    expect(
      isWalletConnectMobileClient({
        userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel) Chrome/120.0.0.0 Mobile",
      }),
    ).toBe(true);
    expect(
      isWalletConnectMobileClient({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
        matchMedia: () => ({ matches: false }),
      }),
    ).toBe(false);
  });
});
