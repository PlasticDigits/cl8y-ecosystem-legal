import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTermsContent, getTermsLatest } from "./api";
import { hasScrolledTermsToBottom, renderSignShell } from "./signShell";

vi.mock("./api", () => ({
  getTermsLatest: vi.fn(),
  getTermsContent: vi.fn(),
}));

const termsFixture = {
  property: "cl8y.com",
  version_label: "1.5",
  effective_date: "2026-08-10",
  content_sha256: "abc",
  published_at: "2026-08-10T00:00:00Z",
  sign_urls: {
    telegram: "/sign/telegram?property=cl8y.com",
    evm: "/sign/evm?property=cl8y.com",
    terra_classic: "/sign/terra-classic?property=cl8y.com",
    solana: "/sign/solana?property=cl8y.com",
  },
};

function mockScrollMetrics(
  el: HTMLElement,
  metrics: { scrollHeight: number; clientHeight: number; scrollTop?: number },
) {
  let scrollTop = metrics.scrollTop ?? 0;
  Object.defineProperty(el, "scrollHeight", {
    configurable: true,
    get: () => metrics.scrollHeight,
  });
  Object.defineProperty(el, "clientHeight", {
    configurable: true,
    get: () => metrics.clientHeight,
  });
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
  return {
    setScrollTop(value: number) {
      scrollTop = value;
    },
  };
}

describe("hasScrolledTermsToBottom", () => {
  it("is false when layout metrics are unset", () => {
    const el = document.createElement("div");
    mockScrollMetrics(el, { scrollHeight: 0, clientHeight: 0, scrollTop: 0 });
    expect(hasScrolledTermsToBottom(el)).toBe(false);
  });

  it("is true when content fits without scrolling", () => {
    const el = document.createElement("div");
    mockScrollMetrics(el, { scrollHeight: 100, clientHeight: 200, scrollTop: 0 });
    expect(hasScrolledTermsToBottom(el)).toBe(true);
  });

  it("is false until near the bottom of a tall body", () => {
    const el = document.createElement("div");
    const scroll = mockScrollMetrics(el, { scrollHeight: 500, clientHeight: 200, scrollTop: 0 });
    expect(hasScrolledTermsToBottom(el)).toBe(false);
    scroll.setScrollTop(292);
    expect(hasScrolledTermsToBottom(el)).toBe(true);
  });
});

