export interface SignUrls {
  telegram: string;
  evm: string;
  terra_classic: string;
  solana: string;
}

export interface TermsLatest {
  property: string;
  version_label: string;
  effective_date: string;
  content_sha256: string;
  published_at: string;
  sign_urls: SignUrls;
}

export interface StatusResponse {
  property: string;
  latest_version: string | null;
  signed_latest: boolean;
  signed_version: string | null;
  signed_at: string | null;
}

export interface SubmitResponse {
  id: string;
  signed_at: string;
}

export type Network = "EVM" | "Solana" | "TerraClassic" | "Telegram";

export type SignUrlKey = keyof SignUrls;

export interface ClientConfig {
  apiBaseUrl?: string;
  termsBaseUrl?: string;
}

export const DEFAULT_API_BASE_URL = "https://api.terms.cl8y.com";
export const DEFAULT_TERMS_BASE_URL = "https://terms.cl8y.com";

export const NETWORK_API_VALUES: Record<Network, string> = {
  EVM: "EVM",
  Solana: "SOLANA",
  TerraClassic: "TERRA_CLASSIC",
  Telegram: "TELEGRAM",
};

export const NETWORK_SIGN_URL_KEYS: Record<Network, SignUrlKey> = {
  EVM: "evm",
  Solana: "solana",
  TerraClassic: "terra_classic",
  Telegram: "telegram",
};
