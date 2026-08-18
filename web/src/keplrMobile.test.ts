import { afterEach, describe, expect, it, vi } from "vitest";
import {
  copyTextToClipboard,
  hasInjectedKeplr,
  keplrWebBrowserUniversalLink,
  KEPLR_DEEPLINK_ORIGIN,
  MISSING_KEPLR_STATUS,
  portalSignUrlFromHref,
  TERRA_IDLE_WITHOUT_KEPLR,
  terraIdleStatus,
} from "./keplrMobile";

describe("portalSignUrlFromHref", () => {
  it("keeps path and query, drops hash", () => {
    expect(
      portalSignUrlFromHref(
        "https://terms.cl8y.com/sign/terra-classic?property=dex.cl8y.com&redirect_uri=https%3A%2F%2Fdex.cl8y.com#frag",
      ),
    ).toBe(
      "https://terms.cl8y.com/sign/terra-classic?property=dex.cl8y.com&redirect_uri=https%3A%2F%2Fdex.cl8y.com",
    );
  });

  it("rejects javascript and data schemes", () => {
    expect(portalSignUrlFromHref("javascript:alert(1)")).toBeNull();
    expect(portalSignUrlFromHref("data:text/html,hi")).toBeNull();
    expect(portalSignUrlFromHref("not a url")).toBeNull();
  });
});

describe("keplrWebBrowserUniversalLink", () => {
  const signUrl =
    "https://terms.cl8y.com/sign/terra-classic?property=ust1cmm.com&app_name=CMM";

  it("encodes the portal sign URL as the documented web-browser param", () => {
    const link = keplrWebBrowserUniversalLink(signUrl);
    expect(link).toBe(
      `${KEPLR_DEEPLINK_ORIGIN}/web-browser?url=${encodeURIComponent(
        "https://terms.cl8y.com/sign/terra-classic?property=ust1cmm.com&app_name=CMM",
      )}`,
    );
    const encoded = new URL(link!).searchParams.get("url");
    expect(encoded).toBe(
      "https://terms.cl8y.com/sign/terra-classic?property=ust1cmm.com&app_name=CMM",
    );
  });

  it("fails closed when expectedOrigin does not match", () => {
    expect(keplrWebBrowserUniversalLink(signUrl, "https://evil.example")).toBeNull();
    expect(keplrWebBrowserUniversalLink(signUrl, "https://terms.cl8y.com")).toBe(
      `${KEPLR_DEEPLINK_ORIGIN}/web-browser?url=${encodeURIComponent(
        "https://terms.cl8y.com/sign/terra-classic?property=ust1cmm.com&app_name=CMM",
      )}`,
    );
  });

  it("does not deep-link an attacker URL even if it is https", () => {
    expect(
      keplrWebBrowserUniversalLink("https://evil.example/phish", "https://terms.cl8y.com"),
    ).toBeNull();
  });

  it("allows http localhost for local/e2e", () => {
    const local = "http://127.0.0.1:5173/sign/terra-classic?property=cl8y.com";
    const link = keplrWebBrowserUniversalLink(local, "http://127.0.0.1:5173");
    expect(link).toContain(encodeURIComponent(local));
  });
});

describe("terraIdleStatus", () => {
  it("is retail-short and never mentions ADR-036", () => {
    expect(terraIdleStatus(true)).not.toMatch(/ADR-036/i);
    expect(terraIdleStatus(false)).toBe(TERRA_IDLE_WITHOUT_KEPLR);
    expect(terraIdleStatus(false)).not.toMatch(/ADR-036/i);
    expect(terraIdleStatus(false)).toMatch(/Keplr app/i);
    expect(MISSING_KEPLR_STATUS).not.toMatch(/extension not found/i);
  });
});

describe("hasInjectedKeplr", () => {
  afterEach(() => {
    delete window.keplr;
  });

  it("is false without window.keplr", () => {
    delete window.keplr;
    expect(hasInjectedKeplr()).toBe(false);
  });

  it("requires signArbitrary", () => {
    window.keplr = {
      enable: async () => {},
      getKey: async () => ({ bech32Address: "x" }),
    } as unknown as Window["keplr"];
    expect(hasInjectedKeplr()).toBe(false);
  });
});

describe("copyTextToClipboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses navigator.clipboard when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyTextToClipboard("https://terms.cl8y.com/sign/terra-classic")).resolves.toBe(
      true,
    );
    expect(writeText).toHaveBeenCalledWith("https://terms.cl8y.com/sign/terra-classic");
  });
});
