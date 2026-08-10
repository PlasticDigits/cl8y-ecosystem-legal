//! Terra Classic (`TERRA_CLASSIC`) wallet signature verification.
//!
//! # Invariants
//!
//! - Portal Keplr calls `window.keplr.signArbitrary(chainId, signer, data)` on
//!   Terra Classic chain id `columbus-5`. Keplr wraps `data` as ADR-036
//!   `sign/MsgSignData` (amino JSON), **not** raw UTF-8 bytes.
//! - The signed amino document always uses empty `chain_id` / `memo`,
//!   `account_number`/`sequence` `"0"`, and zero fee — matching CosmJS
//!   `makeADR36AminoSignDoc` / Keplr ADR-036 (independent of `columbus-5`).
//! - Verification SHA-256-hashes the CosmJS `serializeSignDoc` bytes
//!   (sorted JSON + `&`/`<`/`>` escapes), then checks secp256k1 over that digest.
//! - Provided compressed secp256k1 pubkey must derive the claimed `terra1…`
//!   bech32 address (HRP `terra`, 20-byte payload).
//! - Legacy raw-byte ECDSA verify is intentionally unsupported (path never worked
//!   against production Keplr). See `skills/terra-classic-adr036/SKILL.md`.

use base64::{engine::general_purpose::STANDARD, Engine};
use bech32::{encode, ToBase32, Variant};
use k256::ecdsa::{signature::Verifier, Signature, VerifyingKey};
use ripemd::Ripemd160;
use sha2::{Digest, Sha256};

use crate::error::{AppError, AppResult};

const TERRA_HRP: &str = "terra";
const COMPRESSED_PUBKEY_LEN: usize = 33;
const COMPACT_SIG_LEN: usize = 64;

fn cosmos_address_from_pubkey(compressed_pubkey: &[u8], hrp: &str) -> AppResult<String> {
    let digest = Sha256::digest(compressed_pubkey);
    let rip = Ripemd160::digest(digest);
    encode(hrp, rip.to_base32(), Variant::Bech32)
        .map_err(|_| AppError::BadRequest("bech32 encode failed".into()))
}

/// Escape a JSON string value the way CosmJS `serializeSignDoc` does:
/// standard JSON string escapes, then `&` / `<` / `>` → `\u00xx`.
fn escape_amino_json_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\u{08}' => out.push_str("\\b"),
            '\u{0c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", c as u32));
            }
            '&' => out.push_str("\\u0026"),
            '<' => out.push_str("\\u003c"),
            '>' => out.push_str("\\u003e"),
            c => out.push(c),
        }
    }
    out
}

/// CosmJS / Keplr ADR-036 amino sign-doc bytes for arbitrary message signing.
///
/// Document shape is fixed; only `signer` and base64(`message`) vary. Key order
/// matches CosmJS `sortedJsonStringify`.
pub fn adr036_sign_doc_bytes(signer: &str, message: &str) -> Vec<u8> {
    let data_b64 = STANDARD.encode(message.as_bytes());
    let data = escape_amino_json_string(&data_b64);
    let signer = escape_amino_json_string(signer);
    format!(
        "{{\"account_number\":\"0\",\"chain_id\":\"\",\"fee\":{{\"amount\":[],\"gas\":\"0\"}},\"memo\":\"\",\"msgs\":[{{\"type\":\"sign/MsgSignData\",\"value\":{{\"data\":\"{data}\",\"signer\":\"{signer}\"}}}}],\"sequence\":\"0\"}}"
    )
    .into_bytes()
}

