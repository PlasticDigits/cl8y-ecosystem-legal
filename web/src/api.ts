import { createClient } from "@plasticdigits/cl8y-clickwrap";
import type { StatusResponse, TermsLatest } from "@plasticdigits/cl8y-clickwrap";

const client = createClient({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
});

export type { StatusResponse, TermsLatest };

export function getTermsLatest(property: string) {
  return client.getTermsLatest(property);
}

export function getStatus(property: string, network: string, account: string) {
  return client.getSignatureStatus(property, network, account);
}

export function submitWallet(body: Record<string, unknown>) {
  return client.submitWallet(body);
}

export function submitTelegram(body: Record<string, unknown>) {
  return client.submitTelegram(body);
}
