const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export interface TermsLatest {
  property: string;
  version_label: string;
  effective_date: string;
  content_sha256: string;
  published_at: string;
  sign_urls: Record<string, string>;
}

export interface StatusResponse {
  property: string;
  latest_version: string | null;
  signed_latest: boolean;
  signed_version: string | null;
  signed_at: string | null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export function getTermsLatest(property: string) {
  return api<TermsLatest>(`/api/v1/terms/latest?property=${encodeURIComponent(property)}`);
}

export function getStatus(property: string, network: string, account: string) {
  const q = new URLSearchParams({ property, network, account });
  return api<StatusResponse>(`/api/v1/signatures/status?${q}`);
}

export function submitWallet(body: Record<string, unknown>) {
  return api<{ id: string; signed_at: string }>("/api/v1/signatures/wallet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function submitTelegram(body: Record<string, unknown>) {
  return api<{ id: string; signed_at: string }>("/api/v1/signatures/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
