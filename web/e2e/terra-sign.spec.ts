import { test, expect } from "@playwright/test";
import { installKeplrWallet, TERRA_TEST_ADDRESS } from "./helpers/keplr-wallet";

const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? "http://127.0.0.1:8080";

test.describe("Terra Classic full-stack sign", () => {
  test("connects mock Keplr and accepts terms via ADR-036", async ({ page }) => {
    await installKeplrWallet(page);
    await page.goto("/sign/terra-classic?property=cl8y.com");

    await expect(page.getByText("Property: cl8y.com")).toBeVisible();
    await expect(page.locator(".terms-body")).toContainText(/CL8Y ECOSYSTEM TERMS AND CONDITIONS/i, {
      timeout: 30_000,
    });
    const signBtn = page.getByRole("button", { name: /Connect & sign/i });
    await expect(signBtn).toBeDisabled();
    await page.getByLabel(/I have read and agree to the Terms & Conditions/i).check();
    await expect(signBtn).toBeEnabled();
    await signBtn.click();

    const accepted = page.getByRole("heading", { name: "Accepted" });
    const error = page.locator(".error");
    await expect(accepted.or(error)).toBeVisible({ timeout: 30_000 });
    if (await error.isVisible()) {
      throw new Error(`Terra sign failed: ${await error.innerText()}`);
    }
    await expect(accepted).toBeVisible();

    const statusRes = await fetch(
      `${API_BASE}/api/v1/signatures/status?property=cl8y.com&network=TERRA_CLASSIC&account=${TERRA_TEST_ADDRESS}`,
    );
    expect(statusRes.ok).toBe(true);
    const status = (await statusRes.json()) as { signed_latest: boolean };
    expect(status.signed_latest).toBe(true);
  });
});
