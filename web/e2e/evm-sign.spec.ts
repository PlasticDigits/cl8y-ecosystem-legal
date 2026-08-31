import { test, expect, type Page } from "@playwright/test";
import {
  evmRequestCount,
  installBinanceChainWallet,
  installEip6963Wallet,
  installEvmWallet,
  installEvmWalletConnectMock,
  installLateEvmWallet,
  installTwoEip6963Wallets,
  OTHER_EVM_ACCOUNT,
  testEvmAccount,
} from "./helpers/evm-wallet";
import { acceptViaConsent, consentAndEnableSign } from "./helpers/sign-flow";

const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? "http://127.0.0.1:8080";

async function expectSignedLatest(account = testEvmAccount.address.toLowerCase()) {
  const statusRes = await fetch(
    `${API_BASE}/api/v1/signatures/status?property=cl8y.com&network=EVM&account=${account}`,
  );
  expect(statusRes.ok).toBe(true);
  const status = (await statusRes.json()) as { signed_latest: boolean };
  expect(status.signed_latest).toBe(true);
}

async function expectUnsigned(account: string) {
  const statusRes = await fetch(
    `${API_BASE}/api/v1/signatures/status?property=cl8y.com&network=EVM&account=${account}`,
  );
  expect(statusRes.ok).toBe(true);
  const status = (await statusRes.json()) as { signed_latest: boolean };
  expect(status.signed_latest).toBe(false);
}

async function captureClipboard(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { __cl8yCopied?: string }).__cl8yCopied = text;
        },
      },
    });
  });
}

