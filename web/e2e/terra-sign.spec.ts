import { test, expect } from "@playwright/test";
import { installKeplrWallet, TERRA_TEST_ADDRESS } from "./helpers/keplr-wallet";
import { acceptViaConsent, consentAndEnableSign } from "./helpers/sign-flow";

const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? "http://127.0.0.1:8080";

test.describe("Terra Classic full-stack sign", () => {
  test("connects mock Keplr and accepts terms via ADR-036", async ({ page }) => {
    await installKeplrWallet(page);
    await page.goto("/sign/terra-classic?property=cl8y.com");

    await expect(page.getByText("Property: cl8y.com")).toBeVisible();
    await expect(page.getByRole("link", { name: /Open in Keplr/i })).toHaveCount(0);
    await acceptViaConsent(page);

    const statusRes = await fetch(
      `${API_BASE}/api/v1/signatures/status?property=cl8y.com&network=TERRA_CLASSIC&account=${TERRA_TEST_ADDRESS}`,
    );
    expect(statusRes.ok).toBe(true);
    const status = (await statusRes.json()) as { signed_latest: boolean };
    expect(status.signed_latest).toBe(true);
  });

  test("without window.keplr shows Open in Keplr instead of a dead-end error", async ({ page }) => {
    await page.goto("/sign/terra-classic?property=cl8y.com&redirect_uri=https://cl8y.com");

    await expect(page.getByText("Property: cl8y.com")).toBeVisible();
    await expect(page.getByText(/open this page in the Keplr app/i)).toBeVisible();
    await expect(page.getByText(/ADR-036/i)).toHaveCount(0);

    const open = page.getByRole("link", { name: /Open in Keplr/i });
    await expect(open).toBeVisible();
    const href = await open.getAttribute("href");
    expect(href).toBeTruthy();
    const deeplink = new URL(href!);
    expect(deeplink.origin).toBe("https://deeplink.keplr.app");
    expect(deeplink.pathname).toBe("/web-browser");
    const target = deeplink.searchParams.get("url");
    expect(target).toContain("/sign/terra-classic");
    expect(target).toContain("property=cl8y.com");
    expect(target).toContain("redirect_uri=");
    expect(target).not.toBe("https://cl8y.com");

    await expect(page.getByRole("button", { name: /Copy link/i })).toBeVisible();

    const signBtn = await consentAndEnableSign(page);
    await signBtn.click();

    await expect(page.getByText(/Keplr extension not found/i)).toHaveCount(0);
    await expect(page.getByText(/Keplr is not in this browser/i)).toBeVisible();
    await expect(open).toBeVisible();
    await expect(page.getByRole("heading", { name: "Accepted" })).toHaveCount(0);
  });
});
