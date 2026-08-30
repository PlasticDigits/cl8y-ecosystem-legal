/**
 * EIP-1193 provider discovery for EVM portal sign (GitLab #15).
 *
 * Order: EIP-6963 announcements, `window.ethereum.providers[]`, `window.ethereum`,
 * `window.BinanceChain`. Listen briefly for `eip6963:announceProvider` and
 * `ethereum#initialized` so late MetaMask iOS / Binance WebView injection is not
 * a false miss.
 *
 * If several providers announce, the picker (not this module) makes the user
 * choose — never silently sign with a hidden injected wallet.
 *
 * Do not mention EIP-6963 in retail copy. Icons from announcements are ignored
 * (no `innerHTML` of wallet-supplied SVG).
 */

export const EIP6963_ANNOUNCE = "eip6963:announceProvider";
export const EIP6963_REQUEST = "eip6963:requestProvider";
export const ETHEREUM_INITIALIZED = "ethereum#initialized";

/** Default wait for late inject / 6963 announce. Tests pass `waitMs: 0`. */
export const PROVIDER_DISCOVERY_MS = 400;

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  providers?: Eip1193Provider[];
  isMetaMask?: boolean;
  isBinance?: boolean;
}

export interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  rdns: string;
  icon?: string;
}

export interface DiscoveredEvmProvider {
  id: string;
  name: string;
  rdns: string | null;
  provider: Eip1193Provider;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
    BinanceChain?: Eip1193Provider;
  }
}

export function isEip1193Provider(value: unknown): value is Eip1193Provider {
  if (!value || typeof value !== "object") {
    return false;
  }
  return typeof (value as Eip1193Provider).request === "function";
}

function providerName(provider: Eip1193Provider, fallback: string): string {
  if (provider.isMetaMask) {
    return "MetaMask";
  }
  if (provider.isBinance) {
    return "Binance Web3";
  }
  return fallback;
}

function alreadyListed(byId: Map<string, DiscoveredEvmProvider>, provider: Eip1193Provider): boolean {
  for (const entry of byId.values()) {
    if (entry.provider === provider) {
      return true;
    }
  }
  return false;
}

function addProvider(
  byId: Map<string, DiscoveredEvmProvider>,
  entry: DiscoveredEvmProvider,
): void {
  if (!isEip1193Provider(entry.provider) || alreadyListed(byId, entry.provider)) {
    return;
  }
  byId.set(entry.id, entry);
}

function snapshotFallbacks(byId: Map<string, DiscoveredEvmProvider>): void {
  const injected = window.ethereum;
  const nested = injected?.providers;
  if (Array.isArray(nested)) {
    nested.forEach((candidate, index) => {
      if (!isEip1193Provider(candidate)) {
        return;
      }
      addProvider(byId, {
        id: `injected:providers:${index}`,
        name: providerName(candidate, `Browser wallet ${index + 1}`),
        rdns: null,
        provider: candidate,
      });
    });
  }
  if (isEip1193Provider(injected)) {
    addProvider(byId, {
      id: "injected:ethereum",
      name: providerName(injected, "Browser wallet"),
      rdns: null,
      provider: injected,
    });
  }
  if (isEip1193Provider(window.BinanceChain)) {
    addProvider(byId, {
      id: "injected:binance",
      name: "Binance Web3",
      rdns: null,
      provider: window.BinanceChain,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function waitForEthereumInitialized(ms: number): Promise<void> {
  if (isEip1193Provider(window.ethereum) || isEip1193Provider(window.BinanceChain)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener(ETHEREUM_INITIALIZED, done);
      resolve();
    };
    window.addEventListener(ETHEREUM_INITIALIZED, done);
    setTimeout(done, ms);
  });
}

/**
 * Discover injected EIP-1193 providers. Always snapshots fallbacks; waits up to
 * `waitMs` for EIP-6963 / `ethereum#initialized` when no provider is visible yet.
 */
export async function discoverEvmProviders(
  options: { waitMs?: number } = {},
): Promise<DiscoveredEvmProvider[]> {
  const waitMs = options.waitMs ?? PROVIDER_DISCOVERY_MS;
  const byId = new Map<string, DiscoveredEvmProvider>();

  const onAnnounce = (event: Event) => {
    const detail = (event as CustomEvent<{ info?: Eip6963ProviderInfo; provider?: unknown }>).detail;
    const info = detail?.info;
    const provider = detail?.provider;
    if (!info || !isEip1193Provider(provider)) {
      return;
    }
    const key = info.rdns?.trim() || info.uuid?.trim();
    if (!key) {
      return;
    }
    const name = typeof info.name === "string" && info.name.trim() ? info.name.trim() : "Wallet";
    addProvider(byId, {
      id: `eip6963:${key}`,
      name,
      rdns: info.rdns?.trim() || null,
      provider,
    });
  };

  window.addEventListener(EIP6963_ANNOUNCE, onAnnounce);
  window.dispatchEvent(new Event(EIP6963_REQUEST));

  snapshotFallbacks(byId);
  if (waitMs > 0 && byId.size === 0) {
    await Promise.race([sleep(waitMs), waitForEthereumInitialized(waitMs)]);
    snapshotFallbacks(byId);
  } else if (waitMs > 0) {
    await sleep(Math.min(waitMs, 50));
  }

  window.removeEventListener(EIP6963_ANNOUNCE, onAnnounce);
  snapshotFallbacks(byId);
  return [...byId.values()];
}

export function hasInjectedEvmProvider(providers: readonly DiscoveredEvmProvider[]): boolean {
  return providers.length > 0;
}