/// Verify Keplr / CosmJS ADR-036 `signArbitrary`: signature and pubkey are base64.
pub fn verify_terra(
    expected_address: &str,
    message: &str,
    signature_b64: &str,
    pubkey_b64: &str,
) -> AppResult<()> {
    let sig_bytes = STANDARD
        .decode(signature_b64)
        .map_err(|_| AppError::BadRequest("invalid terra signature base64".into()))?;
    if sig_bytes.len() != COMPACT_SIG_LEN {
        return Err(AppError::BadRequest(
            "invalid terra signature length".into(),
        ));
    }

    let pubkey_bytes = STANDARD
        .decode(pubkey_b64)
        .map_err(|_| AppError::BadRequest("invalid terra pubkey base64".into()))?;
    if pubkey_bytes.len() != COMPRESSED_PUBKEY_LEN {
        return Err(AppError::BadRequest("invalid terra pubkey length".into()));
    }

    let vk = VerifyingKey::from_sec1_bytes(&pubkey_bytes)
        .map_err(|_| AppError::BadRequest("invalid terra pubkey".into()))?;
    // CosmJS/Keplr use low-S; normalize so high-S compact encodings still verify.
    let sig = Signature::from_slice(&sig_bytes)
        .map_err(|_| AppError::BadRequest("invalid terra signature".into()))?;
    let sig = sig.normalize_s().unwrap_or(sig);

    let sign_doc = adr036_sign_doc_bytes(expected_address, message);
    vk.verify(&sign_doc, &sig)
        .map_err(|_| AppError::BadRequest("terra signature verification failed".into()))?;

    let compressed = vk.to_encoded_point(true);
    let derived = cosmos_address_from_pubkey(compressed.as_bytes(), TERRA_HRP)?;

    if derived != expected_address {
        return Err(AppError::BadRequest(
            "terra pubkey does not match address".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};
    use k256::ecdsa::{signature::Signer, SigningKey};

    fn sign_adr036(sk: &SigningKey, address: &str, message: &str) -> String {
        let doc = adr036_sign_doc_bytes(address, message);
        let sig: Signature = sk.sign(&doc);
        STANDARD.encode(sig.to_bytes())
    }

    #[test]
    fn adr036_sign_doc_matches_cosmjs_fixture() {
        let address = "terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt";
        let message = "CL8Y Terra ADR-036 test";
        let expected = concat!(
            r#"{"account_number":"0","chain_id":"","fee":{"amount":[],"gas":"0"},"memo":"","msgs":[{"type":"sign/MsgSignData","value":{"data":"Q0w4WSBUZXJyYSBBRFItMDM2IHRlc3Q=","signer":"terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt"}}],"sequence":"0"}"#
        );
        assert_eq!(
            String::from_utf8(adr036_sign_doc_bytes(address, message)).unwrap(),
            expected
        );
    }

    #[test]
    fn cosmjs_keplr_vector_verifies() {
        // Fixed key 0x33×32; vector produced with @cosmjs/amino serializeSignDoc + Secp256k1.
        let address = "terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt";
        let message = "CL8Y Terra ADR-036 test";
        let pubkey_b64 = "AjxyrdtP3wmvlPDJTX/pKjhqfnDPih2FkWOGuyU1x7Gx";
        let sig_b64 =
            "tgt38hNw0m/rtMgNgjFBLPuqto8l/QbfJZnzuzI1SzQZwyaY/SUnczyT3F0fePUEQBhbnNfeOBMkz7hOi2Qvvg==";
        verify_terra(address, message, sig_b64, pubkey_b64).unwrap();
    }

    #[test]
    fn roundtrip_terra_adr036_sign_verify() {
        let sk = SigningKey::from_bytes((&[0x33u8; 32]).into()).expect("key");
        let vk = VerifyingKey::from(&sk);
        let compressed = vk.to_encoded_point(true);
        let address = cosmos_address_from_pubkey(compressed.as_bytes(), TERRA_HRP).unwrap();
        let message = "CL8Y Terra ADR-036 test";
        let sig_b64 = sign_adr036(&sk, &address, message);
        let pubkey_b64 = STANDARD.encode(compressed.as_bytes());
        verify_terra(&address, message, &sig_b64, &pubkey_b64).unwrap();
    }

    #[test]
    fn rejects_raw_message_signature() {
        let sk = SigningKey::from_bytes((&[0x33u8; 32]).into()).expect("key");
        let vk = VerifyingKey::from(&sk);
        let compressed = vk.to_encoded_point(true);
        let address = cosmos_address_from_pubkey(compressed.as_bytes(), TERRA_HRP).unwrap();
        let message = "CL8Y Terra ADR-036 test";
        // Pre-fix production bug: ECDSA over raw UTF-8 (not ADR-036).
        let raw_sig: Signature = sk.sign(message.as_bytes());
        let err = verify_terra(
            &address,
            message,
            &STANDARD.encode(raw_sig.to_bytes()),
            &STANDARD.encode(compressed.as_bytes()),
        )
        .unwrap_err();
        assert!(matches!(err, AppError::BadRequest(_)));
    }

    #[test]
    fn rejects_wrong_message_claim() {
        let sk = SigningKey::from_bytes((&[0x33u8; 32]).into()).expect("key");
        let vk = VerifyingKey::from(&sk);
        let compressed = vk.to_encoded_point(true);
        let address = cosmos_address_from_pubkey(compressed.as_bytes(), TERRA_HRP).unwrap();
        let signed = "message A";
        let claimed = "message B";
        let sig_b64 = sign_adr036(&sk, &address, signed);
        let err = verify_terra(
            &address,
            claimed,
            &sig_b64,
            &STANDARD.encode(compressed.as_bytes()),
        )
        .unwrap_err();
        assert!(matches!(err, AppError::BadRequest(_)));
    }

    #[test]
    fn rejects_address_pubkey_mismatch() {
        let sk = SigningKey::from_bytes((&[0x44u8; 32]).into()).expect("key");
        let vk = VerifyingKey::from(&sk);
        let compressed = vk.to_encoded_point(true);
        let address = cosmos_address_from_pubkey(compressed.as_bytes(), TERRA_HRP).unwrap();
        let other_sk = SigningKey::from_bytes((&[0x55u8; 32]).into()).expect("key");
        let other_vk = VerifyingKey::from(&other_sk);
        let other_compressed = other_vk.to_encoded_point(true);
        let message = "msg";
        let sig_b64 = sign_adr036(&sk, &address, message);
        let wrong_pubkey_b64 = STANDARD.encode(other_compressed.as_bytes());
        let err = verify_terra(&address, message, &sig_b64, &wrong_pubkey_b64).unwrap_err();
        assert!(matches!(err, AppError::BadRequest(_)));
    }

    #[test]
    fn rejects_malformed_base64_and_lengths() {
        let sk = SigningKey::from_bytes((&[0x33u8; 32]).into()).expect("key");
        let vk = VerifyingKey::from(&sk);
        let compressed = vk.to_encoded_point(true);
        let address = cosmos_address_from_pubkey(compressed.as_bytes(), TERRA_HRP).unwrap();
        let message = "msg";
        let sig_b64 = sign_adr036(&sk, &address, message);
        let pubkey_b64 = STANDARD.encode(compressed.as_bytes());

        assert!(matches!(
            verify_terra(&address, message, "!!!", &pubkey_b64),
            Err(AppError::BadRequest(_))
        ));
        assert!(matches!(
            verify_terra(&address, message, &sig_b64, "!!!"),
            Err(AppError::BadRequest(_))
        ));
        assert!(matches!(
            verify_terra(
                &address,
                message,
                &STANDARD.encode([0u8; 32]),
                &pubkey_b64
            ),
            Err(AppError::BadRequest(_))
        ));
        assert!(matches!(
            verify_terra(
                &address,
                message,
                &sig_b64,
                &STANDARD.encode([0u8; 16])
            ),
            Err(AppError::BadRequest(_))
        ));
    }


    #[test]
    fn node_crypto_vector_verifies() {
        let address = "terra180pg6mvjmyrnld0r4h6gz7274azxhnhd30spzt";
        let message = "CL8Y Terra ADR-036 test";
        let pubkey_b64 = "AjxyrdtP3wmvlPDJTX/pKjhqfnDPih2FkWOGuyU1x7Gx";
        let sig_b64 =
            "0/01aTreuslMDPzmorXdHhRIcZOD9FYkITigc+nOaoEoOdjmnkBFtMcrsDuOqIOGCpYDfi1gwfUP1q1U/3vi0w==";
        verify_terra(address, message, sig_b64, pubkey_b64).unwrap();
    }

    #[test]
    fn escape_amino_handles_amp_lt_gt() {
        let escaped = escape_amino_json_string("A & B <C>");
        assert_eq!(escaped, "A \\u0026 B \\u003cC\\u003e");
    }
}
