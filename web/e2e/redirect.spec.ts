import { test, expect } from "@playwright/test";
import { installEvmWallet } from "./helpers/evm-wallet";
import { acceptViaConsent } from "./helpers/sign-flow";

/**
 * Portal redirect_uri allowlist (issue #3 / #4).
 * Dev server allowlist: `https://cl8y.com` + localhost via `VITE_ALLOW_LOCALHOST_REDIRECT`.
 */
test.describe("redirect_uri allowlist after accept", () => {
  test("allowlisted localhost redirect_uri navigates after accept", async ({ page }) => {
    await installEvmWallet(page);
    const target = "http://127.0.0.1:5173/?from=sign-e2e";
    await page.goto(`/sign/evm?property=cl8y.com&redirect_uri=${encodeURIComponent(target)}`);

    await expect(page.getByText("Property: cl8y.com")).toBeVisible();
    await acceptViaConsent(page);

    const continueLink = page.getByRole("link", { name: "Continue" });
    await expect(continueLink).toBeVisible();
    await expect(continueLink).toHaveAttribute("href", target);

    // renderSuccess auto-navigates after 2s when URI is safe.
    await page.waitForURL((url) => url.searchParams.get("from") === "sign-e2e", {
      timeout: 5_000,
    });
    expect(page.url()).toContain("from=sign-e2e");
  });

  test("evil redirect_uri shows success without Continue or navigation", async ({ page }) => {
    await installEvmWallet(page);
    const evil = "https://evil.example/phish";
    await page.goto(`/sign/evm?property=cl8y.com&redirect_uri=${encodeURIComponent(evil)}`);

    await expect(page.getByText("Property: cl8y.com")).toBeVisible();
    await acceptViaConsent(page);

    await expect(page.getByRole("link", { name: "Continue" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Accepted" })).toBeVisible();

    // Query may still mention evil.example; host/path must stay on the portal.
    const stayedOnPortal = () => {
      const u = new URL(page.url());
      return u.hostname === "127.0.0.1" && u.pathname.includes("/sign/evm");
    };
    expect(stayedOnPortal()).toBe(true);

    // Past the 2s auto-redirect window — must not leave the portal origin/path.
    await expect.poll(stayedOnPortal, { timeout: 3_000 }).toBe(true);
    await expect(page.getByRole("heading", { name: "Accepted" })).toBeVisible();
  });
});
