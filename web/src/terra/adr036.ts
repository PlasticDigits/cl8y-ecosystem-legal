/**
 * CosmJS / Keplr ADR-036 amino sign-doc bytes.
 *
 * Must stay lockstep with `api/src/verify/terra.rs` `adr036_sign_doc_bytes`.
 * Used only for wallets that sign raw bytes (`signBytes`) instead of wrapping
 * the legal message themselves (`signArbitrary`). Never pass this document to a
 * Keplr-compatible `signArbitrary` — that would double-wrap and fail verify.
 *
 * Invariants:
 * - `chain_id` / `memo` empty; `account_number` / `sequence` `"0"`; zero fee
 * - CosmJS key order + `&` / `<` / `>` escapes
 * - `data` is base64(legal message UTF-8)
 */

function escapeAminoJsonString(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    switch (ch) {
      case "\\":
        out += "\\\\";
        break;
      case '"':
        out += '\\"';
        break;
      case "\b":
        out += "\\b";
        break;
      case "\f":
        out += "\\f";
        break;
      case "\n":
        out += "\\n";
        break;
      case "\r":
        out += "\\r";
        break;
      case "\t":
        out += "\\t";
        break;
      case "&":
        out += "\\u0026";
        break;
      case "<":
        out += "\\u003c";
        break;
      case ">":
        out += "\\u003e";
        break;
      default:
        if (code < 0x20) {
          out += `\\u${code.toString(16).padStart(4, "0")}`;
        } else {
          out += ch;
        }
    }
  }
  return out;
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

/** Serialized ADR-036 amino JSON (UTF-8). Matches the Rust golden fixture. */
export function adr036SignDocBytes(signer: string, message: string): Uint8Array {
  const data = escapeAminoJsonString(utf8ToBase64(message));
  const signerEsc = escapeAminoJsonString(signer);
  const json = `{"account_number":"0","chain_id":"","fee":{"amount":[],"gas":"0"},"memo":"","msgs":[{"type":"sign/MsgSignData","value":{"data":"${data}","signer":"${signerEsc}"}}],"sequence":"0"}`;
  return new TextEncoder().encode(json);
}

export function adr036SignDocUtf8(signer: string, message: string): string {
  return new TextDecoder().decode(adr036SignDocBytes(signer, message));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}
