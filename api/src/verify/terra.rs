use base64::{engine::general_purpose::STANDARD, Engine};
use bech32::{encode, ToBase32, Variant};
use k256::ecdsa::{signature::Verifier, Signature, VerifyingKey};
use ripemd::Ripemd160;
use sha2::{Digest, Sha256};

use crate::error::{AppError, AppResult};

fn cosmos_address_from_pubkey(compressed_pubkey: &[u8], hrp: &str) -> AppResult<String> {
    let digest = Sha256::digest(compressed_pubkey);
    let rip = Ripemd160::digest(digest);
    encode(hrp, rip.to_base32(), Variant::Bech32)
        .map_err(|_| AppError::BadRequest("bech32 encode failed".into()))
}

/// Verify ADR-036 style signArbitrary: signature and pubkey are base64.
pub fn verify_terra(
    expected_address: &str,
    message: &str,
    signature_b64: &str,
    pubkey_b64: &str,
) -> AppResult<()> {
    let hrp = expected_address
        .split_once('1')
        .map(|(p, _)| p)
        .ok_or_else(|| AppError::BadRequest("invalid bech32 address".into()))?;

    let sig_bytes = STANDARD
        .decode(signature_b64)
        .map_err(|_| AppError::BadRequest("invalid terra signature base64".into()))?;
    let pubkey_bytes = STANDARD
        .decode(pubkey_b64)
        .map_err(|_| AppError::BadRequest("invalid terra pubkey base64".into()))?;

    let vk = VerifyingKey::from_sec1_bytes(&pubkey_bytes)
        .map_err(|_| AppError::BadRequest("invalid terra pubkey".into()))?;
    let sig = Signature::from_slice(&sig_bytes)
        .map_err(|_| AppError::BadRequest("invalid terra signature".into()))?;

    vk.verify(message.as_bytes(), &sig)
        .map_err(|_| AppError::BadRequest("terra signature verification failed".into()))?;

    let compressed = vk.to_encoded_point(true);
    let derived = cosmos_address_from_pubkey(compressed.as_bytes(), hrp)?;

    if derived != expected_address {
        return Err(AppError::BadRequest(
            "terra pubkey does not match address".into(),
        ));
    }
    Ok(())
}
