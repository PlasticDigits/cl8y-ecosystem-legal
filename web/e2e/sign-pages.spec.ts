import { test, expect } from "@playwright/test";
import { scrollTermsToBottom } from "./helpers/sign-flow";

async function expectTermsDisclosure(page: import("@playwright/test").Page) {
  await expect(page.getByRole("heading", { name: "Terms & Conditions" })).toBeVisible();
  const body = page.locator(".terms-body");
  await expect(body).toContainText(/CL8Y ECOSYSTEM TERMS AND CONDITIONS/i, { timeout: 30_000 });
  await expect(page.locator(".terms-meta")).toContainText(/Version/i);
  await expect(page.locator(".terms-meta")).toContainText(/Effective/i);
  const text = await body.innerText();
  expect(text.length).toBeGreaterThan(100);

  const btn = page.getByRole("button", { name: /Connect & sign/i });
  const consent = page.getByLabel(/I have read and agree to the Terms & Conditions/i);
  await expect(btn).toBeDisabled();
  await expect(consent).toBeDisabled();
  await expect(page.getByText(/Scroll to the bottom of the terms/i)).toBeVisible();
  await scrollTermsToBottom(page);
  await consent.check();
  await expect(btn).toBeEnabled();
}

test.describe("sign pages require property", () => {
  for (const path of ["/sign/evm", "/sign/solana", "/sign/terra-classic", "/sign/telegram"]) {
    test(`${path} shows error without property`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText(/Missing required query parameter/i)).toBeVisible();
    });
  }

  test("/sign/evm shows property, terms, and consent gate when set", async ({ page }) => {
    await page.goto("/sign/evm?property=cl8y.com");
    await expect(page.getByText("Property: cl8y.com")).toBeVisible();
    await expectTermsDisclosure(page);
    await expect(page.getByRole("link", { name: /Open in Keplr/i })).toHaveCount(0);
  });

  test("/sign/terra-classic shows property, terms, and consent gate when set", async ({ page }) => {
    await page.goto("/sign/terra-classic?property=cl8y.com");
    await expect(page.getByText("Property: cl8y.com")).toBeVisible();
    await expectTermsDisclosure(page);
  });

  test("/sign/solana shows property and sign button when set (terms disclosure postponed)", async ({
    page,
  }) => {
    await page.goto("/sign/solana?property=cl8y.com");
    await expect(page.getByText("Property: cl8y.com")).toBeVisible();
    await expect(page.getByRole("button", { name: /Connect & sign/i })).toBeVisible();
  });

  test("/sign/telegram shows channel property when set", async ({ page }) => {
    await page.goto("/sign/telegram?property=-1001234567890");
    await expect(
      page.getByText(/not configured|Channel property: -1001234567890|Property:/i),
    ).toBeVisible();
  });
});
