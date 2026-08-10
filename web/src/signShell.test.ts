import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTermsContent, getTermsLatest } from "./api";
import { renderSignShell } from "./signShell";

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

describe("renderSignShell", () => {
  beforeEach(() => {
    vi.mocked(getTermsLatest).mockReset();
    vi.mocked(getTermsContent).mockReset();
  });

  it("shows terms text, version, and gates Connect & sign on consent checkbox", async () => {
    vi.mocked(getTermsLatest).mockResolvedValue(termsFixture);
    vi.mocked(getTermsContent).mockResolvedValue("FULL TERMS BODY <script>alert(1)</script>");

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

    const termsBody = root.querySelector(".terms-body");
    expect(termsBody?.textContent).toBe("FULL TERMS BODY <script>alert(1)</script>");
    expect(root.querySelector(".terms-body")?.innerHTML).not.toContain("<script>");
    expect(root.textContent).toMatch(/Version 1\.5/);
    expect(root.textContent).toMatch(/Effective 2026-08-10/);

    const btn = root.querySelector("button") as HTMLButtonElement;
    const checkbox = root.querySelector("#terms-consent") as HTMLInputElement;
    expect(btn.disabled).toBe(true);
    expect(checkbox.disabled).toBe(false);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));
    expect(btn.disabled).toBe(false);

    await btn.click();
    expect(onSign).toHaveBeenCalledTimes(1);
    expect(onSign.mock.calls[0][0].terms.version_label).toBe("1.5");
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
});
