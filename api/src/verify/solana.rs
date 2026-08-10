use ed25519_dalek::{Signature, Verifier, VerifyingKey};

use crate::error::{AppError, AppResult};

fn solana_message(message: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(16 + 8 + message.len());
    out.push(0xff);
    out.extend_from_slice(b"solana offchain");
    let len = message.len() as u64;
    out.extend_from_slice(&len.to_le_bytes());
    out.extend_from_slice(message.as_bytes());
    out
}

pub fn verify_solana(expected_pubkey: &str, message: &str, signature_b58: &str) -> AppResult<()> {
    let pubkey_bytes = bs58::decode(expected_pubkey)
        .into_vec()
        .map_err(|_| AppError::BadRequest("invalid Solana pubkey".into()))?;
    if pubkey_bytes.len() != 32 {
        return Err(AppError::BadRequest("invalid Solana pubkey length".into()));
    }

    let sig_bytes = bs58::decode(signature_b58)
        .into_vec()
        .map_err(|_| AppError::BadRequest("invalid Solana signature".into()))?;
    if sig_bytes.len() != 64 {
        return Err(AppError::BadRequest(
            "invalid Solana signature length".into(),
        ));
    }

    let vk = VerifyingKey::try_from(pubkey_bytes.as_slice())
        .map_err(|_| AppError::BadRequest("invalid Solana verifying key".into()))?;
    let sig = Signature::from_slice(&sig_bytes)
        .map_err(|_| AppError::BadRequest("invalid Solana signature".into()))?;

    let payload = solana_message(message);
    vk.verify(&payload, &sig)
        .map_err(|_| AppError::BadRequest("Solana signature verification failed".into()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn solana_offchain_message(message: &str) -> Vec<u8> {
        solana_message(message)
    }

    #[test]
    fn roundtrip_solana_sign_verify() {
        let sk = SigningKey::from_bytes(&[0x42u8; 32]);
        let vk = sk.verifying_key();
        let pubkey_b58 = bs58::encode(vk.as_bytes()).into_string();
        let msg = "CL8Y Solana test";
        let payload = solana_offchain_message(msg);
        let sig = sk.sign(&payload);
        let sig_b58 = bs58::encode(sig.to_bytes()).into_string();
        verify_solana(&pubkey_b58, msg, &sig_b58).unwrap();
    }

    #[test]
    fn rejects_invalid_pubkey_length() {
        let short = bs58::encode([1u8; 16]).into_string();
        let err = verify_solana(&short, "msg", &bs58::encode([0u8; 64]).into_string()).unwrap_err();
        assert!(matches!(err, AppError::BadRequest(_)));
    }

    #[test]
    fn rejects_invalid_signature_length() {
        let sk = SigningKey::from_bytes(&[1u8; 32]);
        let pubkey_b58 = bs58::encode(sk.verifying_key().as_bytes()).into_string();
        let err = verify_solana(&pubkey_b58, "msg", "abc").unwrap_err();
        assert!(matches!(err, AppError::BadRequest(_)));
    }
}
