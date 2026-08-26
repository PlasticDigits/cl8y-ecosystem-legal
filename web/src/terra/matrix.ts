/**
 * Terra Classic wallet set for `/sign/terra-classic`.
 *
 * Source of truth: ustr-cmm `frontend/src/services/wallet.ts` +
 * `frontend/src/components/common/WalletButton.tsx` (`WalletName` + `WalletType`).
 * If that file adds/removes a Terra Classic wallet, update this matrix.
 *
 * Legal needs ADR-036 `signArbitrary` (or `signBytes` of the pre-serialized
 * ADR-036 amino doc). Do not copy integrator WalletConnect project ids.
 *
 * GitLab #11. Cross-link: skills/terra-classic-adr036/SKILL.md
 */

export type TerraWalletId =
  | "station"
  | "keplr"
  | "leap"
  | "cosmostation"
  | "luncdash"
  | "galaxystation";

export type TerraWalletKind = "extension" | "walletconnect";

export type TerraSignMode =
  /** Wallet wraps the legal message as ADR-036 (Keplr / Leap / Cosmostation / Galaxy WC). */
  | "keplr-arbitrary"
  /** Wallet signs raw bytes — portal must pass ADR-036 amino JSON (LUNC Dash / Station WC). */
  | "sign-bytes-adr036";

export interface TerraWalletDef {
  id: TerraWalletId;
  /** Retail label — no "ADR-036". */
  label: string;
  kind: TerraWalletKind;
  signMode: TerraSignMode;
  /** ustr-cmm connect path, for docs lockstep. */
  ustrCmmPath: string;
}

/**
 * Order matches ustr-cmm WalletButton: Station, Keplr, Leap, Cosmostation,
 * then mobile WC (LUNC Dash, Galaxy Station). Trust Wallet uses the Keplr row
 * when it injects a Keplr-compatible provider.
 */
export const TERRA_WALLET_MATRIX: readonly TerraWalletDef[] = [
  {
    id: "station",
    label: "Terra Station",
    kind: "extension",
    signMode: "keplr-arbitrary",
    ustrCmmPath: "window.station (extension)",
  },
  {
    id: "keplr",
    label: "Keplr",
    kind: "extension",
    signMode: "keplr-arbitrary",
    ustrCmmPath: "window.keplr (extension; Trust if Keplr-compat)",
  },
  {
    id: "leap",
    label: "Leap",
    kind: "extension",
    signMode: "keplr-arbitrary",
    ustrCmmPath: "window.leap (extension)",
  },
  {
    id: "cosmostation",
    label: "Cosmostation",
    kind: "extension",
    signMode: "keplr-arbitrary",
    ustrCmmPath: "window.cosmostation (extension)",
  },
  {
    id: "luncdash",
    label: "LUNC Dash",
    kind: "walletconnect",
    signMode: "sign-bytes-adr036",
    ustrCmmPath: "WalletConnect (mobile)",
  },
  {
    id: "galaxystation",
    label: "Galaxy Station",
    kind: "walletconnect",
    signMode: "keplr-arbitrary",
    ustrCmmPath: "WalletConnect (mobile)",
  },
] as const;

export function terraWalletById(id: TerraWalletId): TerraWalletDef {
  const found = TERRA_WALLET_MATRIX.find((w) => w.id === id);
  if (!found) {
    throw new Error("unknown Terra Classic wallet");
  }
  return found;
}

export function isTerraWalletId(value: string): value is TerraWalletId {
  return TERRA_WALLET_MATRIX.some((w) => w.id === value);
}
