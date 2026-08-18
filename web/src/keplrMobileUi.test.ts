import { afterEach, describe, expect, it, vi } from "vitest";
import { createKeplrMobileFallback } from "./keplrMobileUi";
import { KEPLR_DEEPLINK_ORIGIN } from "./keplrMobile";

describe("createKeplrMobileFallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const page =
    "https://terms.cl8y.com/sign/terra-classic?property=dex.cl8y.com&redirect_uri=https%3A%2F%2Fdex.cl8y.com";

  it("hides when Keplr is injected and shows a documented deep link otherwise", () => {
    const fallback = createKeplrMobileFallback(
      () => page,
      () => "https://terms.cl8y.com",
    );

    fallback.sync(true);
    expect(fallback.root.hidden).toBe(true);

    fallback.sync(false);
    expect(fallback.root.hidden).toBe(false);

    const open = fallback.root.querySelector("#open-in-keplr") as HTMLAnchorElement;
    expect(open.textContent).toBe("Open in Keplr");
    const href = open.getAttribute("href") ?? "";
    expect(href.startsWith(`${KEPLR_DEEPLINK_ORIGIN}/web-browser?url=`)).toBe(true);
    const target = new URL(href).searchParams.get("url");
    expect(target).toBe(
      "https://terms.cl8y.com/sign/terra-classic?property=dex.cl8y.com&redirect_uri=https%3A%2F%2Fdex.cl8y.com",
    );
    expect(target).not.toBe("https://dex.cl8y.com");
  });

  it("copy-link writes the portal URL, not the deeplink host", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const fallback = createKeplrMobileFallback(
      () => page,
      () => "https://terms.cl8y.com",
    );
    fallback.sync(false);

    const copy = fallback.root.querySelector("#copy-sign-link") as HTMLButtonElement;
    copy.click();
    await vi.waitFor(() => {
      expect(fallback.root.querySelector("#keplr-copy-status")?.textContent).toMatch(/Link copied/i);
    });
    expect(writeText).toHaveBeenCalledWith(
      "https://terms.cl8y.com/sign/terra-classic?property=dex.cl8y.com&redirect_uri=https%3A%2F%2Fdex.cl8y.com",
    );
  });

  it("focusCta reveals the panel even if it was hidden", () => {
    const fallback = createKeplrMobileFallback(
      () => page,
      () => "https://terms.cl8y.com",
    );
    fallback.sync(true);
    fallback.focusCta();
    expect(fallback.root.hidden).toBe(false);
    expect(fallback.root.classList.contains("keplr-mobile-fallback--attention")).toBe(true);
  });
});
