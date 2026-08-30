/**
 * EVM address binding for portal sign (GitLab #15).
 *
 * Lockstep with API `normalize_account` for `EVM`: lowercase `0x` + 40 hex.
 * Checksum addresses compare equal to their lowercase form.
 * Integrator `account=0x…` (SDK `buildSignUrl({ account })`) is continuity, not a redirect.
 */

export const EVM_ACCOUNT_MISMATCH =
  "This page is for a different wallet. Reconnect that account and try again.";

const EVM_ADDRESS = /^0x[0-9a-f]{40}$/;

/** Canonical lowercase `0x` + 40 hex, or null if not a valid EVM address. */
export function canonicalizeEvmAddress(address: string): string | null {
  const lower = address.trim().toLowerCase();
  return EVM_ADDRESS.test(lower) ? lower : null;
}

/**
 * If the integrator passed `account`, the connected wallet must sign that address.
 * A signature for a different `0x…` must not be submitted.
 */
export function assertEvmAccountContinuity(claimed: string | null, connected: string): string {
  const signedCanon = canonicalizeEvmAddress(connected);
  if (!signedCanon) {
    throw new Error("Wallet did not return a valid address.");
  }
  if (!claimed) {
    return signedCanon;
  }
  const claimedCanon = canonicalizeEvmAddress(claimed);
  if (!claimedCanon || claimedCanon !== signedCanon) {
    throw new Error(EVM_ACCOUNT_MISMATCH);
  }
  return signedCanon;
}
