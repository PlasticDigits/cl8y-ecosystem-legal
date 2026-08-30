import { createWalletClient, custom, type Address } from "viem";
import { mainnet } from "viem/chains";
import { assertEvmAccountContinuity } from "./account";
import { MISSING_EVM_WALLET_STATUS, PICK_EVM_WALLET_STATUS } from "./deeplink";
import type { DiscoveredEvmProvider, Eip1193Provider } from "./provider";
import {
  WALLETCONNECT_ID,
  connectAndSignEvmWalletConnect,
  isEvmWalletConnectOffered,
} from "./walletConnect";
import type { EvmWalletConnectPairingSheet } from "./walletConnectUi";

export type EvmPrepareResult = { alreadySigned: true } | { message: string };

export type EvmSignResult =
  | { alreadySigned: true; accountId: string }
  | { accountId: string; signature: string };

/**
 * Connect the chosen injected provider or WalletConnect, bind `account=0x…` if
 * present, then EIP-191 `personal_sign` the canonical legal message.
 *
 * `chain: mainnet` is a viem default only — we never call `wallet_switchEthereumChain`.
 */
export async function signEvmMessage(options: {
  selectedId: string | null;
  providers: readonly DiscoveredEvmProvider[];
  claimedAccount: string | null;
  pairing: EvmWalletConnectPairingSheet;
  focusFallback: () => void;
  prepare: (accountId: string) => Promise<EvmPrepareResult>;
}): Promise<EvmSignResult> {
  const { selectedId, providers, claimedAccount, pairing, focusFallback, prepare } = options;

  if (selectedId === WALLETCONNECT_ID && isEvmWalletConnectOffered()) {
    return connectAndSignEvmWalletConnect(
      async (accountId) => {
        const prepared = await prepare(accountId);
        if ("alreadySigned" in prepared) {
          return { alreadySigned: true, accountId };
        }
        return { accountId, message: prepared.message };
      },
      pairing,
      claimedAccount,
    );
  }

  const provider = resolveInjectedProvider(selectedId, providers);
  if (!provider) {
    if (providers.length > 1) {
      throw new Error(PICK_EVM_WALLET_STATUS);
    }
    focusFallback();
    throw new Error(MISSING_EVM_WALLET_STATUS);
  }

  const address = await requestEvmAddress(provider);
  const bound = assertEvmAccountContinuity(claimedAccount, address);
  const prepared = await prepare(bound);
  if ("alreadySigned" in prepared) {
    return { alreadySigned: true, accountId: bound };
  }
  const signature = await personalSignEvm(provider, bound as Address, prepared.message);
  return { accountId: bound, signature };
}

function resolveInjectedProvider(
  selectedId: string | null,
  providers: readonly DiscoveredEvmProvider[],
): Eip1193Provider | null {
  if (selectedId) {
    return providers.find((p) => p.id === selectedId)?.provider ?? null;
  }
  if (providers.length === 1) {
    return providers[0]!.provider;
  }
  return null;
}

async function requestEvmAddress(provider: Eip1193Provider): Promise<string> {
  const client = createWalletClient({ chain: mainnet, transport: custom(provider) });
  const [address] = (await client.requestAddresses()) as Address[];
  if (!address) {
    throw new Error("Wallet did not return an account.");
  }
  return address;
}

async function personalSignEvm(
  provider: Eip1193Provider,
  account: Address,
  message: string,
): Promise<string> {
  const client = createWalletClient({ chain: mainnet, transport: custom(provider) });
  return client.signMessage({ account, message });
}