test.describe("EVM full-stack sign", () => {
  test("connects mock wallet and accepts terms for property", async ({ page }) => {
    await installEvmWallet(page);
    await page.goto("/sign/evm?property=cl8y.com");

    await expect(page.getByText("Property: cl8y.com")).toBeVisible();
    await expect(page.getByRole("link", { name: /Open in Keplr/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Open in MetaMask/i })).toHaveCount(0);
    await acceptViaConsent(page);
    await expectSignedLatest();
  });

  test("without a provider shows Open in MetaMask instead of a dead-end error", async ({ page }) => {
    await page.goto("/sign/evm?property=cl8y.com&redirect_uri=https://cl8y.com");

    await expect(page.getByText("Property: cl8y.com")).toBeVisible();
    await expect(page.getByText(/open this page in the MetaMask or Binance Web3 app/i)).toBeVisible();
    await expect(page.getByText(/EIP-191|EIP-6963/i)).toHaveCount(0);
    await expect(page.getByText(/No EVM wallet found/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Open in Keplr/i })).toHaveCount(0);

    const openMm = page.getByRole("link", { name: /Open in MetaMask/i });
    const openBn = page.getByRole("link", { name: /Open in Binance Web3/i });
    await expect(openMm).toBeVisible();
    await expect(openBn).toBeVisible();
    const mmHref = await openMm.getAttribute("href");
    expect(mmHref).toBeTruthy();
    expect(mmHref).toContain("https://link.metamask.io/dapp/");
    expect(mmHref).toContain("/sign/evm");
    expect(mmHref).toContain("property=cl8y.com");
    expect(mmHref).toContain("redirect_uri=");
    expect(mmHref).not.toBe("https://cl8y.com");

    const bnHref = await openBn.getAttribute("href");
    expect(bnHref).toBeTruthy();
    const bnUrl = new URL(bnHref!);
    expect(bnUrl.origin).toBe("https://app.binance.com");
    expect(bnUrl.pathname).toBe("/cedefi/dapp");
    const target = bnUrl.searchParams.get("url");
    expect(target).toContain("/sign/evm");
    expect(target).toContain("property=cl8y.com");
    expect(target).not.toBe("https://cl8y.com");

    await expect(page.getByRole("button", { name: /Copy link/i })).toBeVisible();

    const signBtn = await consentAndEnableSign(page);
    await signBtn.click();

    await expect(page.getByText(/No EVM wallet found/i)).toHaveCount(0);
    await expect(page.getByText(/No wallet in this browser/i)).toBeVisible();
    await expect(openMm).toBeVisible();
    await expect(page.getByRole("heading", { name: "Accepted" })).toHaveCount(0);
    await expect(page.getByLabel(/I have read and agree to the Terms & Conditions/i)).toBeChecked();
    await expect(page.getByRole("button", { name: /Connect & sign/i })).toBeEnabled();
  });

  test("deeplink account= is preserved on Open in MetaMask, Binance, and Copy link", async ({
    page,
  }) => {
    const account = testEvmAccount.address.toLowerCase();
    await captureClipboard(page);
    await page.goto(
      `/sign/evm?property=cl8y.com&redirect_uri=https://cl8y.com&account=${account}`,
    );

    await expect(page.getByText(new RegExp(`Sign as ${account}`, "i"))).toBeVisible();

    const openMm = page.getByRole("link", { name: /Open in MetaMask/i });
    const openBn = page.getByRole("link", { name: /Open in Binance Web3/i });
    await expect(openMm).toBeVisible();
    const mmHref = await openMm.getAttribute("href");
    expect(mmHref).toContain("https://link.metamask.io/dapp/");
    expect(mmHref).toContain(`account=${account}`);
    expect(mmHref).not.toMatch(/^javascript:/i);
    expect(mmHref).not.toBe(account);
    expect(mmHref).not.toBe("https://cl8y.com");

    const bnHref = await openBn.getAttribute("href");
    const bnUrl = new URL(bnHref!);
    const target = bnUrl.searchParams.get("url");
    expect(target).toContain(`account=${account}`);
    expect(target).toContain("/sign/evm");
    expect(target).not.toBe("https://cl8y.com");
    expect(bnHref).not.toMatch(/^javascript:/i);

    await page.getByRole("button", { name: /Copy link/i }).click();
    const copied = await page.evaluate(
      () => (window as unknown as { __cl8yCopied?: string }).__cl8yCopied,
    );
    expect(copied).toContain("/sign/evm");
    expect(copied).toContain(`account=${account}`);
    expect(copied).toContain("property=cl8y.com");
    expect(copied).not.toBe("https://cl8y.com");
    expect(copied).not.toMatch(/^javascript:/i);
  });

  test("EIP-6963 mock signs without window.ethereum", async ({ page }) => {
    await installEip6963Wallet(page);
    await page.goto("/sign/evm?property=cl8y.com");

    await expect(page.getByRole("link", { name: /Open in MetaMask/i })).toHaveCount(0);
    await expect(page.getByText("Mock MetaMask")).toBeVisible();
    await acceptViaConsent(page);
    await expectSignedLatest();
  });

  test("window.BinanceChain only can sign", async ({ page }) => {
    await installBinanceChainWallet(page);
    await page.goto("/sign/evm?property=cl8y.com");

    await expect(page.getByText("Binance Web3", { exact: true })).toBeVisible();
    await acceptViaConsent(page);
    await expectSignedLatest();
  });

  test("late ethereum#initialized inject still signs", async ({ page }) => {
    await installLateEvmWallet(page);
    await page.goto("/sign/evm?property=cl8y.com");
    await acceptViaConsent(page);
    await expectSignedLatest();
  });

  test("multiple EIP-6963 wallets require an explicit pick", async ({ page }) => {
    await installTwoEip6963Wallets(page);
    await page.goto("/sign/evm?property=cl8y.com");

    await expect(page.getByText("MetaMask", { exact: true })).toBeVisible();
    await expect(page.getByText("Binance Web3", { exact: true })).toBeVisible();
    await expect(page.locator("#evm-wallet-eip6963-io-metamask")).not.toBeChecked();
    await expect(page.locator("#evm-wallet-eip6963-com-binance-wallet")).not.toBeChecked();

    const signBtn = await consentAndEnableSign(page);
    await signBtn.click();
    await expect(page.getByText(/Pick a wallet above/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Accepted" })).toHaveCount(0);
    await expect(signBtn).toBeEnabled();

    await page.locator("#evm-wallet-eip6963-io-metamask").check();
    await signBtn.click();
    await expect(page.getByRole("heading", { name: "Accepted" })).toBeVisible();
    await expectSignedLatest();
  });

  test("matching account= plus sibling EIP-6963 does not sign the hidden wallet", async ({
    page,
  }) => {
    const claimed = testEvmAccount.address;
    await installTwoEip6963Wallets(page, { otherAddress: OTHER_EVM_ACCOUNT });
    await page.goto(`/sign/evm?property=cl8y.com&account=${claimed}`);

    await expect(page.getByText(new RegExp(`Sign as ${claimed}`, "i"))).toBeVisible();
    const signBtn = await consentAndEnableSign(page);

    await page.locator("#evm-wallet-eip6963-com-binance-wallet").check();
    await signBtn.click();
    await expect(page.getByText(/different wallet/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Accepted" })).toHaveCount(0);
    await expect(signBtn).toBeEnabled();
    await expectUnsigned(OTHER_EVM_ACCOUNT);

    await page.locator("#evm-wallet-eip6963-io-metamask").check();
    await signBtn.click();
    await expect(page.getByRole("heading", { name: "Accepted" })).toBeVisible();
    await expectSignedLatest(claimed.toLowerCase());
    await expectUnsigned(OTHER_EVM_ACCOUNT);
  });

  test("WalletConnect mock signs without window.ethereum", async ({ page }) => {
    await installEvmWalletConnectMock(page);
    await page.goto("/sign/evm?property=cl8y.com");

    await expect(page.getByRole("link", { name: /Open in MetaMask/i })).toBeVisible();
    await page.locator("#evm-wallet-walletconnect").check();
    await acceptViaConsent(page);
    await expectSignedLatest();
  });

  test("matching lowercase account= records that injected account", async ({ page }) => {
    await installEvmWallet(page);
    const account = testEvmAccount.address.toLowerCase();
    await page.goto(`/sign/evm?property=cl8y.com&account=${account}`);

    await expect(page.getByText(new RegExp(`Sign as ${account}`, "i"))).toBeVisible();
    await acceptViaConsent(page);
    await expectSignedLatest(account);
    await expectUnsigned(OTHER_EVM_ACCOUNT);
  });

  test("matching EIP-55 account= still accepts the connected wallet", async ({ page }) => {
    await installEvmWallet(page);
    const checksum = testEvmAccount.address;
    await page.goto(`/sign/evm?property=cl8y.com&account=${checksum}`);

    await expect(page.getByText(new RegExp(`Sign as ${checksum}`, "i"))).toBeVisible();
    await acceptViaConsent(page);
    await expectSignedLatest(checksum.toLowerCase());
  });

  test("already-signed matching account= skips personal_sign", async ({ page }) => {
    await installEvmWallet(page);
    const account = testEvmAccount.address;
    await page.goto(`/sign/evm?property=cl8y.com&account=${account}`);
    await acceptViaConsent(page);
    await expectSignedLatest(account.toLowerCase());

    await page.goto(`/sign/evm?property=cl8y.com&account=${account}`);
    await expect(page.getByText(new RegExp(`Sign as ${account}`, "i"))).toBeVisible();
    await acceptViaConsent(page);
    expect(await evmRequestCount(page)).toBe(1);
  });

  test("WalletConnect mock rejects a different claimed account", async ({ page }) => {
    await installEvmWalletConnectMock(page);
    await page.goto(`/sign/evm?property=cl8y.com&account=${OTHER_EVM_ACCOUNT}`);

    await expect(page.getByText(new RegExp(`Sign as ${OTHER_EVM_ACCOUNT}`, "i"))).toBeVisible();
    await page.locator("#evm-wallet-walletconnect").check();
    const signBtn = await consentAndEnableSign(page);
    await signBtn.click();

    await expect(page.getByText(/different wallet/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Accepted" })).toHaveCount(0);
    await expect(signBtn).toBeEnabled();
    await expectUnsigned(OTHER_EVM_ACCOUNT);
  });

  test("rejects a signature when the connected wallet is not the claimed account", async ({
    page,
  }) => {
    await installEvmWallet(page);
    await page.goto(`/sign/evm?property=cl8y.com&account=${OTHER_EVM_ACCOUNT}`);

    await expect(page.getByText(new RegExp(`Sign as ${OTHER_EVM_ACCOUNT}`, "i"))).toBeVisible();
    const signBtn = await consentAndEnableSign(page);
    await signBtn.click();
    await expect(page.getByText(/different wallet/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Accepted" })).toHaveCount(0);

    await expectUnsigned(OTHER_EVM_ACCOUNT);
  });

  test("hostile account= is a text node and fail-closed", async ({ page }) => {
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    await installEvmWallet(page);
    await page.goto("/sign/evm?property=cl8y.com&account=javascript:alert(1)");

    const signAs = page.locator(".evm-claimed-account");
    await expect(signAs).toHaveText("Sign as javascript:alert(1)");
    expect(await signAs.evaluate((el) => el.childNodes[0]?.nodeType === Node.TEXT_NODE)).toBe(true);

    const hrefs = await page.locator("a[href]").evaluateAll((anchors) =>
      anchors.map((a) => a.getAttribute("href") ?? ""),
    );
    expect(hrefs.every((h) => !/^javascript:/i.test(h) && !/^data:/i.test(h))).toBe(true);

    const signBtn = await consentAndEnableSign(page);
    await signBtn.click();
    await expect(page.getByText(/different wallet/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Accepted" })).toHaveCount(0);
    expect(dialogs).toEqual([]);
  });

  test("terra1 account= on /sign/evm is invalid and does not submit", async ({ page }) => {
    await installEvmWallet(page);
    await page.goto(
      "/sign/evm?property=cl8y.com&account=terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt",
    );

    await expect(
      page.getByText("Sign as terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt"),
    ).toBeVisible();
    const signBtn = await consentAndEnableSign(page);
    await signBtn.click();
    await expect(page.getByText(/different wallet/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Accepted" })).toHaveCount(0);
  });

  test("does not call wallet request before consent", async ({ page }) => {
    await installEvmWallet(page);
    await page.goto("/sign/evm?property=cl8y.com");
    await expect(page.getByText("Property: cl8y.com")).toBeVisible();
    await expect(page.locator(".terms-body")).toContainText(/CL8Y ECOSYSTEM TERMS AND CONDITIONS/i, {
      timeout: 30_000,
    });
    expect(await evmRequestCount(page)).toBe(0);
  });
});
