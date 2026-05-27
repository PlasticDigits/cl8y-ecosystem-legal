import { useCallback, useEffect, useState } from "react";
import { createClient, type ClickwrapClient } from "../client.js";
import {
  NETWORK_API_VALUES,
  type Network,
  type StatusResponse,
} from "../types.js";

export interface UseSignatureStatusOptions {
  client?: ClickwrapClient;
  property: string;
  network: Network;
  account: string | null | undefined;
  pollIntervalMs?: number;
  enabled?: boolean;
}

export interface UseSignatureStatusResult {
  status: StatusResponse | null;
  loading: boolean;
  error: Error | null;
  isSigned: boolean;
  refresh: () => Promise<void>;
}

export function useSignatureStatus(options: UseSignatureStatusOptions): UseSignatureStatusResult {
  const {
    client = createClient(),
    property,
    network,
    account,
    pollIntervalMs,
    enabled = true,
  } = options;

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(enabled && account));
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !account?.trim()) {
      setStatus(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const next = await client.getSignatureStatus(
        property,
        NETWORK_API_VALUES[network],
        account,
      );
      setStatus(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [account, client, enabled, network, property]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !account?.trim()) {
      return;
    }
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [account, enabled, refresh]);

  useEffect(() => {
    if (!pollIntervalMs || !enabled || !account?.trim()) {
      return;
    }
    const id = window.setInterval(() => {
      void refresh();
    }, pollIntervalMs);
    return () => window.clearInterval(id);
  }, [account, enabled, pollIntervalMs, refresh]);

  return {
    status,
    loading,
    error,
    isSigned: Boolean(status?.signed_latest),
    refresh,
  };
}
