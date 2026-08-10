import { createPrivateKey, sign as cryptoSign } from "node:crypto";
import type { Page } from "@playwright/test";

/** Same key material as api Terra ADR-036 unit/integration tests (`[0x33; 32]`). */
export const TERRA_TEST_PRIVKEY_HEX =
  "3333333333333333333333333333333333333333333333333333333333333333";

export const TERRA_TEST_ADDRESS = "terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt";
export const TERRA_TEST_PUBKEY_B64 = "AjxyrdtP3wmvlPDJTX/pKjhqfnDPih2FkWOGuyU1x7Gx";
export const TERRA_CHAIN_ID = "columbus-5";

function escapeAminoJsonString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\u0008/g, "\\b")
    .replace(/\f/g, "\\f")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
}

/** CosmJS / Keplr ADR-036 amino sign-doc bytes. */
export function adr036SignDocBytes(signer: string, message: string): Buffer {
  const data = escapeAminoJsonString(Buffer.from(message, "utf8").toString("base64"));
  const signerEsc = escapeAminoJsonString(signer);
  const json = `{"account_number":"0","chain_id":"","fee":{"amount":[],"gas":"0"},"memo":"","msgs":[{"type":"sign/MsgSignData","value":{"data":"${data}","signer":"${signerEsc}"}}],"sequence":"0"}`;
  return Buffer.from(json, "utf8");
}

/** secp256k1 curve order — CosmJS/Keplr require low-S signatures. */
const SECP256K1_N = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141",
);
const SECP256K1_HALF_N = SECP256K1_N / 2n;

function normalizeLowS(sig: Buffer): Buffer {
  const r = sig.subarray(0, 32);
  let s = BigInt(`0x${sig.subarray(32).toString("hex")}`);
  if (s > SECP256K1_HALF_N) {
    s = SECP256K1_N - s;
  }
  const sHex = s.toString(16).padStart(64, "0");
  return Buffer.concat([r, Buffer.from(sHex, "hex")]);
}

export function signAdr036(signer: string, message: string): string {
  const doc = adr036SignDocBytes(signer, message);
  const priv = Buffer.from(TERRA_TEST_PRIVKEY_HEX, "hex");
  const der = Buffer.concat([
    Buffer.from("302e0201010420", "hex"),
    priv,
    Buffer.from("a00706052b8104000a", "hex"),
  ]);
  const key = createPrivateKey({ key: der, format: "der", type: "sec1" });
  const sig = cryptoSign("sha256", doc, { key, dsaEncoding: "ieee-p1363" });
  return normalizeLowS(sig).toString("base64");
}

/** Inject a Keplr-compatible stub that ADR-036-signs via Node crypto. */
export async function installKeplrWallet(page: Page) {
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

  await page.addInitScript(
    ({ address, chainId }) => {
      window.keplr = {
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
          const message =
            typeof data === "string" ? data : new TextDecoder().decode(data);
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
    },
    { address: TERRA_TEST_ADDRESS, chainId: TERRA_CHAIN_ID },
  );
}
