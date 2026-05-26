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
        return Err(AppError::BadRequest("invalid Solana signature length".into()));
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
