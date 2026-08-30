import type { Page } from "@playwright/test";
import { privateKeyToAccount } from "viem/accounts";

/** Same key material as api/tests/integration_test.rs (`[0x22; 32]`). */
export const TEST_PRIVATE_KEY =
  "0x2222222222222222222222222222222222222222222222222222222222222222" as const;

export const testEvmAccount = privateKeyToAccount(TEST_PRIVATE_KEY);

function hexToUtf8(hex: string): string {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

export async function exposeEvmSigner(page: Page) {
  await page.exposeFunction("__cl8yPersonalSign", async (messageHex: string) => {
    const message = hexToUtf8(messageHex);
    return testEvmAccount.signMessage({ message });
  });
}

/** Inject a MetaMask-compatible provider that signs via viem in Node. */
export async function installEvmWallet(page: Page) {
  await exposeEvmSigner(page);
  await page.addInitScript(
    ({ address }) => {
      window.__cl8yEvmRequestCount = 0;
      window.ethereum = {
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          window.__cl8yEvmRequestCount = (window.__cl8yEvmRequestCount ?? 0) + 1;
          if (method === "eth_requestAccounts") {
            return [address];
          }
          if (method === "personal_sign") {
            const [hexMessage] = params as [string, string];
            return await (
              window as unknown as { __cl8yPersonalSign: (hex: string) => Promise<string> }
            ).__cl8yPersonalSign(hexMessage);
          }
          throw new Error(`Unsupported method: ${method}`);
        },
      };
    },
    { address: testEvmAccount.address },
  );
}

/** EIP-6963 announce only — no `window.ethereum` (GitLab #15). */
export async function installEip6963Wallet(
  page: Page,
  opts: { name?: string; rdns?: string } = {},
) {
  await exposeEvmSigner(page);
  await page.addInitScript(
    ({ address, name, rdns }) => {
      window.__cl8yEvmRequestCount = 0;
      const provider = {
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          window.__cl8yEvmRequestCount = (window.__cl8yEvmRequestCount ?? 0) + 1;
          if (method === "eth_requestAccounts") {
            return [address];
          }
          if (method === "personal_sign") {
            const [hexMessage] = params as [string, string];
            return await (
              window as unknown as { __cl8yPersonalSign: (hex: string) => Promise<string> }
            ).__cl8yPersonalSign(hexMessage);
          }
          throw new Error(`Unsupported method: ${method}`);
        },
      };
      window.addEventListener("eip6963:requestProvider", () => {
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: {
              info: { uuid: "e2e-6963", name, rdns, icon: "" },
              provider,
            },
          }),
        );
      });
    },
    {
      address: testEvmAccount.address,
      name: opts.name ?? "Mock MetaMask",
      rdns: opts.rdns ?? "io.metamask",
    },
  );
}

/** Two EIP-6963 wallets; only MetaMask can sign (Binance throws). */
export async function installTwoEip6963Wallets(page: Page) {
  await exposeEvmSigner(page);
  await page.addInitScript(
    ({ address }) => {
      const make = (allowSign: boolean) => ({
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          if (method === "eth_requestAccounts") {
            return [address];
          }
          if (method === "personal_sign") {
            if (!allowSign) {
              throw new Error("wrong provider");
            }
            const [hexMessage] = params as [string, string];
            return await (
              window as unknown as { __cl8yPersonalSign: (hex: string) => Promise<string> }
            ).__cl8yPersonalSign(hexMessage);
          }
          throw new Error(`Unsupported method: ${method}`);
        },
      });
      const mm = make(true);
      const bn = make(false);
      window.addEventListener("eip6963:requestProvider", () => {
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: {
              info: { uuid: "e2e-mm", name: "MetaMask", rdns: "io.metamask", icon: "" },
              provider: mm,
            },
          }),
        );
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: {
              info: { uuid: "e2e-bn", name: "Binance Web3", rdns: "com.binance.wallet", icon: "" },
              provider: bn,
            },
          }),
        );
      });
    },
    { address: testEvmAccount.address },
  );
}

/** `window.BinanceChain` only (no `window.ethereum`). */
export async function installBinanceChainWallet(page: Page) {
  await exposeEvmSigner(page);
  await page.addInitScript(
    ({ address }) => {
      window.BinanceChain = {
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          if (method === "eth_requestAccounts") {
            return [address];
          }
          if (method === "personal_sign") {
            const [hexMessage] = params as [string, string];
            return await (
              window as unknown as { __cl8yPersonalSign: (hex: string) => Promise<string> }
            ).__cl8yPersonalSign(hexMessage);
          }
          throw new Error(`Unsupported method: ${method}`);
        },
      };
    },
    { address: testEvmAccount.address },
  );
}

/** In-page EVM WalletConnect mock (dev/e2e hook only). */
export async function installEvmWalletConnectMock(page: Page) {
  await exposeEvmSigner(page);
  await page.addInitScript(
    ({ address }) => {
      window.__CL8Y_EVM_WC_TEST__ = async (prepare, pairing) => {
        pairing.onDisplayUri("wc:e2e-evm@2?relay-protocol=irn");
        const prepared = await prepare(address);
        if ("alreadySigned" in prepared) {
          return prepared;
        }
        const bytes = new TextEncoder().encode(prepared.message);
        let hex = "0x";
        for (const b of bytes) {
          hex += b.toString(16).padStart(2, "0");
        }
        const signature = await (
          window as unknown as { __cl8yPersonalSign: (hex: string) => Promise<string> }
        ).__cl8yPersonalSign(hex);
        return { accountId: prepared.accountId, signature };
      };
    },
    { address: testEvmAccount.address },
  );
}

/** Inject `window.ethereum` shortly after load (late MetaMask iOS / WebView). */
export async function installLateEvmWallet(page: Page, delayMs = 250) {
  await exposeEvmSigner(page);
  await page.addInitScript(
    ({ address, delayMs: delay }) => {
      setTimeout(() => {
        window.ethereum = {
          request: async ({ method, params }: { method: string; params?: unknown[] }) => {
            if (method === "eth_requestAccounts") {
              return [address];
            }
            if (method === "personal_sign") {
              const [hexMessage] = params as [string, string];
              return await (
                window as unknown as { __cl8yPersonalSign: (hex: string) => Promise<string> }
              ).__cl8yPersonalSign(hexMessage);
            }
            throw new Error(`Unsupported method: ${method}`);
          },
        };
        window.dispatchEvent(new Event("ethereum#initialized"));
      }, delay);
    },
    { address: testEvmAccount.address, delayMs },
  );
}

export async function evmRequestCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__cl8yEvmRequestCount ?? 0);
}

declare global {
  interface Window {
    __cl8yEvmRequestCount?: number;
    __CL8Y_EVM_WC_TEST__?: unknown;
  }
}
