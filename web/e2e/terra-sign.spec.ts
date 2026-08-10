import { test, expect } from "@playwright/test";
import { installKeplrWallet, TERRA_TEST_ADDRESS } from "./helpers/keplr-wallet";
import { acceptViaConsent } from "./helpers/sign-flow";

const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? "http://127.0.0.1:8080";

test.describe("Terra Classic full-stack sign", () => {
  test("connects mock Keplr and accepts terms via ADR-036", async ({ page }) => {
    await installKeplrWallet(page);
    await page.goto("/sign/terra-classic?property=cl8y.com");

    await expect(page.getByText("Property: cl8y.com")).toBeVisible();
    await acceptViaConsent(page);

    const statusRes = await fetch(
      `${API_BASE}/api/v1/signatures/status?property=cl8y.com&network=TERRA_CLASSIC&account=${TERRA_TEST_ADDRESS}`,
    );
    expect(statusRes.ok).toBe(true);
    const status = (await statusRes.json()) as { signed_latest: boolean };
    expect(status.signed_latest).toBe(true);
  });
});
