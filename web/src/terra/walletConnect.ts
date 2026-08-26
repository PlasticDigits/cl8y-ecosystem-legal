/**
 * In-page WalletConnect for Terra Classic T&C (GitLab #11).
 *
 * LUNC Dash: WC v1 + `signBytes` of the pre-serialized ADR-036 amino doc
 * (cosmes `signArbitrary` would sign the raw legal message and fail API verify).
 * Galaxy Station: WC v2 `keplr_signArbitrary` of the legal message (wallet wraps).
 *
 * WalletConnect Cloud project id must be Legal-owned (`VITE_WC_PROJECT_ID`).
 * Do not copy integrator WC ids into git. LUNC Dash v1 uses the public LUNC Dash
 * bridge and does not need a Cloud project id.
 *
 * Deep-link / pairing return URLs never encode query-supplied `redirect_uri`.
 */

import { adr036SignDocBytes, bytesToBase64 } from "./adr036";
import { canonicalizeTerraAddress } from "./chain";
import type { TerraArbitraryResult } from "./injected";
import type { TerraWalletId } from "./matrix";
import {
  GALAXY_STATION_PAIRING,
  LUNC_DASH_PAIRING,
  type WalletConnectPairingDetails,
} from "./walletConnectPairing";
import type { WalletConnectPairingSheet } from "./walletConnectUi";

export const LUNC_DASH_WC_BRIDGE = "https://walletconnect.luncdash.com";

export const WC_NOT_CONFIGURED =
  "Galaxy Station WalletConnect is not configured on this portal.";

export const WC_CANCELLED = "WalletConnect cancelled.";

export const WC_SESSION_ACCOUNT_MISMATCH =
  "The wallet session is for a different account.";

export type TerraWcPairingCallbacks = {
  onDisplayUri: (details: WalletConnectPairingDetails, uri: string) => boolean;
  signal?: AbortSignal;
};

export type TerraWcPrepareResult =
  | { alreadySigned: true; accountId: string }
  | { accountId: string; message: string };

export type TerraWcPrepare = (accountId: string) => Promise<TerraWcPrepareResult>;

export type TerraWcConnectAndSign = (
  prepare: TerraWcPrepare,
  pairing: TerraWcPairingCallbacks,
) => Promise<TerraArbitraryResult | { alreadySigned: true; accountId: string }>;

export type TerraWcTestHook = {
  luncdash?: TerraWcConnectAndSign;
  galaxystation?: TerraWcConnectAndSign;
};

declare global {
  interface Window {
    __CL8Y_TERRA_WC_TEST__?: TerraWcTestHook;
  }
}

export function legalWalletConnectProjectId(): string {
  const raw = import.meta.env.VITE_WC_PROJECT_ID;
  return typeof raw === "string" ? raw.trim() : "";
}

export function isGalaxyWalletConnectConfigured(): boolean {
  return legalWalletConnectProjectId().length > 0;
}

function e2eHook(): TerraWcTestHook | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  if (!import.meta.env.DEV && import.meta.env.MODE !== "test") {
    return undefined;
  }
  return window.__CL8Y_TERRA_WC_TEST__;
}

export function isWalletConnectOffered(id: TerraWalletId): boolean {
  if (id === "luncdash") {
    return true;
  }
  if (id === "galaxystation") {
    return isGalaxyWalletConnectConfigured() || Boolean(e2eHook()?.galaxystation);
  }
  return false;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error(WC_CANCELLED);
  }
}

export async function connectAndSignWalletConnect(
  id: Extract<TerraWalletId, "luncdash" | "galaxystation">,
  prepare: TerraWcPrepare,
  sheet: WalletConnectPairingSheet,
): Promise<TerraArbitraryResult | { alreadySigned: true; accountId: string }> {
  const abort = new AbortController();
  sheet.onCancel(() => abort.abort());
  const pairing: TerraWcPairingCallbacks = {
    onDisplayUri: (details, uri) => sheet.open(details, uri),
    signal: abort.signal,
  };
  try {
    if (id === "luncdash") {
      return await signLuncDash(prepare, pairing);
    }
    return await signGalaxyStation(prepare, pairing);
  } finally {
    sheet.close();
    sheet.onCancel(() => {});
  }
}

async function signLuncDash(
  prepare: TerraWcPrepare,
  pairing: TerraWcPairingCallbacks,
): Promise<TerraArbitraryResult | { alreadySigned: true; accountId: string }> {
  const hook = e2eHook()?.luncdash;
  if (hook) {
    return hook(prepare, pairing);
  }
  return signLuncDashWalletConnect(prepare, pairing);
}

async function signGalaxyStation(
  prepare: TerraWcPrepare,
  pairing: TerraWcPairingCallbacks,
): Promise<TerraArbitraryResult | { alreadySigned: true; accountId: string }> {
  const hook = e2eHook()?.galaxystation;
  if (hook) {
    return hook(prepare, pairing);
  }
  if (!isGalaxyWalletConnectConfigured()) {
    throw new Error(WC_NOT_CONFIGURED);
  }
  return signGalaxyStationWalletConnect(prepare, pairing);
}

type LegacyWalletConnect = {
  connected: boolean;
  accounts: string[];
  uri?: string;
  createSession: () => Promise<void>;
  killSession: () => Promise<void>;
  sendCustomRequest: (req: {
    id: number;
    method: string;
    params: unknown[];
  }) => Promise<unknown>;
  on: (event: string, handler: (error: Error | null, payload?: unknown) => void) => void;
};

