import type { Page } from "@playwright/test";
import {
  signAdr036,
  TERRA_CHAIN_ID,
  TERRA_TEST_ADDRESS,
  TERRA_TEST_PUBKEY_B64,
} from "./keplr-wallet";

export { TERRA_CHAIN_ID, TERRA_TEST_ADDRESS, TERRA_TEST_PUBKEY_B64 };

async function exposeAdr036Signer(page: Page) {
  await page.exposeFunction(
    "__cl8yKeplrSignArbitrary",
    async (signerAddress: string, data: string) => {
      return {
        signature: signAdr036(signerAddress, data),
        pub_key: {
          type: "tendermint/PubKeySecp256k1",
          value: TERRA_TEST_PUBKEY_B64,
        },
      };
    },
  );
}

/** Inject Leap (no `window.keplr`) — GitLab #11 non-Keplr extension path. */
export async function installLeapWallet(page: Page) {
  await exposeAdr036Signer(page);
  await page.addInitScript(
    ({ address, chainId }) => {
      const provider = {
        enable: async (id: string) => {
          if (id !== chainId) throw new Error(`unexpected chain: ${id}`);
        },
        getKey: async (id: string) => {
          if (id !== chainId) throw new Error(`unexpected chain: ${id}`);
          return { bech32Address: address };
        },
        signArbitrary: async (
          id: string,
          signerAddress: string,
          data: string | Uint8Array,
        ) => {
          if (id !== chainId) throw new Error(`unexpected chain: ${id}`);
          const message = typeof data === "string" ? data : new TextDecoder().decode(data);
          return await (
            window as unknown as {
              __cl8yKeplrSignArbitrary: (
                signer: string,
                msg: string,
              ) => Promise<{
                signature: string;
                pub_key: { type: string; value: string };
              }>;
            }
          ).__cl8yKeplrSignArbitrary(signerAddress, message);
        },
      };
      (window as Window & { leap?: typeof provider }).leap = provider;
    },
    { address: TERRA_TEST_ADDRESS, chainId: TERRA_CHAIN_ID },
  );
}

/** In-page LUNC Dash WC mock (dev/e2e hook only). */
export async function installLuncDashWalletConnectMock(page: Page) {
  await exposeAdr036Signer(page);
  await page.addInitScript(
    ({ address }) => {
      window.__CL8Y_TERRA_WC_TEST__ = {
        luncdash: async (prepare, pairing) => {
          pairing.onDisplayUri(
            {
              name: "LUNC Dash",
              android: "",
              ios: "",
              isStation: true,
              isLuncDash: true,
            },
            "wc:e2e-luncdash@1?bridge=https://walletconnect.luncdash.com",
          );
          const prepared = await prepare(address);
          if ("alreadySigned" in prepared) {
            return prepared;
          }
          const signed = await (
            window as unknown as {
              __cl8yKeplrSignArbitrary: (
                signer: string,
                msg: string,
              ) => Promise<{
                signature: string;
                pub_key: { type: string; value: string };
              }>;
            }
          ).__cl8yKeplrSignArbitrary(prepared.accountId, prepared.message);
          return {
            accountId: prepared.accountId,
            signature: signed.signature,
            pubkey: signed.pub_key.value,
          };
        },
      };
    },
    { address: TERRA_TEST_ADDRESS },
  );
}
