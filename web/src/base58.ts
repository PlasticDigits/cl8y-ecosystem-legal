/** Bitcoin/Solana base58 alphabet (no checksum). Lockstep with API `bs58`. */
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Encode bytes as Solana-style base58 (no checksum). Used for signature bytes. */
export function uint8ToBase58(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      const x = digits[j] * 256 + carry;
      digits[j] = x % 58;
      carry = (x / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let str = "";
  for (const d of digits.reverse()) str += ALPHABET[d];
  let zeros = 0;
  for (const b of bytes) {
    if (b === 0) zeros++;
    else break;
  }
  return "1".repeat(zeros) + str;
}

/**
 * Decode Bitcoin/Solana base58 (no checksum) to bytes.
 * Matches API `bs58::decode` used by `normalize_account` / `verify_solana`.
 * Returns null on empty input or any character outside the alphabet.
 */
export function base58ToUint8(str: string): Uint8Array | null {
  if (!str) {
    return null;
  }
  let decoded = new Uint8Array(0);
  for (const ch of str) {
    const digit = ALPHABET.indexOf(ch);
    if (digit < 0) {
      return null;
    }
    let carry = digit;
    const next = new Uint8Array(decoded.length + 1);
    for (let i = decoded.length - 1; i >= 0; i--) {
      const x = decoded[i]! * 58 + carry;
      next[i + 1] = x & 0xff;
      carry = x >> 8;
    }
    next[0] = carry;
    decoded = next[0] === 0 ? next.subarray(1) : next;
  }
  let pad = 0;
  for (const ch of str) {
    if (ch === "1") {
      pad++;
    } else {
      break;
    }
  }
  const out = new Uint8Array(pad + decoded.length);
  out.set(decoded, pad);
  return out;
}