type LegacyClientCtor = new (opts: {
  bridge: string;
  signingMethods: string[];
  qrcodeModal: {
    open: (uri: string, callback: () => void) => void;
    close: () => void;
  };
}) => LegacyWalletConnect;

async function loadLegacyClient(): Promise<LegacyClientCtor> {
  const mod = (await import("@walletconnect/legacy-client")) as unknown as {
    default?: LegacyClientCtor;
  } & LegacyClientCtor;
  return (mod.default ?? mod) as LegacyClientCtor;
}

async function signLuncDashWalletConnect(
  prepare: TerraWcPrepare,
  pairing: TerraWcPairingCallbacks,
): Promise<TerraArbitraryResult | { alreadySigned: true; accountId: string }> {
  const WalletConnect = await loadLegacyClient();
  let rejectModal: (() => void) | undefined;
  const wc = new WalletConnect({
    bridge: LUNC_DASH_WC_BRIDGE,
    signingMethods: [],
    qrcodeModal: {
      open: (uri) => {
        if (!pairing.onDisplayUri(LUNC_DASH_PAIRING, uri)) {
          rejectModal?.();
        }
      },
      close: () => {
        /* sheet closed by caller */
      },
    },
  });

  throwIfAborted(pairing.signal);

  const connected = new Promise<void>((resolve, reject) => {
    rejectModal = () => reject(new Error(WC_CANCELLED));
    const onAbort = () => reject(new Error(WC_CANCELLED));
    pairing.signal?.addEventListener("abort", onAbort, { once: true });
    wc.on("connect", (error) => {
      pairing.signal?.removeEventListener("abort", onAbort);
      error ? reject(error) : resolve();
    });
    wc.on("disconnect", () => {
      pairing.signal?.removeEventListener("abort", onAbort);
    });
  });

  if (!wc.connected) {
    await wc.createSession();
    if (wc.uri && !pairing.onDisplayUri(LUNC_DASH_PAIRING, wc.uri)) {
      throw new Error(WC_CANCELLED);
    }
    await connected;
  }

  throwIfAborted(pairing.signal);
  const rawAccount = wc.accounts[0];
  if (!rawAccount) {
    throw new Error("LUNC Dash did not return an account.");
  }
  const prepared = await prepare(canonicalizeTerraAddress(rawAccount));
  if ("alreadySigned" in prepared && prepared.alreadySigned) {
    return { alreadySigned: true, accountId: prepared.accountId };
  }
  if ("alreadySigned" in prepared) {
    throw new Error("LUNC Dash prepare failed.");
  }
  const { accountId, message } = prepared;
  const doc = adr036SignDocBytes(accountId, message);
  const id = Date.now();
  const res = (await wc.sendCustomRequest({
    id,
    method: "signBytes",
    params: [bytesToBase64(doc)],
  })) as { public_key?: string; signature?: string };

  if (!res?.signature || !res.public_key) {
    throw new Error("LUNC Dash did not return a signature.");
  }
  return {
    accountId: prepared.accountId,
    signature: res.signature,
    pubkey: res.public_key,
  };
}

type SignClientLike = {
  connect: (params: unknown) => Promise<{ uri?: string; approval: () => Promise<{ topic: string }> }>;
  request: (params: {
    topic: string;
    chainId: string;
    request: { method: string; params: unknown };
  }) => Promise<unknown>;
};

async function signGalaxyStationWalletConnect(
  prepare: TerraWcPrepare,
  pairing: TerraWcPairingCallbacks,
): Promise<TerraArbitraryResult | { alreadySigned: true; accountId: string }> {
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
    requiredNamespaces: {
      cosmos: {
        methods: ["cosmos_getAccounts", "keplr_getKey", "keplr_signArbitrary", "cosmos_signAmino"],
        chains: ["cosmos:columbus-5"],
        events: ["accountsChanged", "chainChanged"],
      },
    },
  });

  if (!uri || !pairing.onDisplayUri(GALAXY_STATION_PAIRING, uri)) {
    throw new Error(WC_CANCELLED);
  }

  const session = await Promise.race([
    approval(),
    abortPromise(pairing.signal),
  ]);

  const account = (await client.request({
    topic: session.topic,
    chainId: "cosmos:columbus-5",
    request: { method: "cosmos_getAccounts", params: {} },
  })) as Array<{ address?: string; pubkey?: string }>;

  const first = account[0];
  if (!first?.address || !first.pubkey) {
    throw new Error("Galaxy Station did not return an account.");
  }
  const accountId = canonicalizeTerraAddress(first.address);
  const prepared = await prepare(accountId);
  if ("alreadySigned" in prepared) {
    return prepared;
  }

  const signed = (await client.request({
    topic: session.topic,
    chainId: "cosmos:columbus-5",
    request: {
      method: "keplr_signArbitrary",
      params: {
        chainId: "columbus-5",
        signer: prepared.accountId,
        type: "string",
        data: prepared.message,
      },
    },
  })) as { signature?: string; pub_key?: { value?: string } };

  const signature = signed.signature;
  const pubkey = signed.pub_key?.value ?? first.pubkey;
  if (!signature || !pubkey) {
    throw new Error("Galaxy Station did not return a signature.");
  }
  return { accountId: prepared.accountId, signature, pubkey };
}

function abortPromise(signal?: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal?.aborted) {
      reject(new Error(WC_CANCELLED));
      return;
    }
    signal?.addEventListener("abort", () => reject(new Error(WC_CANCELLED)), { once: true });
  });
}
