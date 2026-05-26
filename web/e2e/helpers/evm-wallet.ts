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

/** Inject a MetaMask-compatible provider that signs via viem in Node. */
export async function installEvmWallet(page: Page) {
  const account = testEvmAccount;

  await page.exposeFunction("__cl8yPersonalSign", async (messageHex: string) => {
    const message = hexToUtf8(messageHex);
    return account.signMessage({ message });
  });

  await page.addInitScript(({ address }) => {
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
  }, { address: account.address });
}
