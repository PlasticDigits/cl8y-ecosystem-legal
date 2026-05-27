import {
  DEFAULT_API_BASE_URL,
  DEFAULT_TERMS_BASE_URL,
  type ClientConfig,
  type StatusResponse,
  type SubmitResponse,
  type TermsLatest,
} from "./types.js";

export interface ClickwrapClient {
  readonly apiBaseUrl: string;
  readonly termsBaseUrl: string;
  getTermsLatest(property: string): Promise<TermsLatest>;
  getTermsContent(property: string): Promise<string>;
  getSignatureStatus(property: string, network: string, account: string): Promise<StatusResponse>;
  submitWallet(body: Record<string, unknown>): Promise<SubmitResponse>;
  submitTelegram(body: Record<string, unknown>): Promise<SubmitResponse>;
}

export function createClient(config: ClientConfig = {}): ClickwrapClient {
  const apiBaseUrl = (config.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
  const termsBaseUrl = (config.termsBaseUrl ?? DEFAULT_TERMS_BASE_URL).replace(/\/$/, "");

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${apiBaseUrl}${path}`, init);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? res.statusText);
    }
    const contentType = res.headers?.get("content-type") ?? "";
    if (contentType.includes("text/plain")) {
      return (await res.text()) as T;
    }
    return res.json() as Promise<T>;
  }

  return {
    apiBaseUrl,
    termsBaseUrl,
    getTermsLatest(property: string) {
      return api<TermsLatest>(`/api/v1/terms/latest?property=${encodeURIComponent(property)}`);
    },
    getTermsContent(property: string) {
      return api<string>(`/api/v1/terms/latest/content?property=${encodeURIComponent(property)}`);
    },
    getSignatureStatus(property: string, network: string, account: string) {
      const q = new URLSearchParams({ property, network, account });
      return api<StatusResponse>(`/api/v1/signatures/status?${q}`);
    },
    submitWallet(body: Record<string, unknown>) {
      return api<SubmitResponse>("/api/v1/signatures/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    submitTelegram(body: Record<string, unknown>) {
      return api<SubmitResponse>("/api/v1/signatures/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
  };
}
