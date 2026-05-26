import { test, expect } from "@playwright/test";

test("telegram sign shows not configured without bot name", async ({ page }) => {
  await page.goto("/sign/telegram?property=-1001234567890");
  await expect(page.getByText(/VITE_TELEGRAM_BOT_NAME is not configured/i)).toBeVisible();
});
