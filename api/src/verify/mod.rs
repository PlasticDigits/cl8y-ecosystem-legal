mod evm;
mod solana;
mod terra;

use serde::Deserialize;
use serde_json::Value;

use crate::error::{AppError, AppResult};

pub use evm::verify_evm;
pub use solana::verify_solana;
pub use terra::verify_terra;

#[derive(Debug, Deserialize)]
pub struct WalletProof {
    #[serde(rename = "type")]
    pub proof_type: String,
    pub signature: String,
    #[serde(default)]
    pub pubkey: Option<String>,
}

pub fn verify_wallet_signature(
    network: &str,
    account_id: &str,
    message: &str,
    proof: &Value,
) -> AppResult<()> {
    let proof: WalletProof = serde_json::from_value(proof.clone())
        .map_err(|_| AppError::BadRequest("invalid proof JSON".into()))?;

    match network.to_uppercase().as_str() {
        "EVM" => verify_evm(account_id, message, &proof.signature),
        "SOLANA" => verify_solana(account_id, message, &proof.signature),
        "TERRA_CLASSIC" => {
            let pubkey = proof.pubkey.as_deref().ok_or_else(|| {
                AppError::BadRequest("terra proof requires pubkey".into())
            })?;
            verify_terra(account_id, message, &proof.signature, pubkey)
        }
        other => Err(AppError::BadRequest(format!("unsupported network: {other}"))),
    }
}