describe("renderSignShell", () => {
  beforeEach(() => {
    vi.mocked(getTermsLatest).mockReset();
    vi.mocked(getTermsContent).mockReset();
  });

  it("keeps consent disabled until terms are scrolled to the bottom", async () => {
    vi.mocked(getTermsLatest).mockResolvedValue(termsFixture);
    vi.mocked(getTermsContent).mockResolvedValue("FULL TERMS BODY <script>alert(1)</script>\n".repeat(40));

    const root = document.createElement("div");
    const onSign = vi.fn().mockResolvedValue(undefined);

    await renderSignShell(root, {
      title: "Sign with EVM wallet",
      property: "cl8y.com",
      appName: "Demo",
      idleStatus: "Connect your wallet to sign.",
      onSign,
    });

    expect(getTermsLatest).toHaveBeenCalledTimes(1);
    expect(getTermsContent).toHaveBeenCalledTimes(1);

    const termsBody = root.querySelector(".terms-body") as HTMLPreElement;
    expect(termsBody?.textContent).toContain("FULL TERMS BODY <script>alert(1)</script>");
    expect(root.querySelector(".terms-body")?.innerHTML).not.toContain("<script>");
    expect(root.textContent).toMatch(/Version 1\.5/);
    expect(root.textContent).toMatch(/Effective 2026-08-10/);

    const btn = root.querySelector("button") as HTMLButtonElement;
    const checkbox = root.querySelector("#terms-consent") as HTMLInputElement;
    const hint = root.querySelector("#terms-consent-hint") as HTMLElement;

    // jsdom has no layout; force an overflowing body so the scroll gate applies.
    const scroll = mockScrollMetrics(termsBody, {
      scrollHeight: 800,
      clientHeight: 200,
      scrollTop: 0,
    });
    termsBody.dispatchEvent(new Event("scroll"));

    expect(checkbox.disabled).toBe(true);
    expect(btn.disabled).toBe(true);
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).toMatch(/Scroll to the bottom/i);

    scroll.setScrollTop(600);
    termsBody.dispatchEvent(new Event("scroll"));

    expect(checkbox.disabled).toBe(false);
    expect(hint.hidden).toBe(true);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));
    expect(btn.disabled).toBe(false);

    await btn.click();
    expect(onSign).toHaveBeenCalledTimes(1);
    expect(onSign.mock.calls[0][0].terms.version_label).toBe("1.5");
  });

  it("enables consent immediately when terms fit without scrolling", async () => {
    vi.mocked(getTermsLatest).mockResolvedValue(termsFixture);
    vi.mocked(getTermsContent).mockResolvedValue("Short terms");

    const root = document.createElement("div");
    await renderSignShell(root, {
      title: "Sign with EVM wallet",
      property: "cl8y.com",
      appName: null,
      idleStatus: "Connect your wallet to sign.",
      onSign: vi.fn(),
    });

    const termsBody = root.querySelector(".terms-body") as HTMLPreElement;
    mockScrollMetrics(termsBody, { scrollHeight: 120, clientHeight: 200, scrollTop: 0 });
    termsBody.dispatchEvent(new Event("scroll"));

    const checkbox = root.querySelector("#terms-consent") as HTMLInputElement;
    expect(checkbox.disabled).toBe(false);
    expect((root.querySelector("#terms-consent-hint") as HTMLElement).hidden).toBe(true);
  });

  it("shows a clear error and keeps CTA disabled when terms fetch fails", async () => {
    vi.mocked(getTermsLatest).mockRejectedValue(new Error("boom"));
    vi.mocked(getTermsContent).mockResolvedValue("unused");

    const root = document.createElement("div");
    await renderSignShell(root, {
      title: "Sign with Terra Classic wallet",
      property: "cl8y.com",
      appName: null,
      idleStatus: "Connect Keplr for Terra Classic.",
      onSign: vi.fn(),
    });

    expect(root.textContent).toMatch(/Unable to load terms/i);
    expect(root.querySelector("[role='alert']")).toBeTruthy();
    const btn = root.querySelector("button") as HTMLButtonElement;
    const checkbox = root.querySelector("#terms-consent") as HTMLInputElement;
    expect(btn.disabled).toBe(true);
    expect(checkbox.disabled).toBe(true);
  });

  it("re-enables Connect & sign when onSign returns early without throwing", async () => {
    vi.mocked(getTermsLatest).mockResolvedValue(termsFixture);
    vi.mocked(getTermsContent).mockResolvedValue("Short terms");

    const root = document.createElement("div");
    await renderSignShell(root, {
      title: "Sign with EVM wallet",
      property: "cl8y.com",
      appName: null,
      idleStatus: "Connect your wallet to sign.",
      onSign: async ({ setStatus }) => {
        setStatus("No wallet in this browser.", "error");
      },
    });

    const termsBody = root.querySelector(".terms-body") as HTMLPreElement;
    mockScrollMetrics(termsBody, { scrollHeight: 120, clientHeight: 200, scrollTop: 0 });
    termsBody.dispatchEvent(new Event("scroll"));

    const checkbox = root.querySelector("#terms-consent") as HTMLInputElement;
    const btn = root.querySelector("button") as HTMLButtonElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));

    btn.click();
    await vi.waitFor(() => {
      expect(btn.disabled).toBe(false);
    });
  });

  it("re-enables Connect & sign after onSign throws", async () => {
    vi.mocked(getTermsLatest).mockResolvedValue(termsFixture);
    vi.mocked(getTermsContent).mockResolvedValue("Short terms");

    const root = document.createElement("div");
    await renderSignShell(root, {
      title: "Sign with EVM wallet",
      property: "cl8y.com",
      appName: null,
      idleStatus: "Connect your wallet to sign.",
      onSign: async () => {
        throw new Error("wallet rejected");
      },
    });

    const termsBody = root.querySelector(".terms-body") as HTMLPreElement;
    mockScrollMetrics(termsBody, { scrollHeight: 120, clientHeight: 200, scrollTop: 0 });
    termsBody.dispatchEvent(new Event("scroll"));

    const checkbox = root.querySelector("#terms-consent") as HTMLInputElement;
    const btn = root.querySelector("button") as HTMLButtonElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));

    btn.click();
    await vi.waitFor(() => {
      expect(btn.disabled).toBe(false);
    });
    expect(root.textContent).toMatch(/wallet rejected/);
  });

  it("renders optional extraControls after Connect & sign", async () => {
    vi.mocked(getTermsLatest).mockResolvedValue(termsFixture);
    vi.mocked(getTermsContent).mockResolvedValue("Short terms");

    const extra = document.createElement("div");
    extra.textContent = "Open in Keplr";

    const root = document.createElement("div");
    await renderSignShell(root, {
      title: "Sign with Terra Classic wallet",
      property: "cl8y.com",
      appName: null,
      idleStatus: "Connect Keplr for Terra Classic.",
      extraControls: extra,
      onSign: vi.fn(),
    });

    expect(root.textContent).toContain("Open in Keplr");
    const connect = root.querySelector("button") as HTMLButtonElement;
    expect(connect.textContent).toMatch(/Connect & sign/i);
    expect(connect.nextElementSibling).toBe(extra);
  });
});
