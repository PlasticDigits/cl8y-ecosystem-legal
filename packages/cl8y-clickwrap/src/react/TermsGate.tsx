import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient, type ClickwrapClient } from "../client.js";
import { NETWORK_SIGN_URL_KEYS, type Network, type TermsLatest } from "../types.js";
import { buildSignUrl } from "../urls.js";
import { useSignatureStatus } from "./useSignatureStatus.js";

export interface TermsGateProps {
  client?: ClickwrapClient;
  property: string;
  network: Network;
  account: string | null | undefined;
  redirectUri?: string;
  appName?: string;
  children: ReactNode;
  fallback?: ReactNode;
  unsigned?: ReactNode;
  onError?: (error: Error) => void;
  termsContentUrl?: (property: string) => string;
}

const defaultFallback = <p>Checking terms acceptance…</p>;

export function TermsGate({
  client: clientProp,
  property,
  network,
  account,
  redirectUri,
  appName,
  children,
  fallback = defaultFallback,
  unsigned,
  onError,
  termsContentUrl,
}: TermsGateProps) {
  const client = useMemo(() => clientProp ?? createClient(), [clientProp]);
  const { status, loading, error, isSigned } = useSignatureStatus({
    client,
    property,
    network,
    account,
  });
  const [terms, setTerms] = useState<TermsLatest | null>(null);
  const [termsError, setTermsError] = useState<Error | null>(null);

  useEffect(() => {
    if (error) {
      onError?.(error);
    }
  }, [error, onError]);

  useEffect(() => {
    if (termsError) {
      onError?.(termsError);
    }
  }, [onError, termsError]);

  useEffect(() => {
    if (loading || isSigned || !account?.trim()) {
      return;
    }
    let cancelled = false;
    void client
      .getTermsLatest(property)
      .then((latest) => {
        if (!cancelled) {
          setTerms(latest);
          setTermsError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setTermsError(err instanceof Error ? err : new Error(String(err)));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [account, client, isSigned, loading, property]);

  const handleAccept = useCallback(() => {
    if (!terms) {
      return;
    }
    const baseUrl = terms.sign_urls[NETWORK_SIGN_URL_KEYS[network]];
    window.location.href = buildSignUrl(baseUrl, {
      redirectUri,
      appName,
      account: account ?? undefined,
    });
  }, [account, appName, network, redirectUri, terms]);

  if (!account?.trim()) {
    return <>{fallback}</>;
  }

  if (loading) {
    return <>{fallback}</>;
  }

  if (error) {
    return <p role="alert">Unable to verify terms acceptance: {error.message}</p>;
  }

  if (isSigned) {
    return <>{children}</>;
  }

  if (unsigned) {
    return <>{unsigned}</>;
  }

  const readTermsHref =
    termsContentUrl?.(property) ??
    `${client.apiBaseUrl}/api/v1/terms/latest/content?property=${encodeURIComponent(property)}`;

  return (
    <div className="cl8y-clickwrap-gate">
      <h2>Accept Terms &amp; Conditions</h2>
      {terms ? (
        <p>
          You must accept CL8Y Terms &amp; Conditions{" "}
          <strong>{terms.version_label}</strong> (effective {terms.effective_date}) for{" "}
          <strong>{property}</strong>.
        </p>
      ) : termsError ? (
        <p role="alert">Unable to load terms: {termsError.message}</p>
      ) : (
        <p>Loading terms…</p>
      )}
      <p>
        <a href={readTermsHref} target="_blank" rel="noopener noreferrer">
          Read full terms
        </a>
      </p>
      <button type="button" onClick={handleAccept} disabled={!terms}>
        Accept Terms
      </button>
      {status?.signed_version && !status.signed_latest ? (
        <p>You accepted {status.signed_version}; a newer version is available.</p>
      ) : null}
    </div>
  );
}
