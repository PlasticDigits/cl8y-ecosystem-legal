/**
 * Injected Terra Classic providers (ustr-cmm globals).
 *
 * Detect the same windows ustr-cmm uses and call that wallet's Keplr-compatible
 * `signArbitrary`. Missing Keplr is not a hard requirement when Station / Leap /
 * Cosmostation (or Galaxy Station extension) is injected.
 */

import { TERRA_CHAIN_ID, canonicalizeTerraAddress } from "./chain";
import type { TerraWalletId } from "./matrix";

export interface KeplrCompatProvider {
  enable: (chainId: string | string[]) => Promise<void>;
  getKey: (chainId: string) => Promise<{ bech32Address: string }>;
  signArbitrary: (
    chainId: string,
    signerAddress: string,
    data: string | Uint8Array,
  ) => Promise<{
    signature: string;
    pub_key: { type: string; value: string };
  }>;
  experimentalSuggestChain?: (info: unknown) => Promise<void>;
}

export interface TerraArbitraryResult {
  accountId: string;
  signature: string;
  pubkey: string;
}

type StationWindow = { keplr?: KeplrCompatProvider };
type CosmostationWindow = { providers?: { keplr?: KeplrCompatProvider } };
type GalaxyWindow = { keplr?: KeplrCompatProvider };
type TrustWindow = { cosmos?: KeplrCompatProvider };

declare global {
  interface Window {
    station?: StationWindow;
    leap?: KeplrCompatProvider;
    cosmostation?: CosmostationWindow;
    galaxyStation?: GalaxyWindow;
    trustwallet?: TrustWindow;
  }
}

function isKeplrCompat(value: unknown): value is KeplrCompatProvider {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<KeplrCompatProvider>;
  return (
    typeof candidate.enable === "function" &&
    typeof candidate.getKey === "function" &&
    typeof candidate.signArbitrary === "function"
  );
}

export function getInjectedKeplrProvider(): KeplrCompatProvider | null {
  if (isKeplrCompat(window.keplr)) {
    return window.keplr;
  }
  if (isKeplrCompat(window.trustwallet?.cosmos)) {
    return window.trustwallet.cosmos;
  }
  return null;
}

export function getInjectedProvider(id: TerraWalletId): KeplrCompatProvider | null {
  switch (id) {
    case "station":
      return isKeplrCompat(window.station?.keplr) ? window.station.keplr : null;
    case "keplr":
      return getInjectedKeplrProvider();
    case "leap":
      return isKeplrCompat(window.leap) ? window.leap : null;
    case "cosmostation":
      return isKeplrCompat(window.cosmostation?.providers?.keplr)
        ? window.cosmostation.providers.keplr
        : null;
    case "galaxystation":
      return isKeplrCompat(window.galaxyStation?.keplr) ? window.galaxyStation.keplr : null;
    case "luncdash":
      return null;
  }
}

export function listInjectedWalletIds(): TerraWalletId[] {
  const ids: TerraWalletId[] = ["station", "keplr", "leap", "cosmostation", "galaxystation"];
  return ids.filter((id) => getInjectedProvider(id) !== null);
}

export function hasAnyInjectedTerraWallet(): boolean {
  return listInjectedWalletIds().length > 0;
}

/**
 * Suggest columbus-5 when the provider supports it. Failures are non-fatal —
 * the subsequent enable / signArbitrary call surfaces the real error.
 */
export async function suggestTerraClassic(provider: KeplrCompatProvider): Promise<void> {
  if (typeof provider.experimentalSuggestChain !== "function") {
    return;
  }
  try {
    await provider.experimentalSuggestChain({
      chainId: TERRA_CHAIN_ID,
      chainName: "Terra Classic",
      rpc: "https://terra-classic-rpc.publicnode.com",
      rest: "https://terra-classic-lcd.publicnode.com",
      bip44: { coinType: 330 },
      bech32Config: {
        bech32PrefixAccAddr: "terra",
        bech32PrefixAccPub: "terrapub",
        bech32PrefixValAddr: "terravaloper",
        bech32PrefixValPub: "terravaloperpub",
        bech32PrefixConsAddr: "terravalcons",
        bech32PrefixConsPub: "terravalconspub",
      },
      currencies: [
        { coinDenom: "LUNC", coinMinimalDenom: "uluna", coinDecimals: 6 },
        { coinDenom: "USTC", coinMinimalDenom: "uusd", coinDecimals: 6 },
      ],
      feeCurrencies: [
        {
          coinDenom: "LUNC",
          coinMinimalDenom: "uluna",
          coinDecimals: 6,
          gasPriceStep: { low: 28.325, average: 28.325, high: 50 },
        },
      ],
      stakeCurrency: { coinDenom: "LUNC", coinMinimalDenom: "uluna", coinDecimals: 6 },
    });
  } catch {
    /* non-fatal */
  }
}

export async function connectInjectedProvider(
  id: TerraWalletId,
): Promise<{ accountId: string; provider: KeplrCompatProvider }> {
  const provider = getInjectedProvider(id);
  if (!provider) {
    throw new Error(`${walletMissingCopy(id)} is not in this browser.`);
  }
  await suggestTerraClassic(provider);
  await provider.enable(TERRA_CHAIN_ID);
  const key = await provider.getKey(TERRA_CHAIN_ID);
  return { accountId: canonicalizeTerraAddress(key.bech32Address), provider };
}

export async function signInjectedArbitrary(
  provider: KeplrCompatProvider,
  accountId: string,
  message: string,
): Promise<TerraArbitraryResult> {
  const result = await provider.signArbitrary(TERRA_CHAIN_ID, accountId, message);
  return {
    accountId,
    signature: result.signature,
    pubkey: result.pub_key.value,
  };
}

export async function signWithInjectedProvider(
  id: TerraWalletId,
  message: string,
): Promise<TerraArbitraryResult> {
  const { accountId, provider } = await connectInjectedProvider(id);
  return signInjectedArbitrary(provider, accountId, message);
}

function walletMissingCopy(id: TerraWalletId): string {
  switch (id) {
    case "station":
      return "Terra Station";
    case "keplr":
      return "Keplr";
    case "leap":
      return "Leap";
    case "cosmostation":
      return "Cosmostation";
    case "galaxystation":
      return "Galaxy Station";
    case "luncdash":
      return "LUNC Dash";
  }
}
