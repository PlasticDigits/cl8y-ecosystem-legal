import type { Page } from "@playwright/test";

/**
 * Mock Phantom-style `window.solana` (GitLab #17).
 * Fixture pubkeys are 32-byte fills encoded with the portal's base58
 * (`web/src/base58.ts`) — no leading-zero quirk for these values.
 */
export const TEST_SOLANA_A = "29d2S7vB453rNYFdR5Ycwt7y9haRT5fwVwL9zTmBhfV2";
export const TEST_SOLANA_B = "3JF3sEqM796hk5WFqA6EtmEwJQ9quALszsfJyvXNQKy3";

declare global {
  interface Window {
    __cl8ySolanaSignCount?: number;
    __cl8ySolanaLastMessage?: string;
    __cl8ySolanaConnectCount?: number;
  }
}

export async function installSolanaWallet(
  page: Page,
  opts: { pubkey?: string } = {},
) {
  const pubkey = opts.pubkey ?? TEST_SOLANA_A;
  await page.addInitScript(({ pubkey: pk }) => {
    window.__cl8ySolanaSignCount = 0;
    window.__cl8ySolanaConnectCount = 0;
    window.__cl8ySolanaLastMessage = "";
    window.solana = {
      connect: async () => {
        window.__cl8ySolanaConnectCount = (window.__cl8ySolanaConnectCount ?? 0) + 1;
        return { publicKey: { toString: () => pk } };
      },
      signMessage: async (message: Uint8Array, _encoding: string) => {
        window.__cl8ySolanaSignCount = (window.__cl8ySolanaSignCount ?? 0) + 1;
        window.__cl8ySolanaLastMessage = new TextDecoder().decode(message);
        return { signature: new Uint8Array(64).fill(7) };
      },
    };
  }, { pubkey });
}

export async function solanaSignCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__cl8ySolanaSignCount ?? 0);
}

export async function solanaConnectCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__cl8ySolanaConnectCount ?? 0);
}

export async function solanaLastMessage(page: Page): Promise<string> {
  return page.evaluate(() => window.__cl8ySolanaLastMessage ?? "");
}
