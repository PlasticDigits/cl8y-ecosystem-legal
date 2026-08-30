import { test, expect } from "@playwright/test";
import {
  evmRequestCount,
  injectEvmWalletNow,
  installBinanceChainWallet,
  installEip6963Wallet,
  installEvmSignerOnly,
  installEvmWallet,
  installEvmWalletConnectMock,
  installTwoEip6963Wallets,
  testEvmAccount,
} from "./helpers/evm-wallet";
import { acceptViaConsent, consentAndEnableSign } from "./helpers/sign-flow";

const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? "http://127.0.0.1:8080";

async function expectSignedLatest() {
  const account = testEvmAccount.address.toLowerCase();
  const statusRes = await fetch(
    `${API_BASE}/api/v1/signatures/status?property=cl8y.com&network=EVM&account=${account}`,
  );
  expect(statusRes.ok).toBe(true);
  const status = (await statusRes.json()) as { signed_latest: boolean };
  expect(status.signed_latest).toBe(true);
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
    await expect(signBtn).toBeEnabled();
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
    await installEvmSignerOnly(page);
    await page.goto("/sign/evm?property=cl8y.com");
    await expect(page.getByRole("link", { name: /Open in MetaMask/i })).toBeVisible();

    await injectEvmWalletNow(page);
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

  test("WalletConnect mock signs without window.ethereum", async ({ page }) => {
    await installEvmWalletConnectMock(page);
    await page.goto("/sign/evm?property=cl8y.com");

    await expect(page.getByRole("link", { name: /Open in MetaMask/i })).toBeVisible();
    await page.locator("#evm-wallet-walletconnect").check();
    await acceptViaConsent(page);
    await expectSignedLatest();
  });

  test("rejects a signature when the connected wallet is not the claimed account", async ({
    page,
  }) => {
    await installEvmWallet(page);
    await page.goto(
      "/sign/evm?property=cl8y.com&account=0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );

    await expect(page.getByText(/Sign as 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/i)).toBeVisible();
    const signBtn = await consentAndEnableSign(page);
    await signBtn.click();
    await expect(page.getByText(/different wallet/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Accepted" })).toHaveCount(0);

    const statusRes = await fetch(
      `${API_BASE}/api/v1/signatures/status?property=cl8y.com&network=EVM&account=0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
    );
    const status = (await statusRes.json()) as { signed_latest: boolean };
    expect(status.signed_latest).toBe(false);
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
