import { MISSING_KEPLR_STATUS } from "../keplrMobile";
import { assertAccountContinuity } from "./chain";
import {
  connectInjectedProvider,
  getInjectedProvider,
  signInjectedArbitrary,
  type TerraArbitraryResult,
} from "./injected";
import { terraWalletById, type TerraWalletId } from "./matrix";
import { connectAndSignWalletConnect, isWalletConnectOffered } from "./walletConnect";
import type { WalletConnectPairingSheet } from "./walletConnectUi";

export const PICK_WALLET_STATUS = "Pick a wallet above, then try again.";

export type TerraPrepareResult =
  | { alreadySigned: true }
  | { message: string };

/**
 * Connect the chosen wallet, bind the claimed `terra1…` if present, then sign.
 * `prepare` builds the canonical legal message (or short-circuits when already signed).
 */
export async function signTerraClassicMessage(options: {
  walletId: TerraWalletId | null;
  claimedAccount: string | null;
  pairing: WalletConnectPairingSheet;
  focusKeplrFallback: () => void;
  prepare: (accountId: string) => Promise<TerraPrepareResult>;
}): Promise<TerraArbitraryResult | { alreadySigned: true; accountId: string }> {
  const { walletId, claimedAccount, pairing, focusKeplrFallback, prepare } = options;
  if (!walletId) {
    focusKeplrFallback();
    throw new Error(PICK_WALLET_STATUS);
  }

  const def = terraWalletById(walletId);

  if (getInjectedProvider(walletId)) {
    const { accountId, provider } = await connectInjectedProvider(walletId);
    const bound = assertAccountContinuity(claimedAccount, accountId);
    const prepared = await prepare(bound);
    if ("alreadySigned" in prepared) {
      return { alreadySigned: true, accountId: bound };
    }
    return signInjectedArbitrary(provider, bound, prepared.message);
  }

  if (def.kind === "walletconnect" && isWalletConnectOffered(walletId)) {
    return connectAndSignWalletConnect(
      walletId as Extract<TerraWalletId, "luncdash" | "galaxystation">,
      async (accountId) => {
        const bound = assertAccountContinuity(claimedAccount, accountId);
        const prepared = await prepare(bound);
        if ("alreadySigned" in prepared) {
          return { alreadySigned: true, accountId: bound };
        }
        return { accountId: bound, message: prepared.message };
      },
      pairing,
    );
  }

  focusKeplrFallback();
  throw new Error(MISSING_KEPLR_STATUS);
}
