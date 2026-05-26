import { test, expect } from "@playwright/test";
import { installEvmWallet, testEvmAccount } from "./helpers/evm-wallet";

const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? "http://127.0.0.1:8080";

test.describe("EVM full-stack sign", () => {
  test("connects mock wallet and accepts terms for property", async ({ page }) => {
    await installEvmWallet(page);
    await page.goto("/sign/evm?property=cl8y.com");

    await expect(page.getByText("Property: cl8y.com")).toBeVisible();
    await page.getByRole("button", { name: /Connect & sign/i }).click();

    await expect(page.getByRole("heading", { name: "Accepted" })).toBeVisible({ timeout: 30_000 });

    const account = testEvmAccount.address.toLowerCase();
    const statusRes = await fetch(
      `${API_BASE}/api/v1/signatures/status?property=cl8y.com&network=EVM&account=${account}`,
    );
    expect(statusRes.ok).toBe(true);
    const status = (await statusRes.json()) as { signed_latest: boolean };
    expect(status.signed_latest).toBe(true);
  });
});
