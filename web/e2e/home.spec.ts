import { test, expect } from "@playwright/test";

test.describe("home page", () => {
  test("shows integrator instructions without property", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "CL8Y Legal" })).toBeVisible();
    await expect(page.getByText(/Integrators must pass a property/i)).toBeVisible();
  });

  test("shows latest terms and sign links with property", async ({ page }) => {
    await page.goto("/?property=cl8y.com");
    await expect(page.getByText("Property: cl8y.com")).toBeVisible();
    await expect(page.getByText(/Latest version:/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "EVM wallet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Solana" })).toBeVisible();
  });
});
