import { test, expect, type Page } from "@playwright/test";
import {
  installSolanaWallet,
  solanaConnectCount,
  solanaLastMessage,
  solanaSignCount,
  TEST_SOLANA_A,
  TEST_SOLANA_B,
} from "./helpers/solana-wallet";

/**
 * Solana integrator `account=` bind (GitLab #17).
 *
 * Matching path asserts bind + `signMessage` with the bound id. It does **not**
 * require `signed_latest` / Accepted: portal UTF-8 `signMessage` ≠ API
 * `solana offchain` envelope (gap P0). Mismatch fails before submit.
 */
const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? "http://127.0.0.1:8080";

async function walletPosts(page: Page): Promise<unknown[]> {
  const bodies: unknown[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/api/v1/signatures/wallet")) {
      try {
        bodies.push(req.postDataJSON());
      } catch {
        bodies.push(req.postData());
      }
    }
  });
  return bodies;
}

test.describe("Solana account= bind", () => {
  test("no claim: Connect & sign uses mock pubkey in the canonical message", async ({ page }) => {
    const posts = await walletPosts(page);
    await installSolanaWallet(page);
    await page.goto("/sign/solana?property=cl8y.com");

    await expect(page.getByText("Property: cl8y.com")).toBeVisible();
    await expect(page.getByText(/Sign as /i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Open in MetaMask/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Open in Keplr/i })).toHaveCount(0);
    await expect(page.getByText(/I have read and agree/i)).toHaveCount(0);

    await page.getByRole("button", { name: /Connect & sign/i }).click();
    await expect.poll(() => solanaSignCount(page)).toBe(1);
    const msg = await solanaLastMessage(page);
    expect(msg).toContain(`Account: ${TEST_SOLANA_A}`);
    expect(msg).toContain("Network: SOLANA");
    expect(msg).toContain("Content-SHA256:");
    await expect(page.getByText(/different wallet/i)).toHaveCount(0);
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toMatchObject({
      network: "SOLANA",
      account_id: TEST_SOLANA_A,
      property: "cl8y.com",
    });
    await expect(page.getByRole("heading", { name: "Accepted" })).toHaveCount(0);
  });

  test("matching account= shows Sign as and signs that pubkey", async ({ page }) => {
    const posts = await walletPosts(page);
    await installSolanaWallet(page);
    await page.goto(`/sign/solana?property=cl8y.com&account=${TEST_SOLANA_A}`);

    const signAs = page.locator(".solana-claimed-account");
    await expect(signAs).toHaveText(`Sign as ${TEST_SOLANA_A}`);
    expect(await signAs.evaluate((el) => el.childNodes[0]?.nodeType === Node.TEXT_NODE)).toBe(true);

    await page.getByRole("button", { name: /Connect & sign/i }).click();
    await expect.poll(() => solanaSignCount(page)).toBe(1);
    expect(await solanaLastMessage(page)).toContain(`Account: ${TEST_SOLANA_A}`);
    await expect(page.getByText(/different wallet/i)).toHaveCount(0);
    await expect.poll(() => posts.length).toBe(1);
    expect((posts[0] as { account_id: string }).account_id).toBe(TEST_SOLANA_A);
    await expect(page.getByRole("heading", { name: "Accepted" })).toHaveCount(0);
  });

  test("mismatch: different connected pubkey does not submit", async ({ page }) => {
    const posts = await walletPosts(page);
    await installSolanaWallet(page, { pubkey: TEST_SOLANA_B });
    await page.goto(`/sign/solana?property=cl8y.com&account=${TEST_SOLANA_A}`);

    await expect(page.getByText(`Sign as ${TEST_SOLANA_A}`)).toBeVisible();
    const signBtn = page.getByRole("button", { name: /Connect & sign/i });
    await signBtn.click();

    await expect(page.getByText(/different wallet/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Accepted" })).toHaveCount(0);
    await expect(signBtn).toBeEnabled();
    expect(await solanaSignCount(page)).toBe(0);
    expect(posts).toEqual([]);

    const statusRes = await fetch(
      `${API_BASE}/api/v1/signatures/status?property=cl8y.com&network=SOLANA&account=${TEST_SOLANA_A}`,
    );
    expect(statusRes.ok).toBe(true);
    const status = (await statusRes.json()) as { signed_latest: boolean };
    expect(status.signed_latest).toBe(false);
  });

  test("already-signed matching account= skips signMessage", async ({ page }) => {
    await page.route("**/api/v1/signatures/status?**", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("network") === "SOLANA") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            property: "cl8y.com",
            latest_version: "Draft",
            signed_latest: true,
            signed_version: "Draft",
            signed_at: "2026-08-31T00:00:00Z",
          }),
        });
        return;
      }
      await route.continue();
    });
    await installSolanaWallet(page);
    await page.goto(`/sign/solana?property=cl8y.com&account=${TEST_SOLANA_A}`);
    await page.getByRole("button", { name: /Connect & sign/i }).click();
    await expect(page.getByRole("heading", { name: "Accepted" })).toBeVisible();
    expect(await solanaConnectCount(page)).toBe(1);
    expect(await solanaSignCount(page)).toBe(0);
  });

  test("missing window.solana re-enables Connect & sign", async ({ page }) => {
    await page.goto("/sign/solana?property=cl8y.com");
    const signBtn = page.getByRole("button", { name: /Connect & sign/i });
    await signBtn.click();
    await expect(page.getByText(/No Solana wallet found/i)).toBeVisible();
    await expect(signBtn).toBeEnabled();
    await expect(page.getByRole("heading", { name: "Accepted" })).toHaveCount(0);
  });

  test("hostile account= is a text node and fail-closed", async ({ page }) => {
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    const posts = await walletPosts(page);
    await installSolanaWallet(page);
    await page.goto("/sign/solana?property=cl8y.com&account=javascript:alert(1)");

    const signAs = page.locator(".solana-claimed-account");
    await expect(signAs).toHaveText("Sign as javascript:alert(1)");
    expect(await signAs.evaluate((el) => el.childNodes[0]?.nodeType === Node.TEXT_NODE)).toBe(true);

    const hrefs = await page.locator("a[href]").evaluateAll((anchors) =>
      anchors.map((a) => a.getAttribute("href") ?? ""),
    );
    expect(hrefs.every((h) => !/^javascript:/i.test(h) && !/^data:/i.test(h))).toBe(true);

    const signBtn = page.getByRole("button", { name: /Connect & sign/i });
    await signBtn.click();
    await expect(page.getByText(/different wallet/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Accepted" })).toHaveCount(0);
    await expect(signBtn).toBeEnabled();
    expect(await solanaSignCount(page)).toBe(0);
    expect(posts).toEqual([]);
    expect(dialogs).toEqual([]);
  });

  test("terra1 / 0x account= is invalid and does not submit", async ({ page }) => {
    const posts = await walletPosts(page);
    await installSolanaWallet(page);
    await page.goto(
      "/sign/solana?property=cl8y.com&account=terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt",
    );
    await expect(
      page.getByText("Sign as terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt"),
    ).toBeVisible();
    await page.getByRole("button", { name: /Connect & sign/i }).click();
    await expect(page.getByText(/different wallet/i)).toBeVisible();
    expect(posts).toEqual([]);
    expect(await solanaSignCount(page)).toBe(0);

    await page.goto(
      "/sign/solana?property=cl8y.com&account=0x2222222222222222222222222222222222222222",
    );
    await installSolanaWallet(page);
    await page.reload();
    await page.getByRole("button", { name: /Connect & sign/i }).click();
    await expect(page.getByText(/different wallet/i)).toBeVisible();
    expect(await solanaSignCount(page)).toBe(0);
  });

  test("account= does not replace allowlisted redirect_uri", async ({ page }) => {
    await installSolanaWallet(page);
    await page.goto(
      `/sign/solana?property=cl8y.com&account=${TEST_SOLANA_A}&redirect_uri=https://cl8y.com&app_name=Demo`,
    );
    await expect(page.getByText("App: Demo")).toBeVisible();
    await expect(page.getByText(`Sign as ${TEST_SOLANA_A}`)).toBeVisible();
    await page.route("**/api/v1/signatures/status?**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          property: "cl8y.com",
          latest_version: "Draft",
          signed_latest: true,
          signed_version: "Draft",
          signed_at: "2026-08-31T00:00:00Z",
        }),
      });
    });
    await page.getByRole("button", { name: /Connect & sign/i }).click();
    await expect(page.getByRole("heading", { name: "Accepted" })).toBeVisible();
    const cont = page.getByRole("link", { name: /Continue/i });
    await expect(cont).toBeVisible();
    expect(await cont.getAttribute("href")).toBe("https://cl8y.com/");
  });
});
