import { expect, type Page } from "@playwright/test";

/** Scroll the terms body to the bottom so the consent checkbox can unlock. */
export async function scrollTermsToBottom(page: Page) {
  const body = page.locator(".terms-body");
  await expect(body).toBeVisible();
  await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect(page.getByLabel(/I have read and agree to the Terms & Conditions/i)).toBeEnabled({
    timeout: 10_000,
  });
}

/** Wait for terms disclosure and enable Connect & sign via consent checkbox. */
export async function consentAndEnableSign(page: Page) {
  await expect(page.locator(".terms-body")).toContainText(/CL8Y ECOSYSTEM TERMS AND CONDITIONS/i, {
    timeout: 30_000,
  });
  const signBtn = page.getByRole("button", { name: /Connect & sign/i });
  await expect(signBtn).toBeDisabled();
  await scrollTermsToBottom(page);
  await page.getByLabel(/I have read and agree to the Terms & Conditions/i).check();
  await expect(signBtn).toBeEnabled();
  return signBtn;
}

/** Complete mock-wallet accept flow after wallet injection + navigation. */
export async function acceptViaConsent(page: Page) {
  const signBtn = await consentAndEnableSign(page);
  await signBtn.click();
  const accepted = page.getByRole("heading", { name: "Accepted" });
  const error = page.locator(".error");
  await expect(accepted.or(error)).toBeVisible({ timeout: 30_000 });
  if (await error.isVisible()) {
    throw new Error(`Sign failed: ${await error.innerText()}`);
  }
  await expect(accepted).toBeVisible();
}
