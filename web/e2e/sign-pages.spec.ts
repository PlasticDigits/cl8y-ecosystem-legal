import { test, expect } from "@playwright/test";

test.describe("sign pages require property", () => {
  for (const path of ["/sign/evm", "/sign/solana", "/sign/terra-classic", "/sign/telegram"]) {
    test(`${path} shows error without property`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText(/Missing required query parameter/i)).toBeVisible();
    });
  }

  test("/sign/evm shows property when set", async ({ page }) => {
    await page.goto("/sign/evm?property=cl8y.com");
    await expect(page.getByText("Property: cl8y.com")).toBeVisible();
    await expect(page.getByRole("button", { name: /Connect & sign/i })).toBeVisible();
  });
});
