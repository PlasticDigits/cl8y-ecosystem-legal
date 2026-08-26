/**
 * Terra Classic chain + address invariants (GitLab #11).
 *
 * Do not retarget to Terra 2.0 (`phoenix-1`) without an explicit product change.
 * Address rules match API `normalize_account` / BIP-173.
 */

/** Terra Classic mainnet. */
export const TERRA_CHAIN_ID = "columbus-5";

export const TERRA_ACCOUNT_MISMATCH =
  "This page is for a different wallet. Reconnect that account and try again.";

/**
 * Canonicalize a Terra bech32 to lowercase before build/sign/submit.
 * Mixed case is invalid per BIP-173.
 */
export function canonicalizeTerraAddress(address: string): string {
  const trimmed = address.trim();
  const lower = trimmed.toLowerCase();
  const upper = trimmed.toUpperCase();
  if (trimmed !== lower && trimmed !== upper) {
    throw new Error("invalid Terra Classic address (mixed case)");
  }
  return lower;
}

/**
 * If the integrator passed `account`, the chosen wallet must sign that address.
 * A signature for a different `terra1…` must not be submitted.
 */
export function assertAccountContinuity(claimed: string | null, signed: string): string {
  const signedCanon = canonicalizeTerraAddress(signed);
  if (!claimed) {
    return signedCanon;
  }
  const claimedCanon = canonicalizeTerraAddress(claimed);
  if (claimedCanon !== signedCanon) {
    throw new Error(TERRA_ACCOUNT_MISMATCH);
  }
  return signedCanon;
}
