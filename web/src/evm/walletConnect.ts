/**
 * In-page WalletConnect v2 `personal_sign` for EVM T&C (GitLab #15).
 *
 * Signs the canonical legal UTF-8 message (EIP-191). Do not use `eth_sign` of a
 * raw hash or switch to EIP-712 / SIWE without a versioned API change.
 * Chain id is taken from the session (do not `wallet_switchEthereumChain` to
 * Ethereum mainnet — `personal_sign` is chain-agnostic).
 *
 * WalletConnect Cloud project id must be Legal-owned (`VITE_WC_PROJECT_ID`).
 * Hide this path when the id is unset (same as Galaxy Station). Do not copy
 * DEX / ustr-cmm Cloud ids into git.
 *
 * Pairing return URLs never encode query-supplied `redirect_uri`.
 */

import { toHex } from "viem";
import { assertEvmAccountContinuity, canonicalizeEvmAddress } from "./account";
import type { EvmWalletConnectPairingSheet } from "./walletConnectUi";
import { isEvmWalletConnectPairingUri } from "./walletConnectPairing";

export const EVM_WC_NOT_CONFIGURED = "WalletConnect is not configured on this portal.";
export const EVM_WC_CANCELLED = "WalletConnect cancelled.";
export const WALLETCONNECT_ID = "walletconnect";

export type EvmWcPrepareResult =
  | { alreadySigned: true; accountId: string }
  | { accountId: string; message: string };

export type EvmWcPrepare = (accountId: string) => Promise<EvmWcPrepareResult>;

export type EvmWcPairingCallbacks = {
  onDisplayUri: (uri: string) => boolean;
  signal?: AbortSignal;
};

export type EvmWcConnectAndSign = (
  prepare: EvmWcPrepare,
  pairing: EvmWcPairingCallbacks,
) => Promise<{ alreadySigned: true; accountId: string } | { accountId: string; signature: string }>;

declare global {
  interface Window {
    __CL8Y_EVM_WC_TEST__?: EvmWcConnectAndSign;
  }
}

export function legalWalletConnectProjectId(): string {
  const raw = import.meta.env.VITE_WC_PROJECT_ID;
  return typeof raw === "string" ? raw.trim() : "";
}

export function isEvmWalletConnectConfigured(): boolean {
  return legalWalletConnectProjectId().length > 0;
}

function e2eHook(): EvmWcConnectAndSign | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  if (!import.meta.env.DEV && import.meta.env.MODE !== "test") {
    return undefined;
  }
  return window.__CL8Y_EVM_WC_TEST__;
}

export function isEvmWalletConnectOffered(): boolean {
  return isEvmWalletConnectConfigured() || Boolean(e2eHook());
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error(EVM_WC_CANCELLED);
  }
}

function abortPromise(signal?: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal?.aborted) {
      reject(new Error(EVM_WC_CANCELLED));
      return;
    }
    signal?.addEventListener("abort", () => reject(new Error(EVM_WC_CANCELLED)), { once: true });
  });
}

export async function connectAndSignEvmWalletConnect(
  prepare: EvmWcPrepare,
  sheet: EvmWalletConnectPairingSheet,
  claimedAccount: string | null,
): Promise<{ alreadySigned: true; accountId: string } | { accountId: string; signature: string }> {
  const abort = new AbortController();
  sheet.onCancel(() => abort.abort());
  const pairing: EvmWcPairingCallbacks = {
    onDisplayUri: (uri) => sheet.open(uri),
    signal: abort.signal,
  };
  try {
    const hook = e2eHook();
    if (hook) {
      return await hook(async (accountId) => {
        const bound = assertEvmAccountContinuity(claimedAccount, accountId);
        const prepared = await prepare(bound);
        if ("alreadySigned" in prepared) {
          return { alreadySigned: true, accountId: bound };
        }
        return { accountId: bound, message: prepared.message };
      }, pairing);
    }
    if (!isEvmWalletConnectConfigured()) {
      throw new Error(EVM_WC_NOT_CONFIGURED);
    }
    return await signEvmWalletConnect(prepare, pairing, claimedAccount);
  } finally {
    sheet.close();
    sheet.onCancel(() => {});
  }
}

type SignClientLike = {
  connect: (params: unknown) => Promise<{ uri?: string; approval: () => Promise<WcSession> }>;
  request: (params: {
    topic: string;
    chainId: string;
    request: { method: string; params: unknown };
  }) => Promise<unknown>;
};

type WcSession = {
  topic: string;
  namespaces: Record<string, { accounts?: string[] }>;
};

/**
 * Optional eip155 namespaces only — do not require Ethereum mainnet.
 * Binance Web3 and other EVM wallets sign off-chain `personal_sign` on whatever
 * chain the session reports.
 */
const EVM_WC_CHAINS = [
  "eip155:1",
  "eip155:56",
  "eip155:137",
  "eip155:42161",
  "eip155:10",
  "eip155:8453",
];

async function signEvmWalletConnect(
  prepare: EvmWcPrepare,
  pairing: EvmWcPairingCallbacks,
  claimedAccount: string | null,
): Promise<{ alreadySigned: true; accountId: string } | { accountId: string; signature: string }> {
  const projectId = legalWalletConnectProjectId();
  const { default: SignClient } = (await import("@walletconnect/sign-client")) as {
    default: {
      init: (opts: {
        projectId: string;
        metadata: { name: string; description: string; url: string; icons: string[] };
      }) => Promise<SignClientLike>;
    };
  };

  const client = await SignClient.init({
    projectId,
    metadata: {
      name: "CL8Y Legal",
      description: "CL8Y Terms & Conditions",
      url: typeof window !== "undefined" ? window.location.origin : "https://terms.cl8y.com",
      icons: [],
    },
  });

  throwIfAborted(pairing.signal);
  const { uri, approval } = await client.connect({
    optionalNamespaces: {
      eip155: {
        methods: ["personal_sign"],
        chains: EVM_WC_CHAINS,
        events: ["accountsChanged", "chainChanged"],
      },
    },
  });

  if (!uri || !isEvmWalletConnectPairingUri(uri) || !pairing.onDisplayUri(uri)) {
    throw new Error(EVM_WC_CANCELLED);
  }

  const session = await Promise.race([approval(), abortPromise(pairing.signal)]);
  const { chainId, address } = sessionEip155Account(session);
  const bound = assertEvmAccountContinuity(claimedAccount, address);
  const prepared = await prepare(bound);
  if ("alreadySigned" in prepared) {
    return prepared;
  }

  const signature = (await client.request({
    topic: session.topic,
    chainId,
    request: {
      method: "personal_sign",
      params: [toHex(prepared.message), bound],
    },
  })) as string;

  if (typeof signature !== "string" || signature.length < 10) {
    throw new Error("WalletConnect did not return a signature.");
  }
  return { accountId: bound, signature };
}

function sessionEip155Account(session: WcSession): { chainId: string; address: string } {
  const accounts = session.namespaces.eip155?.accounts ?? [];
  const first = accounts[0];
  if (!first) {
    throw new Error("WalletConnect did not return an account.");
  }
  const parts = first.split(":");
  if (parts.length < 3 || parts[0] !== "eip155") {
    throw new Error("WalletConnect did not return an EVM account.");
  }
  const chainId = `${parts[0]}:${parts[1]}`;
  const address = canonicalizeEvmAddress(parts.slice(2).join(":"));
  if (!address) {
    throw new Error("WalletConnect did not return a valid address.");
  }
  return { chainId, address };
}
