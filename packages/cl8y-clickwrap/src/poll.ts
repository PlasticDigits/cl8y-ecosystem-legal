import type { ClickwrapClient } from "./client.js";
import type { StatusResponse } from "./types.js";
import { NETWORK_API_VALUES, type Network } from "./types.js";

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export interface PollUntilSignedOptions {
  property: string;
  network: Network | string;
  account: string;
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function pollUntilSigned(
  client: ClickwrapClient,
  options: PollUntilSignedOptions,
): Promise<StatusResponse> {
  const {
    property,
    account,
    intervalMs = 2000,
    timeoutMs = 120_000,
    signal,
  } = options;
  const network =
    options.network in NETWORK_API_VALUES
      ? NETWORK_API_VALUES[options.network as Network]
      : options.network;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    const status = await client.getSignatureStatus(property, network, account);
    if (status.signed_latest) {
      return status;
    }
    await sleep(intervalMs, signal);
  }

  throw new Error("Timed out waiting for terms acceptance");
}
