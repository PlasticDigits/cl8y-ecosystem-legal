/**
 * Solana address binding for portal sign (GitLab #17).
 *
 * Lockstep with API `normalize_account` for `SOLANA`: trim → bs58 decode →
 * exactly 32 bytes. The stored string is case-sensitive (do not lowercase).
 * Integrator `account=` (SDK `buildSignUrl({ account })`) is continuity, not a
 * redirect: never pass it to `location`, `<a href>`, or success navigation.
 * Invalid claimed values (`javascript:`, `0x…`, `terra1…`, short/high-bit
 * garbage) fail closed with the same mismatch copy as EVM/Terra.
 *
 * Compare **decoded bytes**, not strings. Two encodings that decode to the
 * same 32 bytes are a match. Query `account` is portal UX only — the API still
 * verifies the submitted `account_id` + signature.
 *
 * Out of scope: Solana off-chain envelope alignment (portal UTF-8 `signMessage`
 * vs API `0xff || "solana offchain"` — still a P0 in gaps/GAP_1786322222.md).
 * Cross-links: skills/solana-account-bind/SKILL.md, skills/portal-sign-disclosure/SKILL.md.
 */

import { base58ToUint8 } from "../base58";

export const SOLANA_ACCOUNT_MISMATCH =
  "This page is for a different wallet. Reconnect that account and try again.";

const SOLANA_PUBKEY_LEN = 32;

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

/** 32-byte public key from a Solana base58 string, or null if invalid. */
export function canonicalizeSolanaAddress(address: string): Uint8Array | null {
  const decoded = base58ToUint8(address.trim());
  if (!decoded || decoded.length !== SOLANA_PUBKEY_LEN) {
    return null;
  }
  return decoded;
}

/**
 * If the integrator passed `account`, the connected wallet must sign that pubkey.
 * A signature for a different 32-byte key must not be submitted.
 * Returns the connected wallet's original string (API stores SOLANA ids as submitted).
 */
export function assertSolanaAccountContinuity(claimed: string | null, connected: string): string {
  const signedCanon = canonicalizeSolanaAddress(connected);
  if (!signedCanon) {
    throw new Error("Wallet did not return a valid address.");
  }
  if (!claimed) {
    return connected.trim();
  }
  const claimedCanon = canonicalizeSolanaAddress(claimed);
  if (!claimedCanon || !bytesEqual(claimedCanon, signedCanon)) {
    throw new Error(SOLANA_ACCOUNT_MISMATCH);
  }
  return connected.trim();
}
