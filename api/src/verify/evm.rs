use k256::ecdsa::{RecoveryId, Signature, VerifyingKey};
use sha3::{Digest, Keccak256};

use crate::error::{AppError, AppResult};

fn eip191_hash(message: &str) -> [u8; 32] {
    let prefix = format!("\x19Ethereum Signed Message:\n{}", message.len());
    let mut hasher = Keccak256::new();
    hasher.update(prefix.as_bytes());
    hasher.update(message.as_bytes());
    hasher.finalize().into()
}

pub fn verify_evm(expected_address: &str, message: &str, signature_hex: &str) -> AppResult<()> {
    let sig_bytes = hex::decode(signature_hex.trim_start_matches("0x")).map_err(|_| {
        AppError::BadRequest("invalid EVM signature encoding".into())
    })?;
    if sig_bytes.len() != 65 {
        return Err(AppError::BadRequest("EVM signature must be 65 bytes".into()));
    }

    let v = sig_bytes[64];
    let rec_id = if v >= 27 {
        RecoveryId::from_byte(v - 27)
    } else {
        RecoveryId::from_byte(v)
    }
    .ok_or_else(|| AppError::BadRequest("invalid recovery id".into()))?;

    let sig = Signature::from_slice(&sig_bytes[..64])
        .map_err(|_| AppError::BadRequest("invalid signature".into()))?;

    let hash = eip191_hash(message);
    let vk = VerifyingKey::recover_from_prehash(&hash, &sig, rec_id)
        .map_err(|_| AppError::BadRequest("signature recovery failed".into()))?;

    let pubkey_bytes = vk.to_encoded_point(false);
    let pubkey = pubkey_bytes.as_bytes();
    let mut hasher = Keccak256::new();
    hasher.update(&pubkey[1..]);
    let digest: [u8; 32] = hasher.finalize().into();
    let recovered = format!("0x{}", hex::encode(&digest[12..]));

    if recovered != expected_address.to_lowercase() {
        return Err(AppError::BadRequest("signature does not match address".into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use k256::ecdsa::{signature::hazmat::PrehashSigner, SigningKey, VerifyingKey};

    fn address_from_key(key: &SigningKey) -> String {
        let vk = VerifyingKey::from(key);
        let pubkey_bytes = vk.to_encoded_point(false);
        let pubkey = pubkey_bytes.as_bytes();
        let mut hasher = Keccak256::new();
        hasher.update(&pubkey[1..]);
        let digest: [u8; 32] = hasher.finalize().into();
        format!("0x{}", hex::encode(&digest[12..]))
    }

    #[test]
    fn roundtrip_evm_sign_verify() {
        let key = SigningKey::from_slice(&[0x11u8; 32]).unwrap();
        let address = address_from_key(&key);
        let msg = "CL8Y test";
        let hash = eip191_hash(msg);
        let (sig, recid) = key.sign_prehash_recoverable(&hash).unwrap();
        let mut bytes = [0u8; 65];
        bytes[..64].copy_from_slice(&sig.to_bytes());
        bytes[64] = recid.to_byte() + 27;
        let sig_hex = format!("0x{}", hex::encode(bytes));
        verify_evm(&address, msg, &sig_hex).unwrap();
    }
}
